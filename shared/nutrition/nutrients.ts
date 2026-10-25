/*
 * Nutrients the app tracks beyond calories and the three macros, with the
 * USDA FoodData Central nutrient numbers they come from and FDA Daily
 * Values (adults, 2,000 kcal reference diet).
 */

export type NutrientGroup = 'carbs-fats' | 'minerals' | 'vitamins';

export type NutrientKey =
    | 'fiber'
    | 'sugar'
    | 'saturatedFat'
    | 'monounsaturatedFat'
    | 'polyunsaturatedFat'
    | 'transFat'
    | 'cholesterol'
    | 'sodium'
    | 'potassium'
    | 'calcium'
    | 'iron'
    | 'magnesium'
    | 'phosphorus'
    | 'zinc'
    | 'selenium'
    | 'vitaminA'
    | 'vitaminC'
    | 'vitaminD'
    | 'vitaminE'
    | 'vitaminK'
    | 'thiamin'
    | 'riboflavin'
    | 'niacin'
    | 'vitaminB6'
    | 'folate'
    | 'vitaminB12';

/* Amount per 100 g, in each nutrient's own unit. */
export type Micronutrients = Partial<Record<NutrientKey, number>>;

export type NutrientDefinition = {
    key: NutrientKey;
    label: string;
    unit: 'g' | 'mg' | 'µg';
    group: NutrientGroup;
    // USDA nutrient numbers, in order of preference.
    usdaNumbers: string[];
    // FDA Daily Value; omitted where there isn't one (e.g. sugar, trans fat).
    dailyValue?: number;
    // Nutrients to keep under the Daily Value rather than reach it.
    limit?: boolean;
};

export const NUTRIENTS: NutrientDefinition[] = [
    {
        key: 'fiber',
        label: 'Fibre',
        unit: 'g',
        group: 'carbs-fats',
        usdaNumbers: ['291'],
        dailyValue: 28,
    },
    {
        key: 'sugar',
        label: 'Sugars',
        unit: 'g',
        group: 'carbs-fats',
        usdaNumbers: ['269', '269.3'],
    },
    {
        key: 'saturatedFat',
        label: 'Saturated fat',
        unit: 'g',
        group: 'carbs-fats',
        usdaNumbers: ['606'],
        dailyValue: 20,
        limit: true,
    },
    {
        key: 'monounsaturatedFat',
        label: 'Monounsaturated fat',
        unit: 'g',
        group: 'carbs-fats',
        usdaNumbers: ['645'],
    },
    {
        key: 'polyunsaturatedFat',
        label: 'Polyunsaturated fat',
        unit: 'g',
        group: 'carbs-fats',
        usdaNumbers: ['646'],
    },
    {
        key: 'transFat',
        label: 'Trans fat',
        unit: 'g',
        group: 'carbs-fats',
        usdaNumbers: ['605'],
        limit: true,
    },
    {
        key: 'cholesterol',
        label: 'Cholesterol',
        unit: 'mg',
        group: 'carbs-fats',
        usdaNumbers: ['601'],
        dailyValue: 300,
        limit: true,
    },
    {
        key: 'sodium',
        label: 'Sodium',
        unit: 'mg',
        group: 'minerals',
        usdaNumbers: ['307'],
        dailyValue: 2300,
        limit: true,
    },
    {
        key: 'potassium',
        label: 'Potassium',
        unit: 'mg',
        group: 'minerals',
        usdaNumbers: ['306'],
        dailyValue: 4700,
    },
    {
        key: 'calcium',
        label: 'Calcium',
        unit: 'mg',
        group: 'minerals',
        usdaNumbers: ['301'],
        dailyValue: 1300,
    },
    {
        key: 'iron',
        label: 'Iron',
        unit: 'mg',
        group: 'minerals',
        usdaNumbers: ['303'],
        dailyValue: 18,
    },
    {
        key: 'magnesium',
        label: 'Magnesium',
        unit: 'mg',
        group: 'minerals',
        usdaNumbers: ['304'],
        dailyValue: 420,
    },
    {
        key: 'phosphorus',
        label: 'Phosphorus',
        unit: 'mg',
        group: 'minerals',
        usdaNumbers: ['305'],
        dailyValue: 1250,
    },
    {
        key: 'zinc',
        label: 'Zinc',
        unit: 'mg',
        group: 'minerals',
        usdaNumbers: ['309'],
        dailyValue: 11,
    },
    {
        key: 'selenium',
        label: 'Selenium',
        unit: 'µg',
        group: 'minerals',
        usdaNumbers: ['317'],
        dailyValue: 55,
    },
    {
        key: 'vitaminA',
        label: 'Vitamin A',
        unit: 'µg',
        group: 'vitamins',
        usdaNumbers: ['320'],
        dailyValue: 900,
    },
    {
        key: 'vitaminC',
        label: 'Vitamin C',
        unit: 'mg',
        group: 'vitamins',
        usdaNumbers: ['401'],
        dailyValue: 90,
    },
    {
        key: 'vitaminD',
        label: 'Vitamin D',
        unit: 'µg',
        group: 'vitamins',
        usdaNumbers: ['328'],
        dailyValue: 20,
    },
    {
        key: 'vitaminE',
        label: 'Vitamin E',
        unit: 'mg',
        group: 'vitamins',
        usdaNumbers: ['323'],
        dailyValue: 15,
    },
    {
        key: 'vitaminK',
        label: 'Vitamin K',
        unit: 'µg',
        group: 'vitamins',
        usdaNumbers: ['430'],
        dailyValue: 120,
    },
    {
        key: 'thiamin',
        label: 'Thiamin (B1)',
        unit: 'mg',
        group: 'vitamins',
        usdaNumbers: ['404'],
        dailyValue: 1.2,
    },
    {
        key: 'riboflavin',
        label: 'Riboflavin (B2)',
        unit: 'mg',
        group: 'vitamins',
        usdaNumbers: ['405'],
        dailyValue: 1.3,
    },
    {
        key: 'niacin',
        label: 'Niacin (B3)',
        unit: 'mg',
        group: 'vitamins',
        usdaNumbers: ['406'],
        dailyValue: 16,
    },
    {
        key: 'vitaminB6',
        label: 'Vitamin B6',
        unit: 'mg',
        group: 'vitamins',
        usdaNumbers: ['415'],
        dailyValue: 1.7,
    },
    {
        key: 'folate',
        label: 'Folate',
        unit: 'µg',
        group: 'vitamins',
        usdaNumbers: ['435', '417'],
        dailyValue: 400,
    },
    {
        key: 'vitaminB12',
        label: 'Vitamin B12',
        unit: 'µg',
        group: 'vitamins',
        usdaNumbers: ['418'],
        dailyValue: 2.4,
    },
];

export const NUTRIENT_GROUP_LABELS: Record<NutrientGroup, string> = {
    'carbs-fats': 'Carbs & fats',
    minerals: 'Minerals',
    vitamins: 'Vitamins',
};

export const NUTRIENTS_BY_KEY = Object.fromEntries(
    NUTRIENTS.map((nutrient) => [nutrient.key, nutrient]),
) as Record<NutrientKey, NutrientDefinition>;

/* Nutrients shown on the free plan; the rest need Trial or Pro. */
export const BASIC_NUTRIENT_KEYS: NutrientKey[] = [
    'fiber',
    'sugar',
    'saturatedFat',
    'sodium',
];

type WithMicronutrients = {
    weight: number;
    micronutrientsPer100g?: Micronutrients;
};

/* Total of each nutrient across ingredients, scaled by weight. Nutrients
   no ingredient reports are left out rather than shown as 0. */
export function sumMicronutrients(
    ingredients: WithMicronutrients[],
): Micronutrients {
    const totals: Micronutrients = {};

    for (const ingredient of ingredients) {
        const values = ingredient.micronutrientsPer100g;
        if (!values) continue;

        for (const [key, value] of Object.entries(values) as [
            NutrientKey,
            number,
        ][]) {
            if (typeof value !== 'number' || !Number.isFinite(value)) continue;
            totals[key] =
                (totals[key] ?? 0) + (value * ingredient.weight) / 100;
        }
    }

    return totals;
}

/* Share of the Daily Value, as a whole percentage; undefined without a DV. */
export function percentDailyValue(
    key: NutrientKey,
    amount: number,
): number | undefined {
    const dailyValue = NUTRIENTS_BY_KEY[key].dailyValue;

    return dailyValue ? Math.round((amount / dailyValue) * 100) : undefined;
}
