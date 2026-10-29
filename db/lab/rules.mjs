// Global naming rules for the nutrition lab.
//
// USDA writes names as "head, qualifier, qualifier, ..." ("Egg, whole, raw,
// fresh"). People search the other way round ("whole egg"). These rules turn
// every name into the pieces a search term is built from, using only
// patterns that hold across the whole dataset -- no per-food special cases.
//
//   core    the base noun phrase a person types      "egg", "ice cream"
//   mods    qualifiers that name a different food     ["whole"], ["reduced fat"]
//   states  how it was prepared, which does not       ["raw", "fresh"]
//           change what the food is
//   aliases other names USDA gives in parentheses     ["garbanzo beans"]
//   brand   a branded product (not a generic food)
//
// Each rule is a small function below with its reason next to it, so a rule
// can be judged, changed or switched off on its own.

// Categories that are products or meals rather than base ingredients. They
// are kept out of the crowds that decide who owns a base noun.
export const PRODUCT_CATEGORIES = new Set([
    'Baby Foods',
    'Fast Foods',
    'Restaurant Foods',
    'Branded Food Products Database',
    'Quality Control Materials',
    'American Indian/Alaska Native Foods',
    'Meals, Entrees, and Side Dishes',
]);

// Words that begin a note about the food, not part of its name:
// "...with added vitamin D", "...containing less than 3% juice".
const CONNECTORS = new Set([
    'with', 'without', 'containing', 'contains', 'made', 'from', 'prepared',
    'in', 'less', 'greater', 'more', 'than', 'per', 'using', 'added', 'plus',
    'includes', 'include', 'including', 'excluding', 'except', 'as', 'by', 'for', 'to', 'not',
]);

// Capitalised abbreviations that are not brand names.
const NOT_BRANDS = new Set(['usda', 'usa', 'nfs', 'ns', 'bbq', 'uht', 'rtd', 'cla']);

// Seeds for the "state" rule. Everything else is learned from the data.
const STATE_SEEDS = ['raw', 'cooked', 'fresh'];
// A segment must have this much evidence behind it: it shares a slot with a
// state, follows a state, or leads into one, across several different heads
// and for most of its occurrences. A few coincidences are not enough, which
// is what keeps real modifiers ("whole", "sweet", "kidney") out.
const MIN_SUPPORT_HEADS = 3;
const MIN_SHARE = 0.4;
const SPEC_SHARE = 0.85;
const SPEC_MIN_HEADS = 5;
const SPEC_MIN_COUNT = 10;
// A segment that follows this many different heads is a general
// qualifier, not part of any one food's identity.
const STATE_DISPERSION = 60;

/** Folds plurals together: beans -> bean, berries -> berry, tomatoes -> tomato. */
export function stem(word) {
    if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
    if (word.length > 4 && /(oes|ches|shes|xes)$/.test(word)) return word.slice(0, -2);
    if (word.length > 3 && /[^su]s$/.test(word)) return word.slice(0, -1);
    return word;
}

const words = (text) =>
    text.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 2);

export const normalize = (text) => words(text).map(stem).join(' ');

/**
 * Rule: parentheses hold alternative names, not words of the name.
 * "Chickpeas (garbanzo beans, bengal gram), mature seeds"
 */
function takeParentheses(text) {
    const aliases = [];
    const rest = text.replace(/\(([^)]*)\)/g, (_, inner) => {
        for (const part of inner.split(',')) {
            const alias = part.trim();
            // Notes ("includes foods for USDA's program", "Alaska Native") are
            // not names.
            if (alias && !/\d|includes|usda|native|nfs|^ns\b/i.test(alias)) {
                aliases.push(alias);
            }
        }
        return ' ';
    });

    return { rest, aliases };
}

/**
 * Rule: an ALL-CAPS word is a brand ("QUAKER", "KRAFT"). Brands are removed
 * from the name and the food is marked as branded.
 */
function takeBrand(segment) {
    let brand = false;
    const kept = segment
        .split(/\s+/)
        .filter((token) => {
            const bare = token.replace(/[^A-Za-z]/g, '');
            const isCaps =
                bare.length >= 2 &&
                bare === bare.toUpperCase() &&
                !NOT_BRANDS.has(bare.toLowerCase());
            if (isCaps) brand = true;
            return !isCaps;
        })
        .join(' ');

    return { text: kept, brand };
}

/**
 * Rule: cut each segment at the first connector word and drop segments that
 * are only a note ("with added vitamin D", "2% milkfat").
 */
function cleanSegment(segment) {
    if (/\d|%/.test(segment)) return '';
    const kept = [];
    for (const word of segment.trim().split(/\s+/)) {
        if (CONNECTORS.has(word.toLowerCase())) break;
        kept.push(word);
    }
    return kept.join(' ');
}

/**
 * First pass over one name: brand, shelf label, parentheses, noise. Returns
 * the cleaned segments, before the dataset-wide state rule is applied.
 */
export function splitName(description, shelfWords, allCategoryWords = new Set()) {
    const { rest, aliases } = takeParentheses(description);
    let brand = false;
    let qualifier = false;

    let segments = rest
        .split(',')
        .map((segment) => {
            const taken = takeBrand(segment);
            brand ||= taken.brand;
            return cleanSegment(taken.text);
        })
        .filter((segment) => words(segment).length > 0);

    // Rule: generic USDA names capitalise only their first word ("Ice cream,
    // vanilla"). A name whose first segment has several capitalised words
    // ending in one ("Oscar Mayer", "Archway Home Style Cookies") is a brand.
    if (segments[0]) {
        const capitals = segments[0]
            .split(/\s+/)
            .filter((word) => /^[A-Z][a-z]/.test(word) || /^[A-Z]{2,}$/.test(word));
        const last = segments[0].split(/\s+/).at(-1);
        if (capitals.length >= 2 && /^[A-Z]/.test(last)) brand = true;
    }

    // Rule: a leading category word ("Beverages,", "Snacks,", "Cereals
    // ready-to-eat,") is the shelf the food sits on, not part of its name.
    if (segments.length > 1 || (segments[0] && words(segments[0]).length > 1)) {
        const [first, ...others] = segments;
        const firstWords = first.split(/\s+/);
        if (
            segments.length > 1 &&
            words(first).length >= 2 &&
            words(first).every((word) => allCategoryWords.has(stem(word)))
        ) {
            segments = others;
        } else if (shelfWords.has(firstWords[0].toLowerCase())) {
            const remainder = firstWords.slice(1).join(' ');
            segments = remainder ? [remainder, ...others] : others;
            // Words that shared the shelf word's segment ("Cereals
            // ready-to-eat") qualify the food, they are not its name.
            qualifier = remainder && others.length > 0;
        }
    }

    return { segments, aliases, brand, qualifier };
}

/**
 * Dataset-wide rule: which segments are states -- preparation or
 * specification detail that does not change which food it is (raw, cooked,
 * canned, braised, "mature seeds", "meat only")?
 *
 *   1. Sibling rule. Foods identical except for one slot compete for that
 *      slot. What shares a slot with a state, for several different foods and
 *      most of its occurrences, is a state.
 *   2. Dispersion rule. A segment that follows very many different heads is
 *      a general qualifier.
 *   3. Follow rule. What comes straight after a state is more preparation
 *      detail ("cooked, braised", "canned, drained solids").
 *   4. Lead-in rule. What comes straight before a state is a specification
 *      of it ("mature seeds, cooked", "meat only, raw").
 *
 * Every rule needs support from several heads and a high share of the
 * segment's occurrences, so one odd family cannot drag a modifier in.
 */
export function findStates(parsed) {
    const key = (segments, skip) =>
        segments.map((s, i) => (i === skip ? '*' : normalize(s))).join('|');

    const stats = new Map(); // segment -> { n, heads }
    const slots = new Map(); // masked name -> Set of segments in that slot
    for (const { segments } of parsed) {
        const names = segments.map(normalize);
        for (let i = 1; i < names.length; i++) {
            const entry = stats.get(names[i]) ?? stats.set(names[i], { n: 0, heads: new Set() }).get(names[i]);
            entry.n++;
            entry.heads.add(names[0]);
            const masked = key(segments, i);
            if (!slots.has(masked)) slots.set(masked, new Set());
            slots.get(masked).add(names[i]);
        }
    }

    const states = new Set(STATE_SEEDS);

    // Counts, per candidate, how many occurrences meet `test` and the heads
    // they came from, then adds the candidates with enough support and share.
    const learn = (test, minShare, minHeads, minCount = 1) => {
        const found = new Map();
        for (const { segments } of parsed) {
            const names = segments.map(normalize);
            for (let i = 1; i < names.length; i++) {
                if (!test(names, i)) continue;
                const entry = found.get(names[i]) ?? found.set(names[i], { n: 0, heads: new Set() }).get(names[i]);
                entry.n++;
                entry.heads.add(names[0]);
            }
        }
        for (const [value, entry] of found) {
            const total = stats.get(value);
            if (
                entry.heads.size >= minHeads &&
                total.n >= minCount &&
                entry.n / total.n >= minShare
            ) {
                states.add(value);
            }
        }
    };

    // 1. Sibling: another segment in this slot is a known state.
    learn(
        (names, i) => {
            const group = slots.get(key(names, i));
            return [...group].some((v) => v !== names[i] && states.has(v));
        },
        MIN_SHARE,
        MIN_SUPPORT_HEADS,
    );

    // 2. Dispersion.
    for (const [value, entry] of stats) {
        if (entry.heads.size >= STATE_DISPERSION) states.add(value);
    }

    // 3. Follow, repeated: "canned, drained, solids and liquids" is a chain.
    for (let round = 0; round < 5; round++) {
        const before = states.size;
        learn((names, i) => i >= 2 && states.has(names[i - 1]), MIN_SHARE, MIN_SUPPORT_HEADS);
        if (states.size === before) break;
    }

    // 4. Lead-in.
    learn(
        (names, i) => i + 1 < names.length && states.has(names[i + 1]),
        SPEC_SHARE,
        SPEC_MIN_HEADS,
        SPEC_MIN_COUNT,
    );

    return states;
}

/**
 * Builds the search terms for a parsed name.
 *
 *   base            egg
 *   modified        whole egg           (each qualifier flipped in front)
 *   combined        red kidney bean     (all qualifiers, most specific first)
 *   with state      raw whole egg       (extras: state before the name)
 */
/**
 * "mod core" with the modifier in front, unless the modifier already ends in
 * the noun: "buttermilk" + "milk" is "buttermilk", not "buttermilk milk".
 */
export function joinTerm(mod, core) {
    const front = normalize(mod);
    const base = normalize(core);
    return front.endsWith(base) ? front : `${front} ${base}`;
}

export function termsFor({ core, mods, states }) {
    const base = normalize(core);
    const terms = new Set([base]);

    for (const mod of mods) {
        terms.add(joinTerm(mod, core));
        // Part nouns read the other way ("egg white", "egg yolk"); adjectives
        // never do, so this is only ever an extra alias.
        terms.add(`${base} ${normalize(mod)}`);
    }

    if (mods.length > 1) {
        const combined = [...mods].reverse().map(normalize).join(' ');
        terms.add(`${combined} ${base}`);
    }

    for (const state of states) {
        const stateName = normalize(state);
        terms.add(`${stateName} ${base}`);
        if (mods.length) {
            terms.add(`${stateName} ${[...mods].reverse().map(normalize).join(' ')} ${base}`);
        }
    }

    return [...terms];
}

/** Everything the lab needs to know about one food. */
export function parseAll(rows, categories) {
    const allCategoryWords = new Set(categories.flatMap((c) => words(c)).map(stem));
    const categoryWords = new Set(
        categories.flatMap((c) => words(c)).filter((w) => /[^s]s$/.test(w)),
    );

    const parsed = rows.map(([id, description, category]) => ({
        id,
        description,
        category,
        ...splitName(description, categoryWords, allCategoryWords),
    }));

    const states = findStates(parsed);

    return parsed
        .filter((food) => food.segments.length > 0)
        .map((food) => {
            // Rule: a name that opens with a state ("Cereals ready-to-eat,
            // ...") has its real head in the next segment.
            const segments = [...food.segments];
            const leading = [];
            if (food.qualifier) leading.push(segments.shift());
            while (segments.length > 1 && states.has(normalize(segments[0]))) {
                leading.push(segments.shift());
            }
            const [core, ...rest] = segments;
            const mods = [];
            const foodStates = [...leading];

            for (const segment of rest) {
                (states.has(normalize(segment)) ? foodStates : mods).push(segment);
            }

            const parts = { core, mods, states: foodStates };

            return {
                ...food,
                ...parts,
                product: PRODUCT_CATEGORIES.has(food.category),
                terms: termsFor(parts),
            };
        });
}
