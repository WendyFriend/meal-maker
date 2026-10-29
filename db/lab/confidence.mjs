// Confidence estimate for what resolve_food_conf() returns (EXPERIMENTAL).
//
// A small logistic model (db/lab/confidence_model.json) turns signals about the top
// result into the chance it is the food the person wanted. The signals are all
// plain database facts, no LLM at query time:
//   score, tier         what resolve_food already gives
//   margin, n_close     how far ahead of the runner-up it is, and how many others are close
//   routes              how many independent matching routes found it
//   coverage            share of the query's words found in the food's description
//   words, extra_words  how long and how specific the description is
//   qwords, core        words in the query; whether the food is in the core scope
//   via_*               which route produced the winning score
//
// Only the top result is modelled; runner-ups get their signals but no percentage.
// The feature definitions must match the training script exactly, or the numbers drift.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const MODEL_FILE = join(here, 'confidence_model.json');
const TIER = { confident: 3, probable: 2, ambiguous: 1, weak: 0 };
const FAMILIES = [
    'pin', 'name', 'unique-phrase', 'name-words', 'any-name-words',
    'synonym', 'head-section', 'description-prefix', 'words', 'fuzzy',
];
// Words that mark a special variant of a food (unasked_mod counts those the query did not ask for).
// Must match MODS in train_confidence.py.
const MODS = new Set([
    'fortified', 'imitation', 'meatless', 'vegetarian', 'vegan', 'substitute', 'replacement', 'analog',
    'reduced', 'low', 'lite', 'light', 'free', 'nonfat', 'diet', 'flavored', 'flavor', 'sweetened',
    'unsweetened', 'protein', 'edible', 'podded', 'babyfood', 'infant', 'toddler', 'junior', 'strained',
    'mix', 'powder', 'powdered', 'instant', 'dehydrated', 'concentrate', 'decaffeinated',
]);
const tokens = (s) => String(s).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** Signals for the top result of `rows` (resolve_food_conf output, best first). */
export function featuresOf(term, rows) {
    const top = rows[0];
    const second = rows.length > 1 ? rows[1].score : 0;
    const qwords = term.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 2).length;
    const family = String(top.matched_via).split(':')[0];
    const f = {
        score: top.score,
        tier: TIER[top.tier] ?? 0,
        margin: top.score - second,
        n_close: rows.slice(1).filter((x) => x.score >= top.score - 0.05).length,
        routes: top.n_routes,
        coverage: top.coverage,
        words: top.desc_words,
        extra_words: Math.max(top.desc_words - qwords, 0),
        qwords,
        core: top.scope === 'core' ? 1 : 0,
    };
    for (const fam of FAMILIES) f[`via_${fam}`] = family === fam ? 1 : 0;

    // Variant signals: a modifier the query did not ask for, an upper-case brand word, and whether any
    // query word starts the food's head (the part before the first comma).
    const desc = String(top.description);
    const qset = new Set(tokens(term));
    f.unasked_mod = [...new Set(tokens(desc))].filter((w) => MODS.has(w) && !qset.has(w)).length;
    f.brand = /[A-Z]{3,}/.test(desc) ? 1 : 0;
    const head = tokens(desc.split(',')[0]).filter((h) => h.length >= 3);
    f.head_hit = tokens(term).some((w) => w.length >= 3 && head.some((h) => h.startsWith(w) || w.startsWith(h))) ? 1 : 0;
    return f;
}

export function probability(model, f) {
    let z = model.intercept;
    model.features.forEach((name, i) => {
        z += model.coef[i] * ((f[name] - model.mean[i]) / model.scale[i]);
    });
    return 1 / (1 + Math.exp(-z));
}

export function bandFor(model, p) {
    return model.bands.find((b) => p >= b.min && p < b.max) ?? model.bands[model.bands.length - 1];
}

/** Everything the lab page shows about confidence, or null when there is no result. */
export async function confidenceFor(term, rows) {
    if (!rows.length) return null;

    let model;
    try {
        model = JSON.parse(await readFile(MODEL_FILE, 'utf8'));
    } catch {
        return { error: 'db/lab/confidence_model.json is missing or unreadable' };
    }

    const f = featuresOf(term, rows);
    // The model file is re-read on every request but this code only when the server starts, so a model
    // trained with newer signals than this build computes would score as NaN (shown as 0%). Say so instead.
    const missing = model.features.filter((name) => !Number.isFinite(f[name]));
    if (missing.length) {
        return { error: `The installed model needs signals this server build does not compute (${missing.join(', ')}). Restart the lab server.` };
    }
    const p = probability(model, f);
    const band = bandFor(model, p);

    return {
        p,
        band: { label: band.label, min: band.min, max: band.max, n: band.n, observed: band.observed },
        signals: f,
        model: {
            trained: model.trained,
            queries: model.training.queries,
            cvAuc: model.training.cv_auc,
            holdout: model.holdout,
            labels: model.training.labels,
            limits: model.limits,
        },
    };
}
