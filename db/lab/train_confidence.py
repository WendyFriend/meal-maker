"""Trains the confidence model used by db/lab/confidence.mjs (EXPERIMENTAL search in the lab).

Run with a Python that has numpy + scikit-learn (C:\\Users\\Kieran\\icon-studio\\.venv\\Scripts\\python.exe):

  python train_confidence.py <dataset.json> <holdout.json> <current_model.json> <candidate_out.json> <parity_out.json>

dataset.json  [{"query", "label" (1 = top result correct), "rows": resolve_food_conf rows, best first}, ...]
holdout.json  [{"query", "label", "rows", "old_top"}]  hand-labelled; only items whose top result is still old_top count
Prints a JSON report; writes a candidate model (not installed) and parity cases for confidence_parity.mjs.
The feature definitions here must match confidence.mjs exactly.
"""
from __future__ import annotations

import json
import random
import re
import sys
import time
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, roc_auc_score
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

TIER = {"confident": 3, "probable": 2, "ambiguous": 1, "weak": 0}
FAMILIES = ["pin", "name", "unique-phrase", "name-words", "any-name-words", "synonym", "head-section", "description-prefix", "words", "fuzzy"]
MODS = {"fortified", "imitation", "meatless", "vegetarian", "vegan", "substitute", "replacement", "analog",
        "reduced", "low", "lite", "light", "free", "nonfat", "diet", "flavored", "flavor", "sweetened",
        "unsweetened", "protein", "edible", "podded", "babyfood", "infant", "toddler", "junior", "strained",
        "mix", "powder", "powdered", "instant", "dehydrated", "concentrate", "decaffeinated"}
BASE = ["score", "tier", "margin", "n_close", "routes", "coverage", "words", "extra_words", "qwords", "core"] + ["via_" + f for f in FAMILIES]
NEW = ["unasked_mod", "brand", "head_hit"]
BANDS = [(0.9, 1.0001, "very high"), (0.8, 0.9, "high"), (0.6, 0.8, "medium"), (0.3, 0.6, "low"), (0.0, 0.3, "very low")]


def tokens(s: str) -> list[str]:
    return [w for w in re.split(r"[^a-z0-9]+", s.lower()) if w]


def features(query: str, rows: list[dict]) -> dict:
    top = rows[0]
    second = rows[1]["score"] if len(rows) > 1 else 0.0
    qt = tokens(query)
    qwords = len([w for w in qt if len(w) >= 2])
    fam = str(top["matched_via"]).split(":")[0]
    desc = str(top["description"])
    f = {
        "score": top["score"], "tier": TIER.get(top["tier"], 0), "margin": top["score"] - second,
        "n_close": sum(1 for x in rows[1:] if x["score"] >= top["score"] - 0.05),
        "routes": top["n_routes"], "coverage": top["coverage"], "words": top["desc_words"],
        "extra_words": max(top["desc_words"] - qwords, 0), "qwords": qwords, "core": 1 if top["scope"] == "core" else 0,
    }
    for x in FAMILIES:
        f["via_" + x] = 1 if fam == x else 0
    qset = set(qt)
    f["unasked_mod"] = len({w for w in tokens(desc) if w in MODS and w not in qset})
    f["brand"] = 1 if re.search(r"[A-Z]{3,}", desc) else 0
    head = [h for h in tokens(desc.split(",")[0]) if len(h) >= 3]
    f["head_hit"] = 1 if any(len(w) >= 3 and any(h.startswith(w) or w.startswith(h) for h in head) for w in qt) else 0
    return f


def predict_json(model: dict, f: dict) -> float:
    z = model["intercept"] + sum(c * ((f[n] - m) / s) for n, c, m, s in zip(model["features"], model["coef"], model["mean"], model["scale"]))
    return 1 / (1 + np.exp(-z))


def fit(names, X, y):
    return make_pipeline(StandardScaler(), LogisticRegression(max_iter=4000)).fit(X, y)


def main():
    ds_path, ho_path, cur_path, cand_path, parity_path = sys.argv[1:6]
    data = json.loads(Path(ds_path).read_text(encoding="utf8"))
    hold = json.loads(Path(ho_path).read_text(encoding="utf8"))
    current = json.loads(Path(cur_path).read_text(encoding="utf8"))
    F = [features(d["query"], d["rows"]) for d in data]
    y = np.array([d["label"] for d in data])
    valid_hold = [h for h in hold if h["rows"] and h["rows"][0]["fdc_id"] == h["old_top"]]
    Fh = [features(h["query"], h["rows"]) for h in valid_hold]
    yh = np.array([h["label"] for h in valid_hold])
    report = {"train_queries": len(data), "train_positive_rate": round(float(y.mean()), 3),
              "holdout_total": len(hold), "holdout_still_valid": len(valid_hold), "holdout_positive_rate": round(float(yh.mean()), 3) if len(yh) else None}
    cv = StratifiedKFold(5, shuffle=True, random_state=0)
    results = {}
    for label, names in (("base features", BASE), ("base + variant features", BASE + NEW)):
        X = np.array([[f[n] for n in names] for f in F], dtype=float)
        p_cv = cross_val_predict(make_pipeline(StandardScaler(), LogisticRegression(max_iter=4000)), X, y, cv=cv, method="predict_proba")[:, 1]
        m = fit(names, X, y)
        Xh = np.array([[f[n] for n in names] for f in Fh], dtype=float)
        ph = m.predict_proba(Xh)[:, 1] if len(Fh) else np.array([])
        results[label] = {"names": names, "model": m, "p_cv": p_cv,
                          "cv_auc": round(float(roc_auc_score(y, p_cv)), 4), "cv_brier": round(float(brier_score_loss(y, p_cv)), 4),
                          "holdout_auc": round(float(roc_auc_score(yh, ph)), 4) if len(set(yh)) > 1 else None,
                          "holdout_brier": round(float(brier_score_loss(yh, ph)), 4) if len(yh) else None}
    ph_cur = np.array([predict_json(current, f) for f in Fh])
    report["current_model"] = {"holdout_auc": round(float(roc_auc_score(yh, ph_cur)), 4) if len(set(yh)) > 1 else None,
                               "holdout_brier": round(float(brier_score_loss(yh, ph_cur)), 4) if len(yh) else None,
                               "on_new_labels_auc": round(float(roc_auc_score(y, [predict_json(current, f) for f in F])), 4)}
    for k, r in results.items():
        report[k] = {x: r[x] for x in ("cv_auc", "cv_brier", "holdout_auc", "holdout_brier")}
    best = results["base + variant features"]
    m, names, p_cv = best["model"], best["names"], best["p_cv"]
    bands = []
    for lo, hi, lab in BANDS:
        k = (p_cv >= lo) & (p_cv < hi)
        bands.append({"min": lo, "max": hi, "label": lab, "n": int(k.sum()), "observed": round(float(y[k].mean()), 3) if k.sum() else None})
    hi_band = None
    if len(Fh):
        ph = m.predict_proba(np.array([[f[n] for n in names] for f in Fh], dtype=float))[:, 1]
        sel = ph >= 0.9
        hi_band = (int(sel.sum()), round(float(yh[sel].mean()), 3) if sel.sum() else None)
    sc, lr = m[0], m[-1]
    cand = {
        "version": current.get("version", 1) + 1,
        "trained": time.strftime("%Y-%m-%d"),
        "what": "Chance that the top result of resolve_food_conf() is the food the person wanted. Only the top result is modelled.",
        "features": names,
        "mean": [float(v) for v in sc.mean_], "scale": [float(v) for v in sc.scale_],
        "coef": [float(v) for v in lr.coef_[0]], "intercept": float(lr.intercept_[0]),
        "training": {"queries": len(data), "positives": int(y.sum()), "cv_auc": best["cv_auc"],
                     "labels": "deepseek-v4.1-flash with a dish/brand/variant-aware prompt (agreed with hand labels on 50 of 60 hard cases), "
                               "two passes in different batch orders, a third pass breaking ties. LLM-made, not ground truth."},
        "bands": bands,
        "holdout": {"queries": len(valid_hold), "labelled_by": "hand (Claude), never used in training",
                    "auc": best["holdout_auc"], "very_high_band_n": hi_band[0] if hi_band else 0,
                    "very_high_band_correct": hi_band[1] if hi_band else None},
        "limits": ["Labels are model-made, not ground truth.",
                   "Variants that contain every query word can still score high when they carry no modifier word.",
                   "Misspellings and brand names score low even when right."],
    }
    Path(cand_path).write_text(json.dumps(cand, indent=1), encoding="utf8")
    r = random.Random(1)
    cases = [{"query": d["query"], "rows": d["rows"], "p": float(m.predict_proba(np.array([[features(d["query"], d["rows"])[n] for n in names]], dtype=float))[0, 1])}
             for d in r.sample(data, min(300, len(data)))]
    Path(parity_path).write_text(json.dumps(cases), encoding="utf8")
    report["candidate_bands"] = bands
    print(json.dumps(report, indent=1))


if __name__ == "__main__":
    main()
