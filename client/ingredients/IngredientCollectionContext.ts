import { createContext } from 'react';
import type { IngredientInfo, UserIngredient } from '../../shared/types/types';

// Sheets share the App's saved ingredient state rather than fetching their own copy.
export const IngredientCollectionContext = createContext<{
    ingredients: UserIngredient[];
    save: (ingredient: IngredientInfo) => Promise<void>;
    /** Removes a saved ingredient (e.g. from a sheet's ★). */
    remove?: (ingredientId: string) => Promise<void>;
    /** Opens My Ingredients (e.g. from a "Saved" toast). */
    open?: () => void;
} | null>(null);
