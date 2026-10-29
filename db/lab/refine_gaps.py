"""Stage 6 of a refine_deepseek.py run: fix searches that were judged wrong, then audit everything this run added.

A. Gap fixing: every stage-5 training query labelled wrong (its top food is not what was meant) is shown to deepseek
   with the resolver's top 8 candidates. If deepseek names one of them as the right food, the query itself is
   proposed as a synonym of that food, then goes through the stage-2 guards and verification. Typos and odd
   phrasings are filtered by the verification ("a name people commonly use").
B. Effect: the fixed queries are resolved again to count how many now land on the chosen food; every synonym this
   run added is checked for whether its own term now finds its food.
C. Audit of additions: every synonym added by this run is audited with the stage-1 prompts; ones both passes call
   wrong are removed again, the rest of the first-pass flags are listed in the report for a person to look at.

  python db\\lab\\refine_gaps.py <run_id>
"""
from __future__ import annotations

import json
import random
import time
from concurrent.futures import ThreadPoolExecutor

import refine_deepseek as r

PICK = ("Each item is a search typed into a nutrition app and the foods the database offered for it. The first one was "
        "judged not to be what the person meant.\n{listing}\n\n"
        "For each item, which listed food is what the person most likely meant? Any ordinary preparation is fine unless the "
        "search asked for one; a search naming a dish, product, brand or variant wants that. Answer none if no listed food "
        "is right.\n\nReply one line per item, in order, exactly: <number>. <letter>   or   <number>. none")


def top_is(item):
    term, fdc = item
    try:
        row = r.tdb().execute("SELECT fdc_id FROM resolve_food(%s, 1)", (term,)).fetchone()
        return bool(row and row[0] == fdc)
    except Exception:  # noqa: BLE001
        r._local.db = None
        return False


def main():
    if r.load("stage6_done.json"):
        r.say("stage 6 already done")
        return
    db = r.ts.connect()
    lines = ["", "", "## 7. Fixing searches that were judged wrong"]
    data = r.load("stage5_dataset.json") or []
    wrong = [d for d in data if d["label"] == 0 and len(d["rows"]) > 1]
    r.say(f"stage 6: {len(wrong):,} judged-wrong queries with alternatives to choose from")
    picks = r.load("stage6_picks.json") or {}
    todo = [d for d in wrong if d["query"] not in picks]
    random.Random(9).shuffle(todo)
    letters = "abcdefgh"
    chunks = [todo[i:i + 8] for i in range(0, len(todo), 8)]
    for k in range(0, len(chunks), 20):
        group = chunks[k:k + 20]
        prompts = []
        for c in group:
            ls = []
            for i, d in enumerate(c):
                ls.append(f'{i + 1}. search "{d["query"]}"')
                ls += [f"   {letters[j]}) {row['description'][:85]}" for j, row in enumerate(d["rows"][:8])]
            prompts.append(PICK.replace("{listing}", "\n".join(ls)))
        answers, exhausted = r.run_parallel(prompts, lambda t: r.numbered(t, r"\(?([a-h]|none)\)?\b"))
        for c, a in zip(group, answers):
            if a is None:
                continue
            for i, d in enumerate(c):
                m = a.get(i + 1)
                if m:
                    v = m[0].lower()
                    idx = letters.index(v) if v != "none" else -1
                    picks[d["query"]] = d["rows"][idx]["fdc_id"] if 0 < idx < len(d["rows"]) else None   # index 0 was judged wrong
        r.save("stage6_picks.json", picks)
        r.say(f"  picks for {len(picks):,}/{len(wrong):,}; tokens {r.budget.used:,}")
        if exhausted:
            r.say("  budget reached during picks")
            break
    desc = {}
    for d in wrong:
        for row in d["rows"]:
            desc[row["fdc_id"]] = row["description"]
    chosen, skips = [], []
    for q, f in picks.items():
        t = r.clean_term(q)
        if f is None:
            skips.append((None, q, "skip_gap_none"))
        elif t is None:
            skips.append((f, q, "skip_gap_bad_term"))
        else:
            chosen.append((f, t, desc[f]))
    with ThreadPoolExecutor(r.WORKERS) as ex:
        verdicts = list(ex.map(r.guard, chosen))
    skips += [(f, t, "skip_gap_" + v[5:]) for (f, t, _), v in zip(chosen, verdicts) if v]
    survivors = [x for x, v in zip(chosen, verdicts) if not v]
    chunks = [survivors[i:i + 30] for i in range(0, len(survivors), 30)]
    prompts = [r.VERIFY.replace("{listing}", "\n".join(f'{i + 1}. food: {d[:90]} | term: "{t}"' for i, (_, t, d) in enumerate(c))) for c in chunks]
    answers, _ = r.run_parallel(prompts, lambda txt: r.numbered(txt, r"(yes|no)\b"))
    accepted = []
    for c, a in zip(chunks, answers):
        for i, x in enumerate(c):
            m = (a or {}).get(i + 1)
            (accepted if m and m[0].lower() == "yes" else skips).append(x if m and m[0].lower() == "yes" else (x[0], x[1], "skip_gap_not_verified"))
    added_rows = []
    with db.transaction():
        for f, t, d in accepted:
            row = db.execute("""INSERT INTO food_synonym (fdc_id, term, origin, weight, is_bare_noun, rated_by, rated_at)
                                VALUES (%s, %s, 'deepseek-refine', 1.0, false, %s, now())
                                ON CONFLICT (fdc_id, term) DO NOTHING RETURNING id""", (f, t, f"{r.MODEL}/{r.RUN_ID}/stage6")).fetchone()
            if row:
                added_rows.append((f, t, d))
                db.execute("INSERT INTO refine_log (run_id, action, fdc_id, term, detail) VALUES (%s, 'add_synonym', %s, %s, %s)",
                           (r.RUN_ID, f, t, json.dumps({"synonym_id": row[0], "food": d, "stage": 6, "from": "judged-wrong search"})))
        for f, t, why in skips:
            db.execute("INSERT INTO refine_log (run_id, action, fdc_id, term) VALUES (%s, %s, %s, %s)", (r.RUN_ID, why, f, t))
        db.execute("DELETE FROM food_synonym_key")
        db.execute("INSERT INTO food_synonym_key SELECT DISTINCT name_key(term) AS key, fdc_id FROM food_synonym WHERE name_key(term) <> ''")
    counts = {}
    for _, _, why in skips:
        counts[why] = counts.get(why, 0) + 1
    with ThreadPoolExecutor(r.WORKERS) as ex:
        fixed = sum(ex.map(top_is, [(t, f) for f, t, _ in added_rows]))
    r.say(f"stage 6: {len(picks):,} picks; added {len(added_rows):,} synonyms from judged-wrong searches, {fixed:,} of those searches now "
          f"return the chosen food; skipped {counts}")
    lines.append(f"{len(wrong):,} searches were judged wrong; deepseek found the right food among the candidates for "
                 f"{sum(1 for v in picks.values() if v):,}. After guards and verification {len(added_rows):,} searches were added as "
                 f"synonyms, and **{fixed:,} of them now return the chosen food**. Skipped: {json.dumps(counts)}")
    lines += ["", "Sample (search -> food it now finds):"] + [f"- {t} -> {d[:80]}" for f, t, d in random.Random(4).sample(added_rows, min(30, len(added_rows)))]

    # B. does every added synonym's own term find its food?
    added_all = db.execute("SELECT term, fdc_id FROM refine_log WHERE run_id = %s AND action = 'add_synonym' "
                           "AND (detail->>'synonym_id')::bigint IN (SELECT id FROM food_synonym)", (r.RUN_ID,)).fetchall()
    with ThreadPoolExecutor(r.WORKERS) as ex:
        found = sum(ex.map(top_is, [(t, f) for t, f in added_all]))
    lines += ["", f"Of all {len(added_all):,} synonyms this run added, **{found:,} now make their own term return that food** "
                  "(each was checked beforehand not to do so already)."]
    r.say(f"stage 6: {found:,}/{len(added_all):,} added terms now find their food")

    # C. audit everything this run added
    rows = db.execute("""SELECT s.id, s.fdc_id, s.term, s.origin, f.description FROM food_synonym s JOIN food f USING (fdc_id)
                         WHERE s.origin = 'deepseek-refine' AND s.rated_by LIKE %s""", (f"%{r.RUN_ID}%",)).fetchall()
    rows = list(rows)
    random.Random(10).shuffle(rows)
    chunks = [rows[i:i + 20] for i in range(0, len(rows), 20)]
    prompts = [r.AUDIT.replace("{listing}", "\n".join(f'{i + 1}. food: {x[4][:85]} | term: "{x[2]}"' for i, x in enumerate(c))) for c in chunks]
    answers, _ = r.run_parallel(prompts, lambda t: r.numbered(t, r"(ok|bad)\b[ \t]*[-:]?[ \t]*(.*)$"))
    flagged = []
    for c, a in zip(chunks, answers):
        for i, x in enumerate(c):
            m = (a or {}).get(i + 1)
            if m and m[0].lower() == "bad":
                flagged.append((x, (m[1] or "").strip()))
    chunks = [flagged[i:i + 20] for i in range(0, len(flagged), 20)]
    prompts = [r.CONFIRM.replace("{listing}", "\n".join(f'{i + 1}. term: "{x[2]}" -> food: {x[4][:85]}' for i, (x, _) in enumerate(c))) for c in chunks]
    answers, _ = r.run_parallel(prompts, lambda t: r.numbered(t, r"(fine|mistake)\b[ \t]*[-:]?[ \t]*(.*)$"))
    confirmed, listed = [], []
    for c, a in zip(chunks, answers):
        for i, (x, why) in enumerate(c):
            m = (a or {}).get(i + 1)
            (confirmed if m and m[0].lower() == "mistake" else listed).append((x, why))
    with db.transaction():
        ids = [x[0] for x, _ in confirmed]
        if ids:
            db.execute("""WITH gone AS (DELETE FROM food_synonym WHERE id = ANY(%s) RETURNING *)
                          INSERT INTO food_synonym_removed SELECT gone.*, now() FROM gone""", (ids,))
            for x, why in confirmed:
                db.execute("INSERT INTO refine_log (run_id, action, fdc_id, term, detail) VALUES (%s, 'remove_synonym', %s, %s, %s)",
                           (r.RUN_ID, x[1], x[2], json.dumps({"synonym_id": x[0], "origin": x[3], "food": x[4], "audit": why,
                                                               "note": "added earlier in this run, removed by the final audit"})))
            db.execute("DELETE FROM food_synonym_key")
            db.execute("INSERT INTO food_synonym_key SELECT DISTINCT name_key(term) AS key, fdc_id FROM food_synonym WHERE name_key(term) <> ''")
    r.say(f"stage 6: audited {len(rows):,} added synonyms; {len(flagged):,} flagged, {len(confirmed):,} confirmed and removed")
    lines += ["", "## 8. Audit of everything this run added",
              f"{len(rows):,} added synonyms audited; {len(flagged):,} flagged by the first pass, {len(confirmed):,} confirmed by the second and "
              f"removed again. The other first-pass flags, for a person to look at (term | food | why):"]
    lines += [f"- {x[2]} | {x[4][:70]} | {why}" for x, why in listed]
    lines += ["", f"Tokens after stage 6: {r.budget.used:,}"]
    with (r.WORK / "report.md").open("a", encoding="utf8") as fh:
        fh.write("\n".join(lines) + "\n")
    r.save("stage6_done.json", {"picks": len(picks), "added": len(added_rows), "fixed": fixed, "audited": len(rows),
                                "flagged": len(flagged), "removed": len(confirmed), "skipped": counts})
    (r.WORK / "DONE6").write_text(time.strftime("%Y-%m-%d %H:%M:%S"), encoding="utf8")


if __name__ == "__main__":
    r.ts.load_env()
    try:
        main()
    except Exception:  # noqa: BLE001
        import traceback
        r.say("stage 6 CRASHED:\n" + traceback.format_exc())
        (r.WORK / "DONE6").write_text("crashed", encoding="utf8")
