// FDA Daily Values for adults and children aged 4 and older.
// These are population label references, not personalised dietary targets.
export const DAILY_VALUE_SOURCE =
    'https://www.fda.gov/food/nutrition-facts-label/daily-value-nutrition-and-supplement-facts-labels';

export const MICRONUTRIENTS = [
    {
        key: 'ironPer100g',
        label: 'Iron',
        unit: 'mg',
        dailyValue: 18,
        usda: 303,
    },
    {
        key: 'calciumPer100g',
        label: 'Calcium',
        unit: 'mg',
        dailyValue: 1300,
        usda: 301,
    },
    {
        key: 'magnesiumPer100g',
        label: 'Magnesium',
        unit: 'mg',
        dailyValue: 420,
        usda: 304,
    },
    {
        key: 'zincPer100g',
        label: 'Zinc',
        unit: 'mg',
        dailyValue: 11,
        usda: 309,
    },
    {
        key: 'seleniumPer100g',
        label: 'Selenium',
        unit: 'µg',
        dailyValue: 55,
        usda: 317,
    },
    {
        key: 'folatePer100g',
        label: 'Folate (DFE)',
        unit: 'µg',
        dailyValue: 400,
        usda: 435,
    },
    {
        key: 'vitaminCPer100g',
        label: 'Vitamin C',
        unit: 'mg',
        dailyValue: 90,
        usda: 401,
    },
    {
        key: 'vitaminB12Per100g',
        label: 'Vitamin B12',
        unit: 'µg',
        dailyValue: 2.4,
        usda: 418,
    },
] as const;

export type MicronutrientKey = (typeof MICRONUTRIENTS)[number]['key'];

export type MicronutrientValues = Partial<
    Record<(typeof MICRONUTRIENTS)[number]['key'], number>
> & {
    nutritionSource?: { fdcId: number; description: string };
    // Values the source reported as unknown; lookups for them are skipped.
    unavailableMicronutrients?: MicronutrientKey[];
};
