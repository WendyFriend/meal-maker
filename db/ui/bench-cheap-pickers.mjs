// Measures real token usage and accuracy for cheap cloud pickers, so cost
// estimates are based on observed prompt_eval_count rather than guesses.
//
// The picker prompt is the expensive part: ~10 candidates plus synonyms. What
// matters for cost is (a) input tokens per pick, which is roughly fixed, and
// (b) output tokens, where reasoning models cost 10-100x more for the same
// one-digit answer.
//
// Usage: node --env-file=.env db/ui/bench-cheap-pickers.mjs [model names...]
import { execFile } from 'node:child_process';

const OLLAMA = 'http://localhost:11434';
const PSQL = 'C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe';

const models = process.argv.slice(2).length
    ? process.argv.slice(2)
    : [
          'nemotron-3-super:cloud',
          'gpt-oss:20b',
          'gemma4:cloud',
          'glm-5.3-flash:cloud',
          'deepseek-v4.1-flash:cloud',
      ];

// Prices per million tokens, from the Ollama pricing page.
const PRICES = {
    'nemotron-3-nano:cloud': { in: 0.06, out: 0.24 },
    'nemotron-3-super:cloud': { in: 0.015, out: 0.6 },
    'nemotron-3-ultra:cloud': { in: 0.1, out: 3.0 },
    'gpt-oss:20b': { in: 0.07, out: 0.3 },
    'gpt-oss:120b': { in: 0.15, out: 0.6 },
    'gemma4:cloud': { in: 0.14, out: 0.4 },
    'glm-5.3-flash:cloud': { in: 0.15, out: 0.5 },
    'minimax-m3.1-flash:cloud': { in: 0.15, out: 0.6 },
    'deepseek-v4.1-flash:cloud': { in: 0.3, out: 1.2 },
    'minimax-m3:cloud': { in: 0.6, out: 2.4 },
    'mistral-large-3:cloud': { in: 0.5, out: 1.5 },
};

const ITEMS = [
    { query: 'tomatoes',   want: /^tomatoes?, red, ripe, raw/i },
    { query: 'milk',       want: /^milk, whole, 3\.25%/i },
    { query: 'onions',     want: /^onions?, raw$/i },
    { query: 'spinach',    want: /^spinach, raw$/i },
    { query: 'potatoes',   want: /^potatoes, flesh and skin, raw$/i },
    { query: 'olive oil',  want: /^oil, olive, salad or cooking$/i },
    { query: 'banana',     want: /^bananas?, raw$/i },
    { query: 'garlic',     want: /^garlic, raw$/i },
    { query: 'yogurt',     want: /^yogurt, plain, whole milk$/i },
    { query: 'lentils',    want: /^lentils, raw$/i },
];

const dbUrl = process.env.NUTRITION_DATABASE_URL;
if (!dbUrl) {
    console.error('NUTRITION_DATABASE_URL is not set.');
    process.exit(1);
}
const parsed = new URL(dbUrl);

function query(sql) {
    return new Promise((resolve, reject) => {
        const child = execFile(
            PSQL,
            [
                '-h', parsed.hostname,
                '-p', parsed.port || '5432',
                '-U', decodeURIComponent(parsed.username),
                '-d', parsed.pathname.replace(/^\//, ''),
                '-t', '-A', '-q', '-v', 'ON_ERROR_STOP=1', '-f', '-',
            ],
            {
                maxBuffer: 64 * 1024 * 1024,
                env: { ...process.env, PGPASSWORD: decodeURIComponent(parsed.password) },
                windowsHide: true,
            },
            (error, stdout, stderr) => {
                if (error) return reject(new Error(stderr.trim() || error.message));
                const text = stdout.trim();
                if (!text) return resolve([]);
                try {
                    resolve(JSON.parse(text));
                } catch {
                    reject(new Error(`bad output: ${text.slice(0, 150)}`));
                }
            },
        );
        child.stdin.on('error', () => {});
        child.stdin.end(sql);
    });
}

const SYSTEM =
    'You pick ONE numbered option for an ingredient a cook typed.\n' +
    'Reject options containing canned, frozen, dried, dehydrated, powdered, ' +
    'juice, mashed, cooked, boiled, fried, baked, roasted, spread, condensed ' +
    'or sweetened, unless the cook asked for that.\n' +
    'From what remains pick the plainest everyday version.\n' +
    'Reply with ONLY the number.';

/**
 * One pick. num_predict is deliberately generous (80) because reasoning models
 * emit thinking tokens that count toward the same budget; a tight budget makes
 * them return empty content and look broken.
 */
async function pick(model, queryText, candidates) {
    const list = candidates.map((c, i) => `${i + 1}. ${c.description}`).join('\n');
    const started = performance.now();

    const response = await fetch(`${OLLAMA}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model,
            stream: false,
            keep_alive: '10m',
            think: false,
            options: { temperature: 0, num_predict: 80, num_ctx: 4096 },
            messages: [
                { role: 'system', content: SYSTEM },
                { role: 'user', content: `Ingredient: ${queryText}\n\n${list}\n\nNumber:` },
            ],
        }),
    });

    const ms = Math.round(performance.now() - started);
    if (!response.ok) return { ms, error: `HTTP ${response.status}` };

    const data = await response.json();
    const content = (data.message?.content ?? '').trim();
    const m = content.match(/\d+/);
    const pickIndex = m ? Number(m[0]) - 1 : -1;

    return {
        ms,
        pick: candidates[pickIndex] ?? null,
        promptTokens: data.prompt_eval_count ?? 0,
        outputTokens: data.eval_count ?? 0,
        thinkingChars: (data.message?.thinking ?? '').length,
    };
}

// Build one candidate set per item up front so all models see identical prompts.
const candidateSets = [];
for (const item of ITEMS) {
    const rows = await query(
        `SELECT coalesce(json_agg(row_to_json(t)), '[]') FROM (
            SELECT fdc_id, description FROM search_food('${item.query.replace(/'/g, "''")}', 10)
        ) t;`,
    );
    const correct = rows.find((c) => item.want.test(c.description));
    if (correct) candidateSets.push({ item, rows, correct });
}

console.log(`measuring ${models.length} models over ${candidateSets.length} scored items\n`);

const results = [];

for (const model of models) {
    let correct = 0;
    let errors = 0;
    let totalPrompt = 0;
    let totalOutput = 0;
    let totalMs = 0;
    let calls = 0;
    let thinkingChars = 0;

    for (const set of candidateSets) {
        const r = await pick(model, set.item.query, set.rows);
        if (r.error) {
            errors++;
            console.log(`  ${model} ${set.item.query}: ${r.error}`);
            continue;
        }
        calls++;
        totalPrompt += r.promptTokens;
        totalOutput += r.outputTokens;
        totalMs += r.ms;
        thinkingChars += r.thinkingChars;
        if (r.pick?.fdc_id === set.correct.fdc_id) correct++;
    }

    const price = PRICES[model];
    const avgPrompt = totalPrompt / Math.max(calls, 1);
    const avgOutput = totalOutput / Math.max(calls, 1);
    const costPer1000 = price
        ? ((avgPrompt * 1000) / 1e6) * price.in + ((avgOutput * 1000) / 1e6) * price.out
        : null;

    results.push({
        model,
        correct,
        calls,
        errors,
        avgPrompt: Math.round(avgPrompt),
        avgOutput: Math.round(avgOutput),
        avgMs: Math.round(totalMs / Math.max(calls, 1)),
        costPer1000,
        costPer100k: costPer1000 != null ? costPer1000 * 100 : null,
        thinking: thinkingChars,
    });

    console.log(
        `${model.padEnd(28)} ${correct}/${calls} correct  ` +
            `in ${Math.round(avgPrompt)} out ${Math.round(avgOutput)} tok  ` +
            `${Math.round(totalMs / Math.max(calls, 1))}ms  ` +
            `${costPer1000 != null ? '$' + costPer1000.toFixed(4) + '/1k' : 'n/a'}` +
            `${errors ? `  (${errors} errors)` : ''}`,
    );
}

console.log('\n\ncost table (from measured tokens)');
console.log('model                        acc     tok in/out   latency   $/1k picks   $/100k picks');
for (const r of results) {
    console.log(
        `${r.model.padEnd(28)} ${String(r.correct + '/' + r.calls).padEnd(7)} ` +
            `${String(r.avgPrompt).padStart(5)} / ${String(r.avgOutput).padStart(4)}   ` +
            `${String(r.avgMs).padStart(5)}ms   ` +
            `${(r.costPer1000 != null ? '$' + r.costPer1000.toFixed(4) : 'n/a').padStart(10)}   ` +
            `${(r.costPer100k != null ? '$' + r.costPer100k.toFixed(2) : 'n/a').padStart(10)}`,
    );
}
