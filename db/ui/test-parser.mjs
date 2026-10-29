// Verifies the balanced-array parser against the exact malformed strings that
// glm-5.3-flash produces, so a parser bug is not mistaken for a model failure.
function firstJsonArray(text) {
    const cleaned = text.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
    try {
        const whole = JSON.parse(cleaned);
        if (Array.isArray(whole)) return whole;
        if (whole && Array.isArray(whole.terms)) return whole.terms;
        if (whole && Array.isArray(whole.synonyms)) return whole.synonyms;
    } catch {
        /* fall through */
    }

    const start = cleaned.indexOf('[');
    if (start < 0) return [];

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < cleaned.length; i++) {
        const ch = cleaned[i];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (ch === '\\') {
            escaped = true;
            continue;
        }
        if (ch === '"') {
            inString = !inString;
            continue;
        }
        if (inString) continue;
        if (ch === '[') depth++;
        else if (ch === ']') {
            depth--;
            if (depth === 0) {
                try {
                    const candidate = JSON.parse(cleaned.slice(start, i + 1));
                    return Array.isArray(candidate) ? candidate : [];
                } catch {
                    return [];
                }
            }
        }
    }
    return [];
}

const SAMPLES = {
    'prose + array + stray bracket': `The user wants search terms for "Rutabaga, raw" - a USDA food description.
Real people searching might type:
- "rutabaga"
- "raw rutabaga"
</think>["rutabaga", "raw rutabaga", "swede"]`,
    'clean array': '["a","b","c"]',
    'fenced': '```json\n["x","y"]\n```',
    'object with terms': '{"terms":["p","q"]}',
    'prose only, no array': 'I cannot help with that.',
    'array with quotes inside': '["he said \\"hi\\"","ok"]',
    'double closing bracket': '["a","b"]]',
};

for (const [label, sample] of Object.entries(SAMPLES)) {
    const result = firstJsonArray(sample);
    console.log(`${label.padEnd(30)} -> ${JSON.stringify(result)}`);
}
