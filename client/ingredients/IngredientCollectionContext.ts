import { createContext } from 'react';
import type { IngredientInfo, UserIngredient } from '../../shared/types/types';

// Sheets share the App's saved ingredient state rather than fetching their own copy.
export const IngredientCollectionContext = createContext<{
    ingredients: UserIngredient[];
    save: (ingredient: IngredientInfo) => Promise<void>;
} | null>(null);
