// Isolates the term filter so a filter bug is not mistaken for a model failure.
// The dry run reported 14 "empty" foods; at least one of them produced valid
// terms from the model, so the filter is the suspect.
const BANNED_PHRASE = /\b(calorie|calories|nutrition|nutritional|recipe|how many|what is|versus|vs\.?)\b/i;
const VAGUE = /^(vegetable|fruit|food|meat|veggie|veggies|plant|thing|ingredient|produce|protein|grain)s?$/i;

const QUALIFIERS = [
    ['canned', /\bcanned|\btinned/i],
    ['dried', /\bdried|\bdehydrated|\bsun-dried/i],
    ['frozen', /\bfrozen/i],
    ['powdered', /\bpowder|\bpaste\b/i],
    ['sweetened', /\bsweetened|\bcondensed/i],
    ['cooked', /\bcooked|\bboiled|\bbaked|\broasted|\bfried/i],
];

function cleanTerms(raw, description) {
    const kept = [];
    const rejected = [];

    for (const term of raw) {
        if (typeof term !== 'string') {
            rejected.push({ term: String(term), reason: 'not a string' });
            continue;
        }
        const t = term.trim().toLowerCase().replace(/\s+/g, ' ');
        if (t.length < 3) rejected.push({ term: t, reason: 'too short' });
        else if (t.length > 32) rejected.push({ term: t, reason: 'too long' });
        else if (BANNED_PHRASE.test(t)) rejected.push({ term: t, reason: 'seo phrasing' });
        else if (VAGUE.test(t)) rejected.push({ term: t, reason: 'vague category' });
        else if (t.split(/\s+/).length > 4) rejected.push({ term: t, reason: 'too many words' });
        else {
            const missing = QUALIFIERS.find(
                ([, re]) => re.test(description) && !re.test(t),
            );
            if (missing) rejected.push({ term: t, reason: `drops qualifier "${missing[0]}"` });
            else if (kept.includes(t)) rejected.push({ term: t, reason: 'duplicate' });
            else kept.push(t);
        }
    }
    return { kept, rejected };
}

const CASES = [
    {
        description: 'Apricots, canned, heavy syrup, drained',
        terms: ['canned apricots in heavy syrup', 'drained canned apricots'],
    },
    {
        description: 'Turkey, wing, smoked, cooked, with skin, bone removed',
        terms: ['cooked turkey wing', 'smoked turkey wing', 'turkey wing'],
    },
    {
        description: 'Pork, cured, bacon, cooked, broiled, pan-fried or roasted, reduced sodium',
        terms: ['bacon', 'cooked bacon', 'pan-fried bacon'],
    },
    {
        description: 'Sweet Potatoes, french fried, frozen as packaged, salt added in processing',
        terms: ['frozen sweet potato fries', 'sweet potato fries', 'frozen fries'],
    },
    {
        description: 'Apple juice, canned or bottled, unsweetened, with added ascorbic acid',
        terms: ['apple juice', 'canned apple juice', 'unsweetened apple juice'],
    },
];

for (const testCase of CASES) {
    const { kept, rejected } = cleanTerms(testCase.terms, testCase.description);
    console.log(`\n${testCase.description.slice(0, 60)}`);
    console.log(`  kept    : ${kept.join(' / ') || '(none)'}`);
    console.log(`  rejected: ${rejected.map((r) => `${r.term} [${r.reason}]`).join('; ') || '(none)'}`);
}
