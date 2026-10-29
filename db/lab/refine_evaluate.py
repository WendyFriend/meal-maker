"""Stage 5 of a refine_deepseek.py run: did the refinement make search better, and refresh the confidence model.

A. Before/after: every evaluator query from before the run (scratchpad conf_data_with_ds.json) is resolved again;
   where the top food changed, deepseek compares old and new side by side twice, with the order swapped. Only a
   preference both orders agree on counts.
B. Hand-labelled queries whose answer changed are listed for a person to check (report).
C. Confidence: the stage-3 training queries are resolved again; the few whose top food changed are relabelled
   (two passes, a third breaking ties); train_confidence.py retrains; installed only if not worse on the hold-out.

  python db\\lab\\refine_evaluate.py <run_id>
"""
from __future__ import annotations

import json
import random
import shutil
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor

import refine_deepseek as r

PAIR = ("Each item is a search typed into a nutrition app and two possible top results, A and B.\n{listing}\n\n"
        "For each item, which result is what the person most likely meant? Any ordinary preparation of the food is fine "
        "unless the search asked for one; a search naming a dish, product, brand or variant wants that dish, product, brand "
        "or variant; a variant the search did not ask for (fortified, imitation, flavoured, reduced fat, baby food, a "
        "different cut or kind) is worse; a different food is worse.\n\n"
        "Reply one line per item, in order, exactly: <number>. A   or   <number>. B   or   <number>. same")


def pair_pass(items, old_first):
    chunks = [list(range(len(items)))[i:i + 25] for i in range(0, len(items), 25)]
    prompts = []
    for c in chunks:
        lines = []
        for i, j in enumerate(c):
            it = items[j]
            a, b = (it["old"], it["new"]) if old_first else (it["new"], it["old"])
            lines.append(f'{i + 1}. search "{it["query"]}"\n   A: {a[:90]}\n   B: {b[:90]}')
        prompts.append(PAIR.replace("{listing}", "\n".join(lines)))
    answers, _ = r.run_parallel(prompts, lambda t: r.numbered(t, r"(a|b|same)\b"))
    out = [None] * len(items)
    for c, ans in zip(chunks, answers):
        for i, j in enumerate(c):
            m = (ans or {}).get(i + 1)
            if m:
                v = m[0].lower()
                out[j] = "same" if v == "same" else ("old" if (v == "a") == old_first else "new")
    return out


def main():
    if r.load("stage5_done.json"):
        r.say("stage 5 already done")
        return
    lines = ["", "", "## 5. Did search get better? (evaluator queries, before the run vs now)"]
    old = json.loads((r.SCRATCH / "conf_data_with_ds.json").read_text(encoding="utf8"))
    with ThreadPoolExecutor(r.WORKERS) as ex:
        now = list(ex.map(r.resolve_one, [d["query"] for d in old]))
    changed = [{"query": d["query"], "old": d["cand"][0]["desc"], "new": n[0]["description"], "old_fdc": d["cand"][0]["fdc"], "new_fdc": n[0]["fdc_id"]}
               for d, n in zip(old, now) if n and n[0]["fdc_id"] != d["cand"][0]["fdc"]]
    r.say(f"stage 5: {len(changed):,} of {len(old):,} evaluator queries now return a different top food")
    p1 = pair_pass(changed, True)
    p2 = pair_pass(changed, False)
    verdict = []
    for it, a, b in zip(changed, p1, p2):
        v = a if a == b and a in ("old", "new") else "unclear"
        verdict.append(v)
        it["verdict"] = v
    better, worse, unclear = verdict.count("new"), verdict.count("old"), verdict.count("unclear")
    r.save("stage5_changes.json", changed)
    r.say(f"stage 5: new answer better {better:,}, old better {worse:,}, unclear/same {unclear:,}")
    lines.append(f"{len(changed):,} of {len(old):,} queries changed their top food. deepseek, comparing old and new with the order "
                 f"swapped and counting only agreement: **new better {better:,}, old better {worse:,}, unclear or same {unclear:,}.**")
    rnd = random.Random(3)
    for label, key in (("Got worse (all)" if worse <= 40 else "Got worse (sample of 40)", "old"), ("Got better (sample of 30)", "new")):
        sel = [c for c in changed if c["verdict"] == key]
        sel = sel if (key == "old" and len(sel) <= 40) else rnd.sample(sel, min(len(sel), 40 if key == "old" else 30))
        lines += ["", f"{label}:"] + [f"- {c['query']}: {c['old'][:55]}  ->  {c['new'][:55]}" for c in sel]

    # B. hand-labelled queries that changed
    hand = json.loads((r.SCRATCH / "hand_data.json").read_text(encoding="utf8"))
    blind = json.loads((r.SCRATCH / "blind_sample.json").read_text(encoding="utf8"))
    hq = [(h["query"], h["cand"][0]["desc"], h["cand"][0]["fdc"]) for h in hand + blind]
    with ThreadPoolExecutor(r.WORKERS) as ex:
        hnow = list(ex.map(r.resolve_one, [q for q, _, _ in hq]))
    hchg = [(q, o, n[0]["description"]) for (q, o, f), n in zip(hq, hnow) if n and n[0]["fdc_id"] != f]
    lines += ["", f"Hand-labelled queries whose answer changed ({len(hchg)} of {len(hq)}):"] + [f"- {q}: {o[:55]}  ->  {n[:55]}" for q, o, n in hchg]
    r.save("stage5_hand_changes.json", hchg)

    # C. refresh the confidence model on the final database
    data = r.load("stage3_dataset.json") or []
    with ThreadPoolExecutor(r.WORKERS) as ex:
        rows = list(ex.map(r.resolve_one, [d["query"] for d in data]))
    moved = [i for i, (d, rw) in enumerate(zip(data, rows)) if rw and rw[0]["fdc_id"] != d["rows"][0]["fdc_id"]]
    items = [{"query": data[i]["query"], "rows": rows[i]} for i in moved]
    la, _ = r.label_pass(items, 44)
    lb, _ = r.label_pass(items, 55)
    split = [k for k, (a, b) in enumerate(zip(la, lb)) if a is not None and b is not None and a != b]
    lc, _ = r.label_pass([items[k] for k in split], 66) if split else ([], False)
    tie = {k: v for k, v in zip(split, lc)}
    fresh = []
    for i, (d, rw) in enumerate(zip(data, rows)):
        if not rw:
            continue
        if i in moved:
            k = moved.index(i)
            a, b = la[k], lb[k]
            lab = a if (a is not None and a == b) else tie.get(k)
            if lab is None:
                continue
            fresh.append({"query": d["query"], "rows": rw, "label": lab})
        else:
            fresh.append({"query": d["query"], "rows": rw, "label": d["label"]})
    r.save("stage5_dataset.json", fresh)
    hold = r.load("stage3_holdout.json") or []
    with ThreadPoolExecutor(r.WORKERS) as ex:
        hrows = list(ex.map(r.resolve_one, [h["query"] for h in hold]))
    r.save("stage5_holdout.json", [dict(h, rows=hr) for h, hr in zip(hold, hrows) if hr])
    current = r.HERE / "confidence_model.json"
    cand = r.WORK / "confidence_model.stage5.json"
    parity = r.WORK / "parity_cases_stage5.json"
    tr = subprocess.run([r.VENV_PY, str(r.HERE / "train_confidence.py"), str(r.WORK / "stage5_dataset.json"),
                         str(r.WORK / "stage5_holdout.json"), str(current), str(cand), str(parity)], capture_output=True, text=True, timeout=3600)
    (r.WORK / "train_report_stage5.json").write_text(tr.stdout + ("\n" + tr.stderr if tr.returncode else ""), encoding="utf8")
    install, why = False, "training failed"
    if tr.returncode == 0:
        rep = json.loads(tr.stdout)
        pr = subprocess.run(["node", str(r.HERE / "confidence_parity.mjs"), str(cand), str(parity)], capture_output=True, text=True, timeout=600)
        new_h, cur_h = rep["base + variant features"]["holdout_auc"], rep["current_model"]["holdout_auc"]
        install = pr.returncode == 0 and new_h is not None and cur_h is not None and new_h >= cur_h - 0.005
        why = (f"{len(moved)} training queries changed answer and were relabelled; hold-out ({rep['holdout_still_valid']} valid) AUC "
               f"candidate {new_h} vs installed {cur_h}; parity {'ok' if pr.returncode == 0 else 'FAILED'}")
        if install:
            shutil.copy2(current, r.HERE / "confidence_model.stage3.json")
            shutil.copy2(cand, current)
    r.say(f"stage 5: confidence model {'REFRESHED' if install else 'kept'} ({why})")
    lines += ["", "## 6. Confidence model refreshed on the final database", f"{'Installed' if install else 'Kept the stage-3 model'}: {why}",
              f"\nTokens after stage 5: {r.budget.used:,}"]
    with (r.WORK / "report.md").open("a", encoding="utf8") as fh:
        fh.write("\n".join(lines) + "\n")
    with r.ts.connect() as db, db.transaction():
        db.execute("INSERT INTO refine_log (run_id, action, detail) VALUES (%s, 'note', %s)",
                   (r.RUN_ID, json.dumps({"stage": 5, "changed": len(changed), "better": better, "worse": worse, "unclear": unclear,
                                          "model_refreshed": install, "why": why})))
    r.save("stage5_done.json", {"changed": len(changed), "better": better, "worse": worse, "unclear": unclear, "model": why})
    (r.WORK / "DONE5").write_text(time.strftime("%Y-%m-%d %H:%M:%S"), encoding="utf8")


if __name__ == "__main__":
    r.ts.load_env()
    try:
        main()
    except Exception:  # noqa: BLE001
        import traceback
        r.say("stage 5 CRASHED:\n" + traceback.format_exc())
        (r.WORK / "DONE5").write_text("crashed", encoding="utf8")
