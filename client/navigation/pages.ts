export type Page = keyof typeof pageConfig;

export const pageConfig = {
    'meal-maker': {
        type: 'main',
        title: 'Meal Maker',
    },
    'my-ingredients': {
        type: 'main',
        title: 'My Ingredients',
    },
    'my-journal': { type: 'main', title: 'My Day' },
    settings: { type: 'main', title: 'Settings' },
    'my-recipes': {
        type: 'main',
        title: 'My Meals',
    },
    'add-ingredient': {
        type: 'sub',
        title: 'Add Ingredient',
    },
    'ingredient-detail': {
        type: 'sub',
        title: 'Ingredient',
    },
    'recipe-detail': {
        type: 'sub',
        title: 'Recipe',
    },
    'create-recipe': {
        type: 'sub',
        title: 'Create Recipe',
    },
} as const;

export const navigationItems: {
    id: Page;
    label: string;
}[] = [
    {
        id: 'meal-maker',
        label: 'Create Meal',
    },
    {
        id: 'my-ingredients',
        label: 'My Ingredients',
    },
    {
        id: 'my-recipes',
        label: 'My Meals',
    },
    { id: 'my-journal', label: 'My Day' },
];

/*
 * Sub-pages open on top of a parent page (see pageConfig). Entering a
 * sub-page pushes a browser history entry, so the mobile back gesture
 * (swipe from the left edge, Android back button) returns to the parent
 * page instead of leaving the app.
 */
export const subPageParent: Partial<Record<Page, Page>> = {
    'add-ingredient': 'my-ingredients',
    'ingredient-detail': 'my-ingredients',
    'recipe-detail': 'my-recipes',
    'create-recipe': 'my-recipes',
};
