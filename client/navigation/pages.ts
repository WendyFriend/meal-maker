export type Page = keyof typeof pageConfig;

export const mainPagePaths = {
    'meal-maker': '/',
    'my-journal': '/my-diary',
    'my-recipes': '/my-recipes',
    'my-ingredients': '/my-ingredients',
    profile: '/profile',
} as const;

export type MainPage = keyof typeof mainPagePaths;

// Old addresses that still open their page (My Plan became My Diary).
const legacyPaths: Record<string, MainPage> = {
    '/my-plan': 'my-journal',
    '/settings': 'profile',
};

export function mainPageFromPath(pathname: string): MainPage | undefined {
    const path = pathname.replace(/\/+$/, '') || '/';
    if (legacyPaths[path]) return legacyPaths[path];
    return (Object.entries(mainPagePaths) as [MainPage, string][]).find(
        ([, route]) => route === path,
    )?.[0];
}

export const pageConfig = {
    'meal-maker': {
        type: 'main',
        title: 'Meal Maker',
    },
    'my-ingredients': {
        type: 'main',
        title: 'My Ingredients',
    },
    'my-journal': { type: 'main', title: 'My Diary' },
    profile: { type: 'main', title: 'Profile' },
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
    // A Meal Maker photo with the foods found in it.
    'meal-photo': { type: 'sub', title: 'Photo' },
    // A My Diary meal shown as a recipe; it may not exist in My Recipes.
    'plan-meal-detail': {
        type: 'sub',
        title: 'Recipe',
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
    { id: 'my-journal', label: 'My Diary' },
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
    'plan-meal-detail': 'my-journal',
    'meal-photo': 'meal-maker',
};
