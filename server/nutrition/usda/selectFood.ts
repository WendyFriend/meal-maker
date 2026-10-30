import type { USDAFood } from './types.js';
import { MICRONUTRIENTS } from '../../../shared/micronutrients.js';

export function getUSDAQuery(name: string): string {
    return name
        .replace(/\blinseeds?\b/gi, 'flaxseed')
        .replace(/\bflax seeds?\b/gi, 'flaxseed');
}

function tokens(name: string): string[] {
    return (
        getUSDAQuery(name)
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

export function selectUSDAFood(
    name: string,
    foods: USDAFood[],
): USDAFood | undefined {
    const query = tokens(name);
    const candidates = foods.filter((food) =>
        matchesFoodDescription(name, food.description),
    );
    const score = (food: USDAFood) => {
        const words = tokens(food.description);
        const head = tokens(food.description.split(',')[0]);
        let value = head.some((word) => query.includes(word)) ? 10 : 0;
        // Prefer a complete reference record over a sparse branded record
        // when both describe the requested food and preparation.
        value += MICRONUTRIENTS.filter(({ usda }) =>
            food.foodNutrients.some(
                (nutrient) =>
                    nutrient.nutrientNumber === String(usda) &&
                    Number.isFinite(nutrient.value) &&
                    nutrient.value >= 0,
            ),
        ).length;
        // Prefer the plain food over an unrequested cooking/processing variant.
        for (const group of preparations) {
            if (
                !group.some((word) => query.includes(word)) &&
                group.some((word) => words.includes(word))
            ) {
                value -=
                    group.includes('raw') || group.includes('dry') ? 0 : 15;
            }
        }
        if (
            query.includes('soybean') &&
            !query.includes('green') &&
            words.includes('green')
        )
            value -= 20;
        return value - words.length / 100;
    };
    return candidates.sort((a, b) => score(b) - score(a))[0];
}
