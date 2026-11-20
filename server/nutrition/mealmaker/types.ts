export type MealMakerFood = {
    fdcId: number;
    description: string;
    // Nutrition Lab's normalized display name can preserve preparation terms
    // that are absent from the USDA description (for example, "split").
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

export type MealMakerSearchFood = MealMakerFood & {
    category?: string;
};

export type MealMakerFoodSearchResponse = {
    query: string;
    results: MealMakerSearchFood[];
};

// POST /parse: the lab splits typed text into foods, using a model when needed.
export type MealMakerParseResponse = {
    ingredients: {
        said: string;
        // The matched food's short name ("Chicken, breast").
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
        caloriesPer100g?: number;
        proteinPer100g?: number;
        carbohydratePer100g?: number;
        fatPer100g?: number;
        sugarPer100g?: number;
        saturatedFatPer100g?: number;
        fiberPer100g?: number;
        micronutrientsPer100g?: Record<string, number>;
    }[];
    requirements: {
        calories?: number;
        proteinGrams?: number;
        proteinPercentage?: number;
        servings?: number;
        dietary?: ('vegetarian' | 'vegan' | 'dairy-free' | 'gluten-free')[];
        variation?: 'different' | 'higher-protein' | 'lower-calorie';
    };
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

/** One cell of a nutrition label. "<1 g" has `value` 1 and `lessThan`. */
export type MealMakerLabelAmount = {
    text: string;
    value: number | null;
    unit: string | null;
    lessThan: boolean;
};

// POST /labels/read?ingredient=1: values the label doesn't print are null
// (or left out of `ingredient`), never 0.
export type MealMakerLabelResponse = {
    labelFound: boolean;
    servingSize: string | null;
    per100: Partial<Record<string, MealMakerLabelAmount | null>>;
    warnings?: string[];
    ingredient?: Record<string, unknown> & {
        micronutrientsPer100g?: Record<string, unknown>;
    };
    basis?: '100g' | '100mL' | null;
};

/** `POST /ingredients/scan`: the foods seen in a photo, matched. */
export type MealMakerIngredientScanResponse = {
    photoHasFood: boolean;
    ingredients?: {
        said?: string | null;
        quantity?: string | null;
        food?: MealMakerFood | null;
    }[];
};
