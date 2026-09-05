export type USDASearchResponse = {
    foodSearchCriteria: USDAFoodSearchCriteria;
    totalHits: number;
    currentPage: number;
    totalPages: number;
    foods: USDAFood[];
};

export type USDAFoodSearchCriteria = {
    query: string;
    dataType?: string[];
    pageSize?: number;
    pageNumber?: number;
    sortBy?: string;
    sortOrder?: string;
};

export type USDAFood = {
    fdcId: number;
    dataType: string;
    description: string;
    foodNutrients: USDAAbridgedFoodNutrient[];

    // Optional fields that might be useful for selecting a food
    // brandOwner?: string;
    // ingredients?: string;
    // scientificName?: string;
    // score?: number;
};

export type USDAAbridgedFoodNutrient = {
    nutrientNumber: string;
    nutrientName: string;
    value: number;
    unitName: string;
};
