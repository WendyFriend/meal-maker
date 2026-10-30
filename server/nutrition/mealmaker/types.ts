export type MealMakerFood = {
    fdcId: number;
    description: string;
    // Short display name ("Chicken, breast"); absent from older API builds.
    name?: string;
    match: {
        tier: 'confident' | 'probable' | 'ambiguous' | 'weak';
        matchedVia?: string;
    };
    // Any value is null when the database has none.
    per100g: {
        kcal: number | null;
        proteinG: number | null;
        carbsG: number | null;
        fatG: number | null;
        sugarG: number | null;
        fibreG: number | null;
        satFatG: number | null;
    };
};

export type MealMakerSearchResponse = {
    query: string;
    results: MealMakerFood[];
};

// POST /parse: the lab splits typed text into foods, using a model when needed.
export type MealMakerParseResponse = {
    ingredients: {
        said: string;
        // The matched food's short name ("Chicken, breast"); absent from older API builds.
        name?: string;
        match: { fdcId: number; description: string } | null;
    }[];
};

export type MealMakerFoodDetail = {
    fdcId: number;
    description: string;
    nutrientsPer100g: {
        nbr: string;
        name: string;
        unit: string;
        amount: number;
    }[];
};

export type MealMakerGenerateRequest = {
    ingredients: {
        name: string;
        match?: {
            fdcId: number;
            description: string;
            name: string;
            caloriesPer100g: number;
            proteinPer100g: number;
            carbohydratePer100g: number;
            fatPer100g: number;
            sugarPer100g?: number;
            saturatedFatPer100g?: number;
            fiberPer100g?: number;
            nutritionSource: 'usda';
        };
    }[];
    requirements: { calories?: number };
};

export type MealMakerGeneratedIngredient = {
    name: string;
    weight: number;
    caloriesPer100g: number;
    proteinPer100g: number;
    carbohydratePer100g: number;
    fatPer100g: number;
    sugarPer100g?: number | null;
    saturatedFatPer100g?: number | null;
    fiberPer100g?: number | null;
    // Keyed like the shared micronutrient keys without the "Per100g" suffix.
    micronutrientsPer100g?: Record<string, number | null | undefined>;
    usda?: { fdcId: number; description: string };
};

export type MealMakerGenerateResponse = {
    mealName: string;
    ingredients: MealMakerGeneratedIngredient[];
    instructions: string[];
};
