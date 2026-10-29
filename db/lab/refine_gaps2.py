"""Stage 7 of a refine_deepseek.py run: more fixes for searches judged wrong, until the budget runs out.

A. Stage-6 picks that the name-oriented verification rejected are re-checked with a search-oriented question
   ("should a search for exactly this text return this food?"), since they are search phrases, not names.
B. Searches whose right food was not in the resolver's top 8: deepseek looks at candidates 9-20.
Both go through the stage-2 guards; additions are logged like every other stage.

  python db\\lab\\refine_gaps2.py <run_id>
"""
from __future__ import annotations

import json
import random
import time
from concurrent.futures import ThreadPoolExecutor

import refine_deepseek as r
from refine_gaps import top_is

SEARCH_OK = ("Each line is a search typed into a nutrition app and a food it could return.\n{listing}\n\n"
             "For each line: should a search for exactly that text return this food, giving the person the nutrition they "
             "wanted? Small typos in the search are fine. Answer no if the food is a different food, a dish or product the "
             "searched food is only part of, or a variant the search did not ask for.\n\n"
             "Reply one line per item, in order, exactly: <number>. yes or <number>. no")
DEEPER = ("Each item is a search typed into a nutrition app and more foods from the database further down its results "
          "(the top results were judged wrong).\n{listing}\n\n"
          "For each item, is one of these foods what the person most likely meant? Any ordinary preparation is fine unless "
          "the search asked for one; a search naming a dish, product, brand or variant wants that.\n\n"
          "Reply one line per item, in order, exactly: <number>. <letter>   or   <number>. none")


def deeper_rows(q):
    try:
        rows = r.tdb().execute("SELECT fdc_id, description FROM resolve_food(%s, 20)", (q,)).fetchall()
        return rows[8:]
    except Exception:  # noqa: BLE001
        r._local.db = None
        return []


def add(db, items, stage, note):
    added = []
    with db.transaction():
        for f, t, d in items:
            row = db.execute("""INSERT INTO food_synonym (fdc_id, term, origin, weight, is_bare_noun, rated_by, rated_at)
                                VALUES (%s, %s, 'deepseek-refine', 1.0, false, %s, now())
                                ON CONFLICT (fdc_id, term) DO NOTHING RETURNING id""", (f, t, f"{r.MODEL}/{r.RUN_ID}/stage7")).fetchone()
            if row:
                added.append((f, t, d))
                db.execute("INSERT INTO refine_log (run_id, action, fdc_id, term, detail) VALUES (%s, 'add_synonym', %s, %s, %s)",
                           (r.RUN_ID, f, t, json.dumps({"synonym_id": row[0], "food": d, "stage": stage, "from": note})))
        db.execute("DELETE FROM food_synonym_key")
        db.execute("INSERT INTO food_synonym_key SELECT DISTINCT name_key(term) AS key, fdc_id FROM food_synonym WHERE name_key(term) <> ''")
    return added


def search_check(items):
    chunks = [items[i:i + 30] for i in range(0, len(items), 30)]
    prompts = [SEARCH_OK.replace("{listing}", "\n".join(f'{i + 1}. search "{t}" -> food: {d[:90]}' for i, (_, t, d) in enumerate(c))) for c in chunks]
    answers, _ = r.run_parallel(prompts, lambda txt: r.numbered(txt, r"(yes|no)\b"))
    ok = []
    for c, a in zip(chunks, answers):
        for i, x in enumerate(c):
            m = (a or {}).get(i + 1)
            if m and m[0].lower() == "yes":
                ok.append(x)
    return ok


def main():
    if r.load("stage7_done.json"):
        r.say("stage 7 already done")
        return
    db = r.ts.connect()
    # A. re-check stage-6 picks the name-oriented verification rejected
    rej = db.execute("""SELECT l.fdc_id, l.term, f.description FROM refine_log l JOIN food f USING (fdc_id)
                        WHERE l.run_id = %s AND l.action = 'skip_gap_not_verified'""", (r.RUN_ID,)).fetchall()
    with ThreadPoolExecutor(r.WORKERS) as ex:
        verdicts = list(ex.map(r.guard, rej))
    ok = search_check([x for x, v in zip(rej, verdicts) if not v])
    added_a = add(db, ok, 7, "judged-wrong search, re-checked as a search")
    r.say(f"stage 7A: {len(rej):,} rejected picks re-checked as searches; added {len(added_a):,}")

    # B. look deeper for searches with no right food in the top 8
    nones = [t for (t,) in db.execute("SELECT term FROM refine_log WHERE run_id = %s AND action = 'skip_gap_none'", (r.RUN_ID,)).fetchall()]
    random.Random(12).shuffle(nones)
    with ThreadPoolExecutor(r.WORKERS) as ex:
        deeper = list(ex.map(deeper_rows, nones))
    items = [(q, rows) for q, rows in zip(nones, deeper) if rows]
    letters = "abcdefghijkl"
    chosen = []
    chunks = [items[i:i + 8] for i in range(0, len(items), 8)]
    for k in range(0, len(chunks), 20):
        group = chunks[k:k + 20]
        prompts = []
        for c in group:
            ls = []
            for i, (q, rows) in enumerate(c):
                ls.append(f'{i + 1}. search "{q}"')
                ls += [f"   {letters[j]}) {d[:85]}" for j, (_, d) in enumerate(rows[:12])]
            prompts.append(DEEPER.replace("{listing}", "\n".join(ls)))
        answers, exhausted = r.run_parallel(prompts, lambda t: r.numbered(t, r"\(?([a-l]|none)\)?\b"))
        for c, a in zip(group, answers):
            for i, (q, rows) in enumerate(c):
                m = (a or {}).get(i + 1)
                if m and m[0].lower() != "none" and letters.index(m[0].lower()) < len(rows):
                    f, d = rows[letters.index(m[0].lower())]
                    t = r.clean_term(q)
                    if t:
                        chosen.append((f, t, d))
        r.say(f"  deeper picks: {min((k + 20) * 8, len(items)):,}/{len(items):,} searches looked at, {len(chosen):,} matches; tokens {r.budget.used:,}")
        if exhausted:
            r.say("  budget reached")
            break
    with ThreadPoolExecutor(r.WORKERS) as ex:
        verdicts = list(ex.map(r.guard, chosen))
    ok = search_check([x for x, v in zip(chosen, verdicts) if not v])
    added_b = add(db, ok, 7, "judged-wrong search, right food found below the top 8")
    with ThreadPoolExecutor(r.WORKERS) as ex:
        fixed = sum(ex.map(top_is, [(t, f) for f, t, _ in added_a + added_b]))
    r.say(f"stage 7B: {len(chosen):,} deeper matches; added {len(added_b):,}; of all stage-7 additions {fixed:,} now return their food")
    lines = ["", "", "## 9. More fixes for searches judged wrong",
             f"A. {len(rej):,} stage-6 picks the name check rejected, re-checked as searches: {len(added_a):,} added.",
             f"B. {len(items):,} searches with no right food in the top 8: deepseek found it in candidates 9-20 for {len(chosen):,}; "
             f"{len(added_b):,} added after guards and the search check.",
             f"**{fixed:,} of the {len(added_a) + len(added_b):,} stage-7 additions now return their food.**", "", "Sample (search -> food):"]
    lines += [f"- {t} -> {d[:80]}" for f, t, d in random.Random(5).sample(added_a + added_b, min(30, len(added_a) + len(added_b)))]
    lines += ["", f"Tokens after stage 7: {r.budget.used:,}"]
    with (r.WORK / "report.md").open("a", encoding="utf8") as fh:
        fh.write("\n".join(lines) + "\n")
    r.save("stage7_done.json", {"added_a": len(added_a), "added_b": len(added_b), "fixed": fixed})
    (r.WORK / "DONE7").write_text(time.strftime("%Y-%m-%d %H:%M:%S"), encoding="utf8")


if __name__ == "__main__":
    r.ts.load_env()
    try:
        main()
    except Exception:  # noqa: BLE001
        import traceback
        r.say("stage 7 CRASHED:\n" + traceback.format_exc())
        (r.WORK / "DONE7").write_text("crashed", encoding="utf8")
