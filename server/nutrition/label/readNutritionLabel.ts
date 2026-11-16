import { askVisionJson, imageFromRequest } from '../../ai/vision.js';
import type { NutritionLabelScan } from '../../../shared/types/types.js';

const KJ_PER_KCAL = 4.184;

const systemPrompt = `You read food nutrition labels from photos.
Reply with JSON only, in exactly this shape:
{
  "productName": string | null,
  "servingSizeGrams": number | null,
  "per100g": Values | null,
  "perServing": Values | null
}
Values = {
  "energyKcal": number | null,
  "energyKj": number | null,
  "protein": number | null,
  "carbohydrate": number | null,
  "fat": number | null,
  "saturatedFat": number | null,
  "sugar": number | null,
  "fiber": number | null
}
Amounts are grams except energy. Treat a per 100ml column as per100g.
Copy numbers exactly as printed. Use null for anything not printed or unreadable; never guess.
"carbohydrate" is total carbohydrate. "sugar" is total sugars, not added sugars.
If the image is not a nutrition label, return every field as null.`;

type Values = Partial<
    Record<
        | 'energyKcal'
        | 'energyKj'
        | 'protein'
        | 'carbohydrate'
        | 'fat'
        | 'saturatedFat'
        | 'sugar'
        | 'fiber',
        unknown
    >
>;

const fieldMap = [
    ['proteinPer100g', 'protein'],
    ['carbohydratePer100g', 'carbohydrate'],
    ['fatPer100g', 'fat'],
    ['saturatedFatPer100g', 'saturatedFat'],
    ['sugarPer100g', 'sugar'],
    ['fiberPer100g', 'fiber'],
] as const;

function amount(value: unknown): number | undefined {
    const number =
        typeof value === 'string'
            ? Number(value.replace(/[^\d.]/g, ''))
            : value;
    return typeof number === 'number' && Number.isFinite(number) && number >= 0
        ? number
        : undefined;
}

function hasValues(values: unknown): values is Values {
    return (
        typeof values === 'object' &&
        values !== null &&
        Object.values(values).some((value) => amount(value) !== undefined)
    );
}

const round = (value: number) => Math.round(value * 10) / 10;

/**
 * Turns the model's reading into per-100g values. A per-serving column is
 * scaled by the serving size; kilojoules fill in missing kilocalories.
 * Values the label does not show are left out, never set to zero.
 */
export function labelToPer100g(reading: unknown): NutritionLabelScan {
    const raw =
        typeof reading === 'object' && reading !== null
            ? (reading as Record<string, unknown>)
            : {};
    const serving = amount(raw.servingSizeGrams);
    const source = hasValues(raw.per100g)
        ? { values: raw.per100g, scale: 1 }
        : hasValues(raw.perServing) && serving
          ? { values: raw.perServing, scale: 100 / serving }
          : undefined;
    const productName =
        typeof raw.productName === 'string' && raw.productName.trim()
            ? raw.productName.trim().slice(0, 120)
            : undefined;
    if (!source) return { nutrition: {}, ...(productName && { productName }) };

    const { values, scale } = source;
    const kcal = amount(values.energyKcal);
    const kj = amount(values.energyKj);
    const energy = kcal ?? (kj === undefined ? undefined : kj / KJ_PER_KCAL);
    const nutrition: NutritionLabelScan['nutrition'] = {};
    if (energy !== undefined)
        nutrition.caloriesPer100g = Math.round(energy * scale);
    for (const [field, key] of fieldMap) {
        const value = amount(values[key]);
        if (value !== undefined) nutrition[field] = round(value * scale);
    }
    return { nutrition, ...(productName && { productName }) };
}

export async function handleNutritionLabel(input: unknown) {
    const image = imageFromRequest(input);
    if (!image) {
        return {
            status: 400,
            body: { message: 'Provide a JPEG, PNG or WebP photo.' },
        };
    }
    const scan = labelToPer100g(
        await askVisionJson(
            systemPrompt,
            'Read the nutrition values on this label.',
            image,
        ),
    );
    return Object.keys(scan.nutrition).length
        ? { status: 200, body: scan }
        : {
              status: 422,
              body: {
                  message:
                      'Could not read this label. Try a closer, well-lit photo.',
              },
          };
}
