// Crowds: base nouns, and the groups of foods inside each.
//
// One rule keeps the counts honest: a number shown for a node is the size of
// what opening that node lists. Nothing is counted in one place and shown in
// another, and every food in a node is reachable from it:
//
//   root     base noun + the longer names that start with it ("ice cream" +
//            "ice cream bar"). hits = every food in that family.
//   groups   the terms that split the root ("whole egg") and the longer names
//            under it, each with 2+ foods: the sub-crowds.
//   singles  terms with exactly one food ("pheasant breast"). Already
//            resolved, but still real search terms, so they are listed.
//   plain    foods with no modifier at all. These are the candidates for
//            owning the bare noun ("pheasant"), the point of the exercise.
//
// Every food has a place: a food with a modifier is in that modifier's term
// (a group or a single); a food without one is plain.
//
// checkCrowds() proves that for every root and fails loudly if it ever stops
// being true.

import { joinTerm, normalize } from './rules.mjs';

export const PLAIN = '~plain';
export const SINGLES = '~singles';

/** The most common spelling of each normalized phrase, for display. */
function spellings() {
    const counts = new Map();
    return {
        add(text) {
            const key = normalize(text);
            const surface = text.toLowerCase().replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();
            if (!counts.has(key)) counts.set(key, new Map());
            counts.get(key).set(surface, (counts.get(key).get(surface) ?? 0) + 1);
        },
        show(text) {
            const options = counts.get(normalize(text));
            if (!options) return text;
            return [...options].sort((a, b) => b[1] - a[1])[0][0];
        },
    };
}

/** Builds the crowd structure from parsed foods (see parseAll). */
export function buildCrowds(parsed) {
    const foods = parsed.filter((f) => !f.product && !f.brand);
    const display = spellings();
    for (const food of foods) {
        display.add(food.core);
        for (const mod of food.mods) display.add(mod);
    }

    const roots = new Map();
    for (const food of foods) {
        const key = normalize(food.core);
        if (!roots.has(key)) {
            roots.set(key, { key, foods: [], mods: new Map(), extensions: new Map(), family: [] });
        }
        roots.get(key).foods.push(food);
    }

    for (const root of roots.values()) {
        for (const food of root.foods) {
            for (const mod of food.mods) {
                const term = joinTerm(mod, food.core);
                if (!root.mods.has(term)) {
                    root.mods.set(term, {
                        label: joinTerm(display.show(mod), display.show(food.core)),
                        foods: [],
                    });
                }
                root.mods.get(term).foods.push(food);
            }
        }
    }

    // Longer roots that start with a shorter one move under it.
    const nested = new Set();
    for (const root of roots.values()) {
        if (root.foods.length < 2) continue;
        for (const other of roots.values()) {
            if (other.key !== root.key && other.key.startsWith(`${root.key} `) && other.foods.length >= 2) {
                root.extensions.set(other.key, {
                    label: display.show(other.foods[0].core),
                    foods: other.foods,
                });
                nested.add(other.key);
            }
        }
    }

    for (const root of roots.values()) {
        const seen = new Set();
        root.family = [...root.foods, ...[...root.extensions.values()].flatMap((e) => e.foods)].filter(
            (f) => !seen.has(f.id) && seen.add(f.id),
        );
    }

    return { roots, nested, display };
}

/**
 * The three kinds of thing inside a root (see the header). `groups` and
 * `singles` are terms; `plain` is a list of foods.
 */
export function partsOf(root) {
    const groups = [];
    const singles = [];

    for (const [term, child] of root.mods) {
        const entry = { path: `${root.key}>${term}`, label: child.label, foods: child.foods };
        (child.foods.length >= 2 ? groups : singles).push(entry);
    }
    for (const [term, child] of root.extensions) {
        groups.push({ path: `${root.key}>${term}`, label: child.label, foods: child.foods });
    }

    const bySize = (a, b) => b.foods.length - a.foods.length || a.label.localeCompare(b.label);
    groups.sort(bySize);
    singles.sort(bySize);

    // Foods with no modifier are the owner candidates for the bare noun.
    const plain = root.foods.filter((f) => f.mods.length === 0);

    return { groups, singles, plain };
}

/** The rows a root opens to: its groups, then the singles fold, then plain. */
function rowsOf(root, display) {
    const { groups, singles, plain } = partsOf(root);
    const noun = display.show(root.foods[0]?.core ?? root.key);
    const rows = groups.map((g) => ({ path: g.path, label: g.label, hits: g.foods.length }));

    if (singles.length) {
        rows.push({
            path: `${root.key}>${SINGLES}`,
            label: `${singles.length} one-food terms`,
            hits: singles.length,
            unit: 'terms',
        });
    }
    if (plain.length) {
        rows.push({ path: `${root.key}>${PLAIN}`, label: `${noun}, no modifier`, hits: plain.length });
    }

    return rows;
}

/** Top-level rows: every non-nested root, largest first. */
export function rootRows(crowds, { min = 2, filter = '' } = {}) {
    const { roots, nested, display } = crowds;
    const rows = [];

    for (const root of roots.values()) {
        if (root.family.length < min || nested.has(root.key)) continue;

        const { groups, singles, plain } = partsOf(root);
        const label = display.show(root.foods[0]?.core ?? root.key);
        // One group that is the whole family ("ice cream" -> all "ice cream
        // bar...") is listed as that group instead.
        const whole =
            groups.length === 1 &&
            singles.length === 0 &&
            plain.length === 0 &&
            groups[0].foods.length === root.family.length;
        const shown = whole ? groups[0].label : label;

        if (filter !== '' && !shown.includes(filter)) continue;
        rows.push({ path: whole ? groups[0].path : root.key, label: shown, hits: root.family.length });
    }

    return rows.sort((a, b) => b.hits - a.hits || a.label.localeCompare(b.label));
}

/**
 * What opening `path` shows: a root opens to its rows, a fold opens to its
 * terms, a term opens to its foods. `more` counts foods beyond `limit`, so
 * nothing is ever silently dropped.
 */
export function expand(crowds, path, { limit = 500 } = {}) {
    const { roots, display } = crowds;
    const [rootKey, partKey] = (path ?? '').split('>');
    const root = roots.get(rootKey);
    if (!root) return { path, total: 0, rows: [], foods: [], more: 0 };

    const foodsResult = (list) => {
        const names = list.map((f) => f.description).sort();
        return { path, total: names.length, rows: [], foods: names.slice(0, limit), more: Math.max(0, names.length - limit) };
    };
    const { groups, singles, plain } = partsOf(root);

    if (!partKey) {
        const rows = rowsOf(root, display);
        // Nothing splits this root into terms: it opens straight to its foods.
        if (groups.length === 0 && singles.length === 0) {
            return { ...foodsResult(plain), path, total: root.family.length };
        }
        return { path, total: root.family.length, rows, foods: [], more: 0 };
    }

    if (partKey === PLAIN) return foodsResult(plain);

    if (partKey === SINGLES) {
        return {
            path,
            total: singles.length,
            rows: singles.map((t) => ({ path: t.path, label: t.label, hits: t.foods.length })),
            foods: [],
            more: 0,
        };
    }

    const term = [...groups, ...singles].find((t) => t.path === path);
    return foodsResult(term?.foods ?? []);
}

/**
 * The invariant, over every root. Returns the problems found (empty = fine):
 *   - a root, and everything inside it, opens to something
 *   - every count equals what opening it shows
 *   - every food in the family is reachable from the root
 */
export function checkCrowds(crowds) {
    const problems = [];

    for (const root of crowds.roots.values()) {
        const opened = expand(crowds, root.key);
        if (opened.rows.length === 0 && opened.foods.length === 0) {
            problems.push(`${root.key}: opens to nothing (${root.family.length} foods)`);
            continue;
        }
        if (opened.total !== root.family.length) {
            problems.push(`${root.key}: total ${opened.total} != family ${root.family.length}`);
        }

        const reached = new Set();
        const visit = (path, expectedCount, unit) => {
            const inner = expand(crowds, path);
            const shown = inner.rows.length + inner.foods.length + inner.more;
            if (inner.rows.length === 0 && inner.foods.length === 0) {
                problems.push(`${path}: opens to nothing`);
            }
            if (unit !== 'terms' && inner.rows.length === 0 && shown !== expectedCount) {
                problems.push(`${path}: count ${expectedCount} but opens ${shown}`);
            }
            if (unit === 'terms' && inner.rows.length !== expectedCount) {
                problems.push(`${path}: ${expectedCount} terms but opens ${inner.rows.length}`);
            }
            return inner;
        };

        if (opened.foods.length) {
            opened.foods.forEach((name) => reached.add(name));
        }
        for (const row of opened.rows) {
            const inner = visit(row.path, row.hits, row.unit);
            if (row.unit === 'terms') {
                for (const term of inner.rows) {
                    visit(term.path, term.hits);
                    expand(crowds, term.path).foods.forEach((n) => reached.add(n));
                }
            } else {
                inner.foods.forEach((n) => reached.add(n));
            }
        }

        const missing = root.family.filter((f) => !reached.has(f.description));
        if (missing.length) problems.push(`${root.key}: ${missing.length} foods unreachable`);
    }

    return problems;
}
