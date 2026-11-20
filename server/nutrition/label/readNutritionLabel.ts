import { MICRONUTRIENTS } from '../../../shared/micronutrients.js';
import type { NutritionLabelScan } from '../../../shared/types/types.js';
import { readNutritionLabelRemote } from '../mealmaker/client.js';
import type {
    MealMakerLabelAmount,
    MealMakerLabelResponse,
} from '../mealmaker/types.js';
import { imageFromRequest } from '../photo/imageFromRequest.js';
import { photoFailure, retryOnce } from '../photo/photoFailure.js';

type LabelField = keyof NutritionLabelScan['nutrition'];

const KJ_PER_KCAL = 4.184;

// Label rows to fall back on when Nutrition Lab omits `ingredient`.
const LABEL_ROWS: [LabelField, string, unit: 'g' | 'mg'][] = [
    ['proteinPer100g', 'protein', 'g'],
    ['carbohydratePer100g', 'carbohydrate', 'g'],
    ['fatPer100g', 'fatTotal', 'g'],
    ['saturatedFatPer100g', 'saturated', 'g'],
    ['sugarPer100g', 'sugars', 'g'],
    ['fiberPer100g', 'fibre', 'g'],
    ['calciumPer100g', 'calcium', 'mg'],
];

const FIELDS: LabelField[] = [
    'caloriesPer100g',
    ...LABEL_ROWS.slice(0, 6).map(([field]) => field),
    ...MICRONUTRIENTS.map(({ key }) => key),
];

function amount(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
        ? Math.round(value * 100) / 100
        : undefined;
}

/** A label cell in the wanted unit; g and mg convert, anything else is unread. */
function cell(row: MealMakerLabelAmount | null | undefined, unit: 'g' | 'mg') {
    const value = amount(row?.value);
    if (value === undefined) return undefined;
    const printed = row?.unit?.toLowerCase() ?? unit;
    if (printed === unit) return value;
    if (printed === 'g' && unit === 'mg') return amount(value * 1000);
    if (printed === 'mg' && unit === 'g') return amount(value / 1000);
    return undefined;
}

/**
 * Nutrition Lab's label reading as per-100g ingredient values. Its
 * `ingredient` wins; the per-100 column fills anything it left out. Values
 * the label does not print stay out, never zero.
 */
export function labelScanFromResponse(
    response: MealMakerLabelResponse,
): NutritionLabelScan {
    const per100 = response.per100 ?? {};
    const caloriesInKj = per100.calories?.unit?.toLowerCase() === 'kj';
    const kcal = caloriesInKj ? undefined : amount(per100.calories?.value);
    const kj = amount(
        (caloriesInKj ? per100.calories : per100.energyKj)?.value,
    );
    const fromLabel: NutritionLabelScan['nutrition'] = {
        caloriesPer100g:
            kcal ??
            (kj === undefined ? undefined : Math.round(kj / KJ_PER_KCAL)),
        ...Object.fromEntries(
            LABEL_ROWS.map(([field, row, unit]) => [
                field,
                cell(per100[row], unit),
            ]),
        ),
    };
    const ingredient = response.ingredient ?? {};
    const nested = ingredient.micronutrientsPer100g ?? {};
    const nutrition: NutritionLabelScan['nutrition'] = {};
    for (const field of FIELDS) {
        const value =
            amount(ingredient[field]) ??
            amount(nested[field.replace(/Per100g$/, '')]) ??
            fromLabel[field];
        if (value !== undefined) nutrition[field] = value;
    }
    return {
        nutrition,
        basis: response.basis === '100mL' ? '100mL' : '100g',
        warnings: (response.warnings ?? []).filter(
            (warning) => typeof warning === 'string' && warning.trim(),
        ),
    };
}

const unreadable = {
    status: 422,
    body: {
        message:
            'Couldn’t find a nutrition label. Try a closer, well-lit photo.',
    },
};

/** Reads a nutrition label photo with Nutrition Lab. */
export async function handleNutritionLabel(input: unknown) {
    const image = imageFromRequest(input);
    if (!image) {
        return {
            status: 400,
            body: { message: 'Provide a JPEG, PNG or WebP photo.' },
        };
    }
    const name =
        typeof input === 'object' &&
        input !== null &&
        'name' in input &&
        typeof input.name === 'string'
            ? input.name.trim().slice(0, 120) || undefined
            : undefined;
    try {
        const response = await retryOnce(() =>
            readNutritionLabelRemote(image, name),
        );
        if (!response.labelFound) return unreadable;
        const scan = labelScanFromResponse(response);
        return Object.keys(scan.nutrition).length
            ? { status: 200, body: scan }
            : unreadable;
    } catch (error) {
        return photoFailure(
            error,
            'Could not read the label. Please try again.',
        );
    }
}
