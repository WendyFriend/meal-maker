// Food identity checks for database matches: a match must name the same food
// in the same form ("rice" is not "rice flour") and preparation.

/** Normalises an ingredient name into a food database search term. */
export function foodSearchQuery(name: string): string {
    return name
        .replace(/\blinseeds?\b/gi, 'flaxseed')
        .replace(/\bflax seeds?\b/gi, 'flaxseed');
}

function tokens(name: string): string[] {
    return (
        foodSearchQuery(name)
            .toLowerCase()
            .replace(/\bsoy beans?\b/g, 'soybean')
            .replace(/\bedamame\b/g, 'green soybean')
            .replace(/\bgarbanzos?\b/g, 'chickpea')
            .replace(/\brolled oats\b/g, 'oats')
            .match(/[a-z0-9]+/g)
            ?.map((word) =>
                word.length > 3 && word.endsWith('s') && !word.endsWith('ss')
                    ? word.slice(0, -1)
                    : word,
            ) ?? []
    );
}

const forms = [
    ['oil'],
    ['lecithin'],
    ['flour'],
    ['powder'],
    ['bran'],
    ['germ'],
    ['milk', 'beverage', 'drink'],
    ['cheese', 'curd'],
    ['sauce'],
    ['dressing', 'mayonnaise'],
    ['margarine', 'shortening', 'spread'],
    ['butter'],
    ['soup'],
    ['juice'],
];
const preparations = [
    ['cooked', 'boiled', 'steamed'],
    ['raw', 'uncooked', 'dry', 'dried'],
    ['frozen'],
    ['canned', 'tinned'],
    ['roasted'],
    ['sprouted'],
];
const modifiers = new Set([
    ...preparations.flat(),
    'with',
    'without',
    'and',
    'or',
    'of',
    'the',
]);

export function matchesFoodDescription(
    name: string,
    description: string,
): boolean {
    const query = tokens(name);
    const candidate = tokens(description);
    const identity = query.filter((word) => !modifiers.has(word));
    if (!identity.length || !identity.every((word) => candidate.includes(word)))
        return false;
    if (
        query.includes('firm') &&
        !query.includes('extra') &&
        candidate.includes('extra')
    )
        return false;
    // A matching plant name does not make its oil/flour/etc. the same food.
    if (
        forms.some(
            (group) =>
                group.some((word) => candidate.includes(word)) &&
                !group.some((word) => query.includes(word)),
        )
    )
        return false;
    return preparations.every(
        (group) =>
            !group.some((word) => query.includes(word)) ||
            group.some((word) => candidate.includes(word)),
    );
}
