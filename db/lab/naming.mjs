// Gives every food a common name and a noun, then makes each one unique.
// Model: gemma4:12b (NAMING_MODEL overrides).
//
//   node --env-file=.env db/lab/naming.mjs
//   node --env-file=.env db/lab/naming.mjs --run gemma
//
// --run gemma names every food again with gemma4:12b into common_name_gemma /
// noun_gemma, for comparing models. That run only does phase 1; its status and
// stop files carry a -gemma suffix so both runs can be paused separately.
//
// Usually started and paused from the lab's "Naming" tab, which also shows the
// progress. Three phases, each picking up where the last run stopped:
//
//   1. generate  the model names each food: "canned peas" and "peas". Stored in
//                common_name_raw / noun_raw. Two short questions per batch, as
//                one question at a time is what a small model answers well.
//   2. common    foods sharing a common name are arbitrated: the model picks
//                the one a shopper typing that name most likely wants. Only the
//                winner gets common_name; the rest keep just the raw value.
//   2b. refine   multi-word nouns are reduced to the food they are a kind of
//                ("durum wheat" -> "wheat") so they join that noun's group.
//   3. noun      the same for nouns, so only one food owns "peas".
//
// Large groups are a tournament: batches of GROUP candidates, a winner from
// each, then a final among the winners, repeated until one is left.
//
// --hibernate-when-done puts the computer into hibernation once every phase has
// finished (not when paused or stopped by an error). It applies to that one
// process only: pausing and resuming from the tab starts a run without it.
//
// Pause: the Naming tab, or create db/lab/out/naming.stop. The current model
// call finishes, then it exits. Every decision is in name_arbitration, so a
// restart skips everything already decided; a group cut off mid-tournament is
// simply run again.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, unlinkSync, writeFileSync, appendFileSync } from 'node:fs';

const runArg = process.argv.indexOf('--run');
const RUN = runArg > 0 ? process.argv[runArg + 1] : '';
const RUNS = {
    '': { model: 'gemma4:12b', common: 'common_name_raw', noun: 'noun_raw', arbitrate: true },
    gemma: { model: 'gemma4:12b', common: 'common_name_gemma', noun: 'noun_gemma', arbitrate: false },
};
if (!RUNS[RUN]) throw new Error(`unknown --run ${RUN}`);
const { common: COMMON_COL, noun: NOUN_COL, arbitrate: ARBITRATE } = RUNS[RUN];
const MODEL = process.env.NAMING_MODEL || RUNS[RUN].model;
const SUFFIX = RUN ? `-${RUN}` : '';
const OLLAMA = process.env.OLLAMA_URL || 'http://localhost:11434';
const PSQL = process.env.PSQL_PATH || 'C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe';
const DB = process.env.LAB_DATABASE || 'nutrition_lab';
const BATCH = 25; // foods per naming call
const GROUP = 20; // candidates per arbitration call
const OUT = 'db/lab/out';
const STOP_FILE = `${OUT}/naming${SUFFIX}.stop`;
const STATUS_FILE = `${OUT}/naming${SUFFIX}-status.json`;
const LOG_FILE = `${OUT}/naming${SUFFIX}.log`;

const url = new URL(process.env.NUTRITION_DATABASE_URL);
const psql = (sql) =>
    execFileSync(
        PSQL,
        ['-h', url.hostname, '-p', url.port || '5432', '-U', decodeURIComponent(url.username), '-d', DB, '-At', '-v', 'ON_ERROR_STOP=1'],
        {
            input: sql,
            env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password) },
            maxBuffer: 64 * 1024 * 1024,
            // Started detached with no console, so without this every psql call
            // opens its own command window on Windows.
            windowsHide: true,
        },
    ).toString();

// Model text reaches SQL only inside this dollar-quoted JSON literal.
const TAG = '$naming_json$';
const jsonLiteral = (value) => {
    const text = JSON.stringify(value).replaceAll('$', '');
    return `${TAG}${text}${TAG}::json`;
};

mkdirSync(OUT, { recursive: true });
const startedAt = new Date().toISOString();
const status = (phase, message) => {
    writeFileSync(STATUS_FILE, JSON.stringify({ pid: process.pid, phase, message, startedAt, updated: new Date().toISOString() }));
};
const log = (text) => appendFileSync(LOG_FILE, `${new Date().toISOString()}  ${text}\n`);
const stopRequested = () => existsSync(STOP_FILE);

async function ask(content) {
    const res = await fetch(`${OLLAMA}/api/chat`, {
        method: 'POST',
        signal: AbortSignal.timeout(180_000),
        body: JSON.stringify({
            model: MODEL,
            stream: false,
            think: false,
            options: { temperature: 0, num_ctx: 8192 },
            messages: [{ role: 'user', content }],
        }),
    });
    const body = await res.json();
    if (body.error) throw new Error(body.error);
    return (body.message?.content ?? '').trim();
}

// The lab treats an ALL-CAPS word as a brand (see rules.mjs). They are removed
// from what the model sees, so it cannot copy them into a name: a branded food
// competes for "cheese" like any other, but its name never carries the brand.
const NOT_BRANDS = new Set(['usda', 'usa', 'nfs', 'ns', 'bbq', 'uht', 'rtd', 'cla']);
const stripBrands = (description) =>
    description
        .replace(/\b[A-Z][A-Z'&.-]{2,}\b/g, (word) => (NOT_BRANDS.has(word.toLowerCase().replace(/[^a-z]/g, '')) ? word : ' '))
        .replace(/\s+,/g, ',')
        .replace(/(,\s*)+/g, ', ')
        .replace(/\s+/g, ' ')
        .replace(/^[,\s]+|[,\s]+$/g, '');

const numbered = (text) =>
    text
        .split('\n')
        .filter((l) => /^\s*\d+\./.test(l))
        // A model sometimes echoes the input ("lemon juice -> juice"): keep the answer.
        .map((l) => l.replace(/^\s*\d+\.\s*/, '').split('->').pop().trim());

// Words the prompt asks to leave out but a small model sometimes keeps.
const COOKING = /^(raw|cooked|boiled|roasted|braised|broiled|grilled|plain|fresh) /;
const clean = (s) =>
    (s ?? '')
        .toLowerCase()
        .replace(/["'`*]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(COOKING, '')
        .slice(0, 80);

// ---------------------------------------------------------------- generate

const commonPrompt = (names) => `Food database entries:
${names.map((f, i) => `${i + 1}. ${f}`).join('\n')}

For each entry, what would a shopper type into a search box to find it? Give ONE short common name per entry.

Use the main food word plus only the words that change which product they would pick up: a kind, variety or cut (sour cherry, flour tortilla, golden delicious apple, chicken breast, bottom round steak) or the form it is sold in (canned, frozen, dried).

Rules:
- Always singular: apple not apples, cherry not cherries, chop not chops.
- Natural English word order, describing words first: canned corn, not corn canned.
- For a meat cut, start with the animal, then the cut a butcher would name: pork chop, pork tenderloin, beef brisket. Leave out the larger section the cut comes from (loin, round, chuck, rib, leg) unless it is the cut itself.
- Leave out defaults the shopper assumes: colour that is normal for the food, salt or seasoning, raw for fresh produce, "regular", "plain" unless it matters.
- Leave out lab and packaging detail: solids and liquids, drained, enriched, percentages, trimmed, grades, separable lean, bone-in, boneless, slice.
- Leave out how it was cooked for testing: boiled, roasted, braised, cooked.
- Never use a brand or product-line name (Silk, Quaker, Post, Kraft): name the food itself.

Examples:
Corn, sweet, yellow, canned, whole kernel, drained solids -> canned corn
Spinach, frozen, chopped or leaf, unprepared -> frozen spinach
Bananas, raw -> banana
Beef, chuck, top blade, steak, separable lean only, choice, cooked, broiled -> top blade steak
Pork, fresh, loin, sirloin (chops), boneless, separable lean only, raw -> pork sirloin chop
Beef, round, eye of round, roast, separable lean only, choice, raw -> beef eye of round roast
Pork, fresh, loin, whole, separable lean only, raw -> pork loin
Grapes, red or green (European type), raw -> grape

Reply with a numbered list, one lowercase common name per line, in the same order as the entries, nothing else:
1. common name`;

const nounPrompt = (terms) => `Search terms:
${terms.map((t, i) => `${i + 1}. ${t}`).join('\n')}

For each search term, give the general food word a person would type on its own for that kind of food.

Rules:
- Always singular.
- Usually one word: the thing the food is, which is normally the last word (sour cherry -> cherry, flour tortilla -> tortilla, lemon juice -> juice).
- Keep two words only when the last word alone would mean a different food: peanut butter is not butter, ice cream is not cream, sweet potato is not potato, lemon peel is not peel.
- A cut or part of an animal: the animal (pork chop -> pork, chicken breast -> chicken), except steak, which people search for as steak.
- An organ: the organ (beef liver -> liver).
- A dish: the dish (beef stew -> stew).

Examples:
canned corn -> corn
cheddar cheese -> cheese
bottom round steak -> steak
pork tenderloin -> pork
frozen pea -> pea
peanut butter -> peanut butter
imitation cheese -> cheese

Reply with a numbered list, one lowercase word or two-word food per line, in the same order, nothing else:
1. noun`;

/**
 * Names one batch: common names, then nouns. If the model answers the wrong
 * number of lines, the batch is split in half and each half retried, down to a
 * single food, so one bad answer never costs a whole batch. Returns the rows
 * that could be named, [] if none, or null when paused.
 */
async function nameBatch(foods) {
    const commons = numbered(await ask(commonPrompt(foods.map((f) => stripBrands(f.description))))).map(clean);
    if (stopRequested()) return null;
    const nouns = commons.length === foods.length ? numbered(await ask(nounPrompt(commons))).map(clean) : [];
    const ok = commons.length === foods.length && nouns.length === foods.length && commons.every(Boolean) && nouns.every(Boolean);
    if (ok) return foods.map((f, i) => ({ id: f.fdc_id, c: commons[i], n: nouns[i] }));

    if (foods.length === 1) {
        log(`generate: could not name ${foods[0].fdc_id} "${foods[0].description}"`);
        return [];
    }
    const half = Math.ceil(foods.length / 2);
    const left = await nameBatch(foods.slice(0, half));
    if (left === null) return null;
    const right = await nameBatch(foods.slice(half));
    if (right === null) return null;
    return [...left, ...right];
}

async function generate() {
    const total = Number(psql(`SELECT count(*) FROM food;`).trim());
    const skipped = new Set(); // batches the model answered badly, retried next run

    while (!stopRequested()) {
        const skip = skipped.size ? `AND fdc_id NOT IN (${[...skipped].join(',')})` : '';
        const foods = JSON.parse(
            psql(`SELECT coalesce(json_agg(t), '[]') FROM (
                SELECT fdc_id, description FROM food
                WHERE ${COMMON_COL} IS NULL ${skip}
                ORDER BY fdc_id LIMIT ${BATCH}) t;`).trim(),
        );
        if (!foods.length) return true;

        const done = Number(psql(`SELECT count(*) FROM food WHERE ${COMMON_COL} IS NOT NULL;`).trim());
        status('generate', `Naming foods: ${done} of ${total}`);

        const rows = await nameBatch(foods);
        if (rows === null) return false; // paused
        if (!rows.length) foods.forEach((f) => skipped.add(f.fdc_id));
        else {
            psql(`UPDATE food f SET ${COMMON_COL} = x.c, ${NOUN_COL} = x.n
                  FROM json_to_recordset(${jsonLiteral(rows)}) AS x(id integer, c text, n text)
                  WHERE f.fdc_id = x.id;`);
        }
    }
    return false;
}

// ----------------------------------------------------------------- refine

const reducePrompt = (list) => `Food words:
${list.map((n, i) => `${i + 1}. ${n}`).join('\n')}

For each word, give the shortest everyday food word it is a kind of, so that someone typing only that short word would reasonably expect to see it.

Rules:
- Name the general food: durum wheat -> wheat, pinto bean -> bean, white rice -> rice, chicken wing -> chicken, egg white -> egg, mashed potato -> potato, orange juice -> juice.
- Keep the whole term when it is a different food from its parts, so the short word would mislead: sweet potato, peanut butter, ice cream, sour cream, pot roast, french fry, hash brown, cream of wheat.
- Answer with one or two words, singular, lowercase.

Reply with a numbered list, in the same order, nothing else:
1. word`;

const guardPrompt = (list) => `Words:
${list.map((n, i) => `${i + 1}. ${n}`).join('\n')}

For each word: would a shopper type just this word into a food search box to look for a food? A general food word is yes. A word that only makes sense with another word in front of it is no.

Examples:
bean -> yes
juice -> yes
cheese -> yes
squash -> yes
soup -> yes
mix -> no
powder -> no
extract -> no
seed -> no
leaf -> no
crust -> no
meat -> no
fat -> no

Reply with a numbered list, yes or no, in the same order, nothing else:
1. yes`;

/** Many models answer in batches; this runs a prompt over a long list. */
async function askInBatches(items, promptFor, size = 25) {
    const out = [];
    for (let i = 0; i < items.length; i += size) {
        if (stopRequested()) return null;
        const batch = items.slice(i, i + size);
        const answers = numbered(await ask(promptFor(batch))).map((a) => a.toLowerCase().replace(/[."']/g, '').trim());
        if (answers.length !== batch.length) throw new Error(`refine: ${answers.length} answers for ${batch.length} words`);
        out.push(...answers);
    }
    return out;
}

/**
 * Reduces multi-word nouns to the food word they are a kind of ("durum wheat"
 * -> "wheat"), unless the leftover word is not a food on its own ("pancake mix"
 * stays whole). The original is kept in noun_first.
 */
async function refineNouns() {
    const nouns = psql(`SELECT DISTINCT noun_raw FROM food
                        WHERE noun_raw LIKE '% %' AND noun_first IS NULL ORDER BY 1;`)
        .split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!nouns.length) return true;

    status('refine', `Reducing ${nouns.length} multi-word nouns to the food they are a kind of`);
    const reduced = await askInBatches(nouns, reducePrompt);
    if (!reduced) return false;

    const targets = [...new Set(reduced.filter((r, i) => r && r !== nouns[i]))];
    status('refine', `Checking ${targets.length} shortened words are foods on their own`);
    const verdicts = await askInBatches(targets, guardPrompt);
    if (!verdicts) return false;
    const isFood = new Map(targets.map((t, i) => [t, verdicts[i].startsWith('y')]));

    const mapping = nouns.map((n, i) => ({ from: n, to: reduced[i] && isFood.get(reduced[i]) ? clean(reduced[i]) : n }));
    psql(`UPDATE food f SET noun_first = f.noun_raw, noun_raw = m."to"
          FROM json_to_recordset(${jsonLiteral(mapping)}) AS m("from" text, "to" text)
          WHERE f.noun_raw = m."from" AND f.noun_first IS NULL;`);
    log(`refine: ${mapping.filter((m) => m.from !== m.to).length} of ${nouns.length} multi-word nouns reduced`);
    return true;
}

// --------------------------------------------------------------- arbitrate

/**
 * The model's own idea of what a bare search term means, asked without showing it
 * any database entry: "beef" -> "Ground beef: minced meat from cattle...". Matching
 * entries against that is steadier than asking it to choose between USDA strings.
 */
const idealPrompt = (term) => `A user is searching a nutrition database; the user inputs "${term}" on its own, their input is complete, what is their most likely intended ingredient from this search. ingredient name only with brief description`;

async function ideal(term) {
    const answer = await ask(idealPrompt(term));
    return answer.replace(/[*#_`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 300);
}

const matchPrompt = (term, intended, list, kind) => `A user searched a nutrition database for "${term}". Their most likely intended ingredient is:
${intended}

Which ONE of these database entries best matches that ingredient? Prefer the plain, basic form of the food (raw or uncooked, or the ordinary version) over a variety, a brand, a prepared product or a special diet version, unless the ingredient above is itself a prepared product.

${list.map((c, i) => `${i + 1}. ${kind === 'common' ? c.description : `${c.common} (${c.description})`}`).join('\n')}

Reply with the number only.`;

/** One model pick from up to GROUP candidates. Falls back to the first listed. */
async function pick(term, list, kind, intended) {
    for (let attempt = 0; attempt < 2; attempt++) {
        const answer = await ask(matchPrompt(term, intended, list, kind));
        const n = Number((answer.match(/\d+/) ?? [])[0]);
        if (Number.isInteger(n) && n >= 1 && n <= list.length) return { winner: list[n - 1], fallback: false };
    }
    return { winner: list[0], fallback: true };
}

/** Batches of GROUP, a winner from each, repeated until one is left. */
async function tournament(kind, term, candidates, progress, intended) {
    let field = candidates;
    let round = 1;
    let fallbacks = 0;
    while (field.length > 1) {
        const next = [];
        const batches = Math.ceil(field.length / GROUP);
        for (let b = 0; b < batches; b++) {
            if (stopRequested()) return null;
            const batch = field.slice(b * GROUP, (b + 1) * GROUP);
            status(kind, `${progress} "${term}": ${candidates.length} foods, round ${round}, batch ${b + 1} of ${batches}`);
            if (batch.length === 1) {
                next.push(batch[0]);
                continue;
            }
            const { winner, fallback } = await pick(term, batch, kind, intended);
            if (fallback) fallbacks++;
            next.push(winner);
        }
        field = next;
        round++;
    }
    return { winner: field[0], method: fallbacks ? `model, ${fallbacks} fallback` : 'model' };
}

// Words that say a food is processed, prepared, packaged for sale or a variant of
// the plain food. A shopper typing the bare word most likely means the plain
// version, so those compete first. Nothing is excluded: see decide().
const PROCESSED =
    /\b(ground|canned|dried|dehydrated|frozen|cooked|boiled|baked|fried|roasted|braised|broiled|grilled|stewed|steamed|microwaved|prepared|sweetened|sprouted|mix|powder|spread|imitation|substitute|flavored|fortified|reconstituted|restaurant|fast foods?|babyfood|smoked|chilled|cured|pickled|cold pack|single brand|composite|ready-to-w+|ready to serve|ready to feed|concentrate|microwavw+|frosted|marshmallows?|low sodium|reduced|fat free|nonfat|lowfat|low fat|light|diet|formulated|cheese food|cheese product|cheese spread|infant|toddler|snack|bar|beverage|drink|mixture|dinner|entree|sauce|gravy|seasoned|salted|with added|enriched|condensed|dry|homemade|imported)\b/i;
const isBranded = (description) => /\b[A-Z][A-Z'&.-]{2,}\b/.test(description.replace(/\b(USDA|USA|NFS|NS|BBQ|UHT|RTD|CLA)\b/g, ''));
const sections = (description) => description.split(',').length;


/**
 * Picks the owner of a term. The model first says what a bare "term" most likely means;
 * entries are then matched against that. Branded foods only compete when nothing
 * else exists. Candidates are listed plain before processed, then fewest comma
 * sections, then shortest, so the order never depends on database order and the
 * generic entry ("Wheat, durum") is listed ahead of the specific one.
 */
// Words compared without plural endings, like the resolver's name_key.
const keyWords = (text) =>
    text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean)
        .map((w) =>
            w
                .replace(/([a-z])ies$/, '$1y')
                .replace(/([a-z])oes$/, '$1o')
                .replace(/([a-z])(sh|ch|x|z|ss)es$/, '$1$2')
                .replace(/([a-z][^s])s$/, '$1'),
        );
/** The food is what its first comma section says: "Applesauce, canned" is an applesauce, "Babyfood, fruit, applesauce" is not. */
const headHas = (term, description) => {
    const head = keyWords(description.split(',')[0]);
    return head.includes(keyWords(term).at(-1));
};

async function decide(kind, term, candidates, progress) {
    const unbranded = candidates.filter((c) => !isBranded(c.description));
    const allowed = unbranded.length ? unbranded : candidates;
    // Foods named for the term first, when a fair share are: "Applesauce, ..."
    // over "Babyfood, fruit, applesauce". Not for words like "steak", where the
    // ordinary foods are named for the animal ("Beef, ..., steak") and only odd
    // ones ("Salisbury steak") lead with the word.
    const headed = allowed.filter((c) => headHas(term, c.description));
    const pool = (headed.length >= Math.max(1, allowed.length * 0.2) ? headed : allowed).sort(
        (a, b) =>
            Number(PROCESSED.test(a.description)) - Number(PROCESSED.test(b.description)) ||
            sections(a.description) - sections(b.description) ||
            a.description.length - b.description.length,
    );
    if (pool.length === 1) return { winner: pool[0], method: 'only unbranded', ideal: null };
    status(kind, `${progress} "${term}": asking what it means`);
    const intended = await ideal(term);
    const result = await tournament(kind, term, pool, progress, intended);
    return result && { ...result, method: `ideal, ${result.method}`, ideal: intended };
}

/** Only the winner carries the name; written as each term is decided. */
const applyDecisions = (kind, col, termFilter = '') =>
    psql(`UPDATE food f SET ${col} = CASE WHEN a.winner = f.fdc_id THEN f.${col}_raw END
          FROM name_arbitration a
          WHERE a.kind = '${kind}' AND a.term = f.${col}_raw ${termFilter};`);

const KIND_COLS = { common: 'common_name', noun: 'noun', common2: 'common_name_2', common3: 'common_name_3' };

// Foods that failed the synonym check for a name never compete for it again.
const notRejected = (kind, termSql, idSql) =>
    `NOT EXISTS (SELECT 1 FROM name_rejected r WHERE r.kind = '${kind}' AND r.term = ${termSql} AND r.fdc_id = ${idSql})`;

/**
 * Decides every name of one kind. The candidates for a name are the foods that
 * were given it, plus any food that carries it as a synonym: "rolled oats" was
 * given to Cream of Rice, but Oats has it as a synonym, so both compete. The
 * winner is recorded in name_arbitration, which is what the resolver reads; the
 * food's own column (common_name, noun, ...) is only filled when the winner was
 * given that name itself.
 */
async function arbitrate(kind) {
    const col = KIND_COLS[kind];

    // A name only one food has, and no other food carries as a synonym, is
    // decided without the model.
    psql(`INSERT INTO name_arbitration (kind, term, winner, candidates, method)
          SELECT '${kind}', f.${col}_raw, min(f.fdc_id), 1, 'only'
          FROM food f
          WHERE f.${col}_raw <> '' AND ${notRejected(kind, `f.${col}_raw`, 'f.fdc_id')}
          GROUP BY f.${col}_raw
          HAVING count(*) = 1
             AND NOT EXISTS (SELECT 1 FROM food_synonym_key s
                             WHERE s.key = name_key(f.${col}_raw) AND s.fdc_id <> min(f.fdc_id)
                               AND ${notRejected(kind, `f.${col}_raw`, 's.fdc_id')})
          ON CONFLICT DO NOTHING;`);
    applyDecisions(kind, col);

    while (!stopRequested()) {
        const counts = psql(`SELECT
                (SELECT count(DISTINCT ${col}_raw) FROM food WHERE ${col}_raw <> ''),
                (SELECT count(*) FROM name_arbitration WHERE kind = '${kind}');`)
            .trim()
            .split('|')
            .map(Number);
        const progress = `${counts[1]} of ${counts[0]} names decided.`;

        const group = JSON.parse(
            psql(`WITH next AS (
                    SELECT f.${col}_raw AS term
                    FROM food f
                    WHERE f.${col}_raw <> '' AND ${notRejected(kind, `f.${col}_raw`, 'f.fdc_id')}
                      AND NOT EXISTS (SELECT 1 FROM name_arbitration a WHERE a.kind = '${kind}' AND a.term = f.${col}_raw)
                    GROUP BY f.${col}_raw
                    ORDER BY count(*), f.${col}_raw
                    LIMIT 1
                ),
                cands AS (
                    SELECT f.fdc_id FROM food f, next
                    WHERE f.${col}_raw = next.term AND ${notRejected(kind, 'next.term', 'f.fdc_id')}
                    UNION
                    SELECT s.fdc_id FROM food_synonym_key s, next
                    WHERE s.key = name_key(next.term) AND ${notRejected(kind, 'next.term', 's.fdc_id')}
                )
                SELECT row_to_json(g) FROM (
                    SELECT next.term,
                           json_agg(json_build_object('fdc_id', f.fdc_id, 'description', f.description, 'common', f.common_name_raw) ORDER BY f.fdc_id) AS foods
                    FROM next, cands JOIN food f USING (fdc_id)
                    GROUP BY next.term) g;`).trim() || 'null',
        );
        if (!group) break;

        const result = group.foods.length === 1
            ? { winner: group.foods[0], method: 'only', ideal: null }
            : await decide(kind, group.term, group.foods, progress);
        if (!result) return false;
        psql(`INSERT INTO name_arbitration (kind, term, winner, candidates, method, ideal)
              SELECT '${kind}', x.term, x.winner, x.candidates, x.method, x.ideal
              FROM json_to_record(${jsonLiteral({ term: group.term, winner: result.winner.fdc_id, candidates: group.foods.length, method: result.method, ideal: result.ideal })})
                   AS x(term text, winner integer, candidates integer, method text, ideal text)
              ON CONFLICT DO NOTHING;`);
        applyDecisions(kind, col, `AND a.term = (${jsonLiteral(group.term)} #>> '{}')`);
        log(`${kind} "${group.term}": ${group.foods.length} foods -> ${result.winner.description} (${result.method})`);
    }
    return !stopRequested();
}

const synonymPrompt = (rows) => `Each line gives a name and a food database entry.
${rows.map((r, i) => `${i + 1}. is "${r.term}" a synonym for: ${stripBrands(r.description)}`).join('\n')}

For each line answer yes or no.

Reply with a numbered list, yes or no on each line, in the same order, nothing else:
1. yes`;

// The second opinion, worded from the searcher's side. The synonym question
// alone was too strict: it said no to "broadbeans" for "Broadbeans (fava
// beans), mature seeds, cooked" and "toaster pastry" for "Toaster pastries,
// brown-sugar-cinnamon".
const happyPrompt = (rows) => `Each line gives what someone typed into a food search box and a food database entry.
${rows.map((r, i) => `${i + 1}. searched "${r.term}" and got: ${stripBrands(r.description)}`).join('\n')}

For each line: would this person be happy with this result? Answer yes if it is the food they asked for, or an ordinary version of it.

Reply with a numbered list, yes or no on each line, in the same order, nothing else:
1. yes`;

/**
 * Asks, for every decided name, whether the food that won it really is that
 * food ("rolled oats" for "Cereals, CREAM OF RICE, dry": no). An owner is only
 * barred when it fails both questions; it then loses the name, and the name
 * goes back to arbitration among the rest. Returns how many were barred, or
 * null when paused.
 */
async function checkNames() {
    let failed = 0;
    while (!stopRequested()) {
        const rows = JSON.parse(
            psql(`SELECT coalesce(json_agg(t), '[]') FROM (
                SELECT a.kind, a.term, a.winner, f.description
                FROM name_arbitration a JOIN food f ON f.fdc_id = a.winner
                WHERE NOT a.checked
                ORDER BY a.kind, a.term
                LIMIT ${BATCH}) t;`).trim(),
        );
        if (!rows.length) return failed;
        const left = psql(`SELECT count(*) FROM name_arbitration WHERE NOT checked;`).trim();
        status('check', `Checking each owner is right for its name: ${left} left`);

        const answers = await askLines(rows, synonymPrompt);
        const verdicts = rows.map((r, i) => ({ ...r, ok: /^y/i.test(answers[i] ?? '') }));
        const doubtful = verdicts.filter((v) => !v.ok);
        if (doubtful.length) {
            const second = await askLines(doubtful, happyPrompt);
            doubtful.forEach((v, k) => {
                if (/^y/i.test(second[k] ?? '')) v.ok = true;
            });
        }
        const bad = verdicts.filter((v) => !v.ok);
        failed += bad.length;
        for (const v of bad) log(`check: "${v.term}" is not "${v.description}" (${v.kind})`);
        psql(`WITH v AS (SELECT * FROM json_to_recordset(${jsonLiteral(verdicts)}) AS x(kind text, term text, winner integer, ok boolean)),
              done AS (UPDATE name_arbitration a SET checked = true FROM v
                       WHERE v.ok AND a.kind = v.kind AND a.term = v.term AND a.winner = v.winner RETURNING 1),
              barred AS (INSERT INTO name_rejected (kind, term, fdc_id, confirmed)
                         SELECT kind, term, winner, true FROM v WHERE NOT ok ON CONFLICT DO NOTHING RETURNING 1),
              cleared AS (UPDATE food f SET
                              common_name = CASE WHEN v.kind = 'common' AND f.common_name = v.term THEN NULL ELSE f.common_name END,
                              noun = CASE WHEN v.kind = 'noun' AND f.noun = v.term THEN NULL ELSE f.noun END,
                              common_name_2 = CASE WHEN v.kind = 'common2' AND f.common_name_2 = v.term THEN NULL ELSE f.common_name_2 END,
                              common_name_3 = CASE WHEN v.kind = 'common3' AND f.common_name_3 = v.term THEN NULL ELSE f.common_name_3 END
                          FROM v WHERE NOT v.ok AND f.fdc_id = v.winner RETURNING 1)
              DELETE FROM name_arbitration a USING v
              WHERE NOT v.ok AND a.kind = v.kind AND a.term = v.term AND a.winner = v.winner;`);
    }
    return null;
}

/**
 * Bars made on the synonym question alone (before the second opinion existed)
 * are asked again from the searcher's side. A food that passes is cleared, and
 * its name is decided again with it back in the running.
 */
async function secondOpinion() {
    while (!stopRequested()) {
        const rows = JSON.parse(
            psql(`SELECT coalesce(json_agg(t), '[]') FROM (
                SELECT r.kind, r.term, r.fdc_id, f.description
                FROM name_rejected r JOIN food f USING (fdc_id)
                WHERE NOT r.confirmed
                ORDER BY r.kind, r.term
                LIMIT ${BATCH}) t;`).trim(),
        );
        if (!rows.length) return true;
        const left = psql(`SELECT count(*) FROM name_rejected WHERE NOT confirmed;`).trim();
        status('check', `Second opinion on earlier rejections: ${left} left`);

        const answers = await askLines(rows, happyPrompt);
        const verdicts = rows.map((r, i) => ({ kind: r.kind, term: r.term, fdc_id: r.fdc_id, ok: /^y/i.test(answers[i] ?? '') }));
        for (const v of verdicts.filter((x) => x.ok)) log(`check: second opinion clears "${v.term}" for ${v.fdc_id}`);
        psql(`WITH v AS (SELECT * FROM json_to_recordset(${jsonLiteral(verdicts)}) AS x(kind text, term text, fdc_id integer, ok boolean)),
              cleared AS (DELETE FROM name_rejected r USING v
                          WHERE v.ok AND r.kind = v.kind AND r.term = v.term AND r.fdc_id = v.fdc_id RETURNING 1),
              redo AS (DELETE FROM name_arbitration a USING v
                       WHERE v.ok AND a.kind = v.kind AND a.term = v.term RETURNING 1)
              UPDATE name_rejected r SET confirmed = true FROM v
              WHERE NOT v.ok AND r.kind = v.kind AND r.term = v.term AND r.fdc_id = v.fdc_id;`);
    }
    return false;
}

/**
 * A name whose every candidate was barred would have no owner, which is worse
 * for search than an imperfect one: it goes back to the food that was given it
 * (the lowest id when several were), marked 'restored'.
 */
function restoreOrphans() {
    for (const [kind, col] of Object.entries(KIND_COLS)) {
        psql(`INSERT INTO name_arbitration (kind, term, winner, candidates, method, checked)
              SELECT '${kind}', f.${col}_raw, min(f.fdc_id), count(*), 'restored', true
              FROM food f
              WHERE f.${col}_raw <> ''
                AND NOT EXISTS (SELECT 1 FROM name_arbitration a WHERE a.kind = '${kind}' AND a.term = f.${col}_raw)
              GROUP BY f.${col}_raw
              ON CONFLICT DO NOTHING;`);
        applyDecisions(kind, col);
    }
}

/** Second opinions, arbitration, then the check, until nothing more is barred. */
async function checkAll() {
    if (!(await secondOpinion())) return false;
    for (let round = 0; round < 4; round++) {
        for (const kind of Object.keys(KIND_COLS)) if (!(await arbitrate(kind))) return false;
        restoreOrphans();
        const failed = await checkNames();
        if (failed === null) return false;
        if (failed === 0) return true;
    }
    return true;
}

// ------------------------------------------------------------- other names

// Second and third names for the same food, one level at a time ("chickpea" ->
// "garbanzo bean"). Each level is checked three ways before it is stored:
// plain rules, a "same food?" relation question and a stricter yes/no question
// that both have to pass. Tested on 100-food samples: about 90% of the names
// kept were right, and the checks lean towards rejecting a good name over
// keeping a wrong one.
const ALT_COLS = { 2: 'common_name_2', 3: 'common_name_3' };

const COOK_WORDS = /\b(boiled|roasted|braised|cooked|fried|baked|steamed|stewed|grilled|broiled|microwaved|sauteed|sautéed|poached|heated|toasted)\b/;
const singularWord = (w) =>
    w.length > 4 && w.endsWith('es') && !w.endsWith('ses') ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w;
const sameWords = (n) => n.split(/[ -]+/).map(singularWord).join(' ');
const brandWordsOf = (description) =>
    (description.match(/[A-Za-z'&.]*[A-Z]{3,}[A-Za-z'&.]*/g) ?? [])
        .map((w) => w.toLowerCase().replace(/[^a-z]/g, ''))
        .filter((w) => w.length > 2 && !NOT_BRANDS.has(w));

const FILLER = new Set(['and', 'with', 'of', 'the', 'in', 'a', 'for', 'or']);
const contentWords = (text) => text.split(/[^a-z]+/).filter((w) => w && !FILLER.has(w)).map(singularWord);

/** Why a proposed name is thrown out without asking the model, or null. */
function ruleReject(food, name) {
    // A third name must be genuinely different: sharing a word with the first two
    // names gave near-duplicates ("beef noodle" for "beef noodle soup").
    if (food.names.length > 1) {
        const used = new Set(food.names.flatMap(contentWords));
        if (contentWords(name).some((w) => used.has(w))) return 'shares a word with an earlier name';
    }
    const cooking = name.match(COOK_WORDS);
    if (cooking && !food.names.some((n) => (n.match(COOK_WORDS) ?? [])[0] === cooking[0])) return 'cooking word';
    if (food.names.some((n) => sameWords(n) === sameWords(name))) return 'plural of a name it has';
    const squashed = name.replace(/[^a-z]/g, '');
    if (brandWordsOf(food.description).some((b) => squashed.includes(b))) return 'brand';
    return null;
}

const altPrompt = (foods) => `Food database entries, each followed by the common names a shopper already uses for it:
${foods.map((f, i) => `${i + 1}. ${stripBrands(f.description)} -> ${f.names.join(', ')}`).join('\n')}

For each entry, give ONE other name a shopper might type to find this same food, different from the names given: a regional or alternative name, an older or newer name, or a shorter or differently worded everyday name.

Examples (different foods):
zucchini -> courgette
scallion -> green onion
ground beef -> minced beef
rutabaga -> swede
garbanzo bean -> chickpea
corned beef brisket -> corned beef
sprouted alfalfa seed -> alfalfa sprout
cola -> soda
beef top sirloin steak -> sirloin steak

Rules: the same food, not a more general or more specific food; not a brand; not a plural or spelling variant; not the same words reordered. Singular, lowercase.
Many foods have one. Write none only when people really use no other name for it.

Reply with a numbered list, one line per entry, in the same order, nothing else:
1. name or none`;

const pairLines = (pairs) => pairs.map((p, i) => `${i + 1}. ${stripBrands(p.description)} | ${p.name}`).join('\n');

const relationPrompt = (pairs) => `Each line pairs a food database entry with a proposed alternative name for it.
${pairLines(pairs)}

For each line say how the alternative name relates to the entry, using exactly one word:
- same: another name for exactly this food (zucchini | courgette, scallion | green onion, ground beef | minced beef)
- narrower: a more specific kind than the entry (ground beef | ground chuck, cheddar | sharp cheddar, apple | fuji apple)
- broader: a more general thing than the entry (haddock | fish, Merlot wine | red wine, pork loin | pork)
- related: a similar but different food (raisin | currant, butter | margarine, chapati | naan, cookie | cake)
- different: unrelated or wrong

Reply with a numbered list, one word per line, in the same order, nothing else:
1. same`;

const strictPrompt = (pairs) => `Each line pairs a food database entry with a proposed alternative name for it.
${pairLines(pairs)}

For each line decide: is the alternative name just another way of saying the SAME food (same ingredient, same kind, same part)? Wording differences, regional names, abbreviations and shorter everyday names are fine.

Answer yes for examples like: zucchini | courgette; scallion | green onion; garbanzo bean | chickpea; ground beef | minced beef; portobello mushroom | portabella.
Answer no when the alternative is a different food or a different variety of it, even a closely related one: cheddar cheese | colby; red onion | white onion; chicken breast | chicken thigh; apple juice | cider; raisin | currant; Merlot wine | red wine; haddock fillet | fish; pork loin | pork chop.

Reply with a numbered list, yes or no on each line, in the same order, nothing else:
1. yes`;

/** One answer per item. A batch the model miscounts is split until it answers. */
async function askLines(items, promptFor) {
    const lines = numbered(await ask(promptFor(items)));
    if (lines.length === items.length) return lines;
    if (items.length === 1) return [''];
    const half = Math.ceil(items.length / 2);
    return [...(await askLines(items.slice(0, half), promptFor)), ...(await askLines(items.slice(half), promptFor))];
}

/** The name each food in the batch gets at this level, or '' for none. */
async function otherNames(foods) {
    const proposed = (await askLines(foods, altPrompt)).map((l) => clean(l).replace(/\.$/, ''));
    const tried = [];
    const answers = foods.map(() => '');
    foods.forEach((f, i) => {
        const name = proposed[i];
        if (!name || name === 'none' || f.names.includes(name)) return;
        const why = ruleReject(f, name);
        if (why) return log(`other names: dropped "${name}" for "${f.names[0]}" (${why})`);
        tried.push({ i, description: f.description, name });
    });
    if (tried.length) {
        const relation = await askLines(tried, relationPrompt);
        const strict = await askLines(tried, strictPrompt);
        tried.forEach((t, k) => {
            if (/^same/i.test(relation[k]) && /^y/i.test(strict[k])) answers[t.i] = t.name;
            else log(`other names: rejected "${t.name}" for "${foods[t.i].names[0]}"`);
        });
    }
    return answers;
}

/** Names already used as a common name or noun, or at an earlier level, are dropped. */
function dropCovered(level) {
    const col = ALT_COLS[level];
    const earlier = level === 3 ? `UNION SELECT common_name_2_raw FROM food WHERE common_name_2_raw <> ''` : '';
    psql(`UPDATE food SET ${col}_raw = '' WHERE ${col}_raw <> '' AND ${col}_raw IN (
              SELECT common_name_raw FROM food WHERE common_name_raw IS NOT NULL
              UNION SELECT noun_raw FROM food WHERE noun_raw IS NOT NULL ${earlier});`);
}

async function otherLevel(level) {
    const col = ALT_COLS[level];
    // Level 3 only for foods that kept a level-2 name.
    if (level === 3) psql(`UPDATE food SET common_name_3_raw = '' WHERE common_name_3_raw IS NULL AND common_name_2 IS NULL;`);
    const eligible = level === 3 ? `common_name_2 IS NOT NULL` : `true`;
    const total = Number(psql(`SELECT count(*) FROM food WHERE ${eligible};`).trim());

    while (!stopRequested()) {
        const foods = JSON.parse(
            psql(`SELECT coalesce(json_agg(t), '[]') FROM (
                SELECT fdc_id, description,
                       ${level === 3 ? 'ARRAY[common_name_raw, common_name_2]' : 'ARRAY[common_name_raw]'} AS names
                FROM food WHERE ${col}_raw IS NULL AND ${eligible}
                ORDER BY fdc_id LIMIT ${BATCH}) t;`).trim(),
        );
        if (!foods.length) break;
        const done = Number(psql(`SELECT count(*) FROM food WHERE ${col}_raw IS NOT NULL AND ${eligible};`).trim());
        status(`other${level}`, `Other names, level ${level}: ${done} of ${total} foods`);

        const answers = await otherNames(foods);
        psql(`UPDATE food f SET ${col}_raw = x.name
              FROM json_to_recordset(${jsonLiteral(foods.map((f, i) => ({ id: f.fdc_id, name: answers[i] })))}) AS x(id integer, name text)
              WHERE f.fdc_id = x.id;`);
    }
    if (stopRequested()) return false;
    dropCovered(level);
    return true;
}

// -------------------------------------------------------------------- main

// --dry kind:term,kind:term   decide those terms again and print the winners
// next to the stored ones, writing nothing.
const dryArg = process.argv.indexOf('--dry');
if (dryArg > 0) {
    const COLS = { common: 'common_name', noun: 'noun', common2: 'common_name_2', common3: 'common_name_3' };
    for (const spec of process.argv[dryArg + 1].split(',')) {
        const [kind, term] = spec.split(':');
        const col = COLS[kind];
        const foods = JSON.parse(
            psql(`SELECT coalesce(json_agg(json_build_object('fdc_id', fdc_id, 'description', description, 'common', common_name_raw) ORDER BY fdc_id), '[]')
                  FROM food WHERE ${col}_raw = (${jsonLiteral(term)} #>> '{}')
                     OR fdc_id IN (SELECT fdc_id FROM food_synonym_key WHERE key = name_key(${jsonLiteral(term)} #>> '{}'));`).trim(),
        );
        const stored = psql(`SELECT f.description FROM name_arbitration a JOIN food f ON f.fdc_id = a.winner
                             WHERE a.kind = '${kind}' AND a.term = (${jsonLiteral(term)} #>> '{}');`).trim();
        const result = foods.length ? await decide(kind, term, foods, '(dry run)') : null;
        console.log(`${kind}:${term} (${foods.length})
   was: ${stored}
   now: ${result?.winner.description ?? '-'}   [${result?.ideal ?? ''}]`.slice(0, 400));
    }
    process.exit(0);
}

if (existsSync(STOP_FILE)) unlinkSync(STOP_FILE);
// Synonyms in name form, so a name can be matched to foods that carry it.
if (ARBITRATE && dryArg < 0) {
    psql(`DROP TABLE IF EXISTS food_synonym_key;
          CREATE TABLE food_synonym_key AS SELECT DISTINCT name_key(term) AS key, fdc_id FROM food_synonym WHERE name_key(term) <> '';
          CREATE INDEX ON food_synonym_key (key);`);
}
log(`start: model ${MODEL}`);

try {
    const finished = ARBITRATE
        ? (await generate()) && (await refineNouns()) && (await arbitrate('common')) && (await arbitrate('noun')) &&
          (await otherLevel(2)) && (await arbitrate('common2')) && (await otherLevel(3)) && (await arbitrate('common3')) &&
          (await checkAll())
        : await generate();
    status(
        finished ? 'done' : 'paused',
        finished ? (ARBITRATE ? 'All foods named and arbitrated.' : 'All foods named.') : 'Paused. Start again to resume.',
    );
    log(finished ? 'done' : 'paused');
    if (finished && process.argv.includes('--hibernate-when-done')) {
        log('hibernating');
        status('done', 'All finished. Hibernating the computer.');
        execFileSync('shutdown', ['/h'], { windowsHide: true });
    }
} catch (error) {
    status('error', error.message);
    log(`error: ${error.message}`);
    process.exitCode = 1;
}
