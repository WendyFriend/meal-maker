"""Stage 4 of a refine_deepseek.py run: terms deepseek proposed for several foods at once.

Stage 2 dropped any term proposed for more than one food (adding it to all of them would make it ambiguous).
Here, for each such term that the resolver does not already answer with one of those foods (confident or
probable), deepseek picks the single food a search for the term should return by default; the pick then
goes through the same guards and verification as stage 2. Same run id, same token budget, same refine_log.

  python db\\lab\\refine_ambiguous.py <run_id>
"""
from __future__ import annotations

import json
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor

import refine_deepseek as r   # sys.argv[1] is the run id it reads

CHOOSE = ("For each search term below, several foods in a nutrition database could match. Which ONE should a search for "
          "exactly this term return by default: the food most people typing it mean, usually the plain and most commonly "
          "eaten form rather than a special variant, unless the term itself names the variant.\n{listing}\n\n"
          "Reply one line per term, in order, exactly: <number>. <letter>   or   <number>. none   (none when the term does "
          "not clearly mean any of these foods).")


def current_top(term):
    try:
        row = r.tdb().execute("SELECT fdc_id, tier FROM resolve_food(%s, 1)", (term,)).fetchone()
        return row
    except Exception:  # noqa: BLE001
        r._local.db = None
        return None


def main():
    if r.load("stage4_done.json"):
        r.say("stage 4 already done")
        return
    db = r.ts.connect()
    props = r.load("stage2_props.json") or {}
    owners = {}
    for fdc, terms in props.items():
        for t in terms:
            owners.setdefault(t, set()).add(int(fdc))
    amb = {t: sorted(f) for t, f in owners.items() if len(f) > 1}
    desc = dict(db.execute("SELECT fdc_id, description FROM food WHERE fdc_id = ANY(%s)",
                           (sorted({f for fs in amb.values() for f in fs}),)).fetchall())
    terms = sorted(amb)
    with ThreadPoolExecutor(r.WORKERS) as ex:
        tops = list(ex.map(current_top, terms))
    skips, ask = [], []
    for t, top in zip(terms, tops):
        if top and top[0] in amb[t] and top[1] in ("confident", "probable"):
            skips.append((top[0], t, "skip_amb_already_ok"))
        else:
            ask.append(t)
    r.say(f"stage 4: {len(terms):,} terms proposed for several foods; {len(ask):,} need a pick, {len(skips):,} already resolve to one of them")
    picks = r.load("stage4_picks.json") or {}
    todo = [t for t in ask if t not in picks]
    letters = "abcdefghij"
    chunks = [todo[i:i + 8] for i in range(0, len(todo), 8)]
    for k in range(0, len(chunks), 20):
        group = chunks[k:k + 20]
        prompts = []
        for c in group:
            lines = []
            for i, t in enumerate(c):
                lines.append(f'{i + 1}. term: "{t}"')
                lines += [f"   {letters[j]}) {desc[f][:90]}" for j, f in enumerate(amb[t][:10])]
            prompts.append(CHOOSE.replace("{listing}", "\n".join(lines)))
        answers, exhausted = r.run_parallel(prompts, lambda txt: r.numbered(txt, r"\(?([a-j]|none)\)?\b"))
        for c, a in zip(group, answers):
            if a is None:
                continue
            for i, t in enumerate(c):
                m = a.get(i + 1)
                if m:
                    v = m[0].lower()
                    picks[t] = None if v == "none" else (amb[t][letters.index(v)] if letters.index(v) < len(amb[t]) else None)
        r.save("stage4_picks.json", picks)
        r.say(f"  picks for {len(picks):,}/{len(ask):,} terms; tokens {r.budget.used:,}")
        if exhausted:
            r.say("  budget reached during picks")
            break
    chosen = [(f, t, desc[f]) for t, f in picks.items() if f]
    skips += [(None, t, "skip_amb_none") for t, f in picks.items() if not f]
    with ThreadPoolExecutor(r.WORKERS) as ex:
        verdicts = list(ex.map(r.guard, chosen))
    skips += [(f, t, "skip_amb_" + v[5:]) for (f, t, _), v in zip(chosen, verdicts) if v]
    survivors = [x for x, v in zip(chosen, verdicts) if not v]
    chunks = [survivors[i:i + 30] for i in range(0, len(survivors), 30)]
    prompts = [r.VERIFY.replace("{listing}", "\n".join(f'{i + 1}. food: {d[:90]} | term: "{t}"' for i, (_, t, d) in enumerate(c))) for c in chunks]
    answers, _ = r.run_parallel(prompts, lambda txt: r.numbered(txt, r"(yes|no)\b"))
    accepted = []
    for c, a in zip(chunks, answers):
        for i, x in enumerate(c):
            m = a.get(i + 1) if a else None
            if m and m[0].lower() == "yes":
                accepted.append(x)
            else:
                skips.append((x[0], x[1], "skip_amb_not_verified"))
    added = 0
    with db.transaction():
        for f, t, d in accepted:
            row = db.execute("""INSERT INTO food_synonym (fdc_id, term, origin, weight, is_bare_noun, rated_by, rated_at)
                                VALUES (%s, %s, 'deepseek-refine', 1.0, false, %s, now())
                                ON CONFLICT (fdc_id, term) DO NOTHING RETURNING id""", (f, t, f"{r.MODEL}/{r.RUN_ID}/stage4")).fetchone()
            if row:
                added += 1
                db.execute("INSERT INTO refine_log (run_id, action, fdc_id, term, detail) VALUES (%s, 'add_synonym', %s, %s, %s)",
                           (r.RUN_ID, f, t, json.dumps({"synonym_id": row[0], "food": d, "stage": 4, "candidates": len(amb[t])})))
        for f, t, why in skips:
            db.execute("INSERT INTO refine_log (run_id, action, fdc_id, term) VALUES (%s, %s, %s, %s)", (r.RUN_ID, why, f, t))
        db.execute("DELETE FROM food_synonym_key")
        db.execute("INSERT INTO food_synonym_key SELECT DISTINCT name_key(term) AS key, fdc_id FROM food_synonym WHERE name_key(term) <> ''")
    counts = {}
    for _, _, why in skips:
        counts[why] = counts.get(why, 0) + 1
    r.say(f"stage 4: added {added:,} synonyms; skipped {counts}")
    sample = db.execute("""SELECT term, detail->>'food' FROM refine_log WHERE run_id = %s AND action = 'add_synonym'
                           AND detail->>'stage' = '4' ORDER BY random() LIMIT 40""", (r.RUN_ID,)).fetchall()
    with (r.WORK / "report.md").open("a", encoding="utf8") as fh:
        fh.write("\n\n## 4. Terms proposed for several foods\n")
        fh.write(json.dumps({"terms": len(terms), "asked": len(ask), "added": added, "skipped": counts}) + "\n\nSample (term | food):\n")
        fh.write("\n".join(f"- {t} | {d[:80]}" for t, d in sample) + "\n")
        fh.write(f"\nTokens after stage 4: {r.budget.used:,}\n")
    r.save("stage4_done.json", {"added": added, "skipped": counts})
    (r.WORK / "DONE4").write_text(time.strftime("%Y-%m-%d %H:%M:%S"), encoding="utf8")


if __name__ == "__main__":
    r.ts.load_env()
    try:
        main()
    except Exception:  # noqa: BLE001
        import traceback
        r.say("stage 4 CRASHED:\n" + traceback.format_exc())
        (r.WORK / "DONE4").write_text("crashed", encoding="utf8")
