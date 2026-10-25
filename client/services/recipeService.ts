import { supabase } from '../lib/supabase';
import { devTable } from '../lib/devStore';
import { isDevSessionActive } from '../auth/devAuth';
import type { Recipe } from '../../shared/types/recipe';
import type { MealIngredient, MealType } from '../../shared/types/types';

export type RecipeRow = {
    id: string;
    user_id: string;
    recipe_name: string;
    ingredients: MealIngredient[];
    instructions: string[];
    servings: number;
    source?: 'generated' | 'manual' | null;
    meal_type?: MealType | null;
    created_at: string;
    updated_at: string;
};

export type RecipeInput = Pick<
    Recipe,
    | 'recipeName'
    | 'ingredients'
    | 'instructions'
    | 'servings'
    | 'source'
    | 'mealType'
>;

const devRecipes = devTable<RecipeRow>('recipes');

export async function saveRecipe(recipe: RecipeInput) {
    const values = toRecipeValues(recipe);

    if (isDevSessionActive()) {
        return toRecipe(devRecipes.insert(values));
    }

    const { data, error } = await supabase
        .from('recipes')
        .insert(values)
        .select()
        .single();

    if (error) {
        throw error;
    }

    return toRecipe(data as RecipeRow);
}

export async function countRecipes(): Promise<number> {
    if (isDevSessionActive()) {
        return devRecipes.list().length;
    }

    const { count, error } = await supabase
        .from('recipes')
        .select('id', { count: 'exact', head: true });

    if (error) {
        throw error;
    }

    return count ?? 0;
}

export async function getRecipes() {
    if (isDevSessionActive()) {
        return devRecipes
            .list()
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .map(toRecipe);
    }

    const { data, error } = await supabase
        .from('recipes')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        throw error;
    }

    return (data as RecipeRow[]).map(toRecipe);
}

export async function updateRecipe(id: string, recipe: Recipe) {
    const values = {
        ...toRecipeValues(recipe),
        updated_at: new Date().toISOString(),
    };

    if (isDevSessionActive()) {
        return toRecipe(devRecipes.update(id, values));
    }

    const { data, error } = await supabase
        .from('recipes')
        .update(values)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        throw error;
    }

    return toRecipe(data as RecipeRow);
}

export async function deleteRecipe(id: string) {
    if (isDevSessionActive()) {
        return toRecipe(devRecipes.remove(id));
    }

    const { data, error } = await supabase
        .from('recipes')
        .delete()
        .eq('id', id)
        .select()
        .single();

    if (error) {
        throw error;
    }

    return toRecipe(data as RecipeRow);
}

export function toRecipe(row: RecipeRow): Recipe {
    return {
        id: row.id,
        userId: row.user_id,
        recipeName: row.recipe_name,
        ingredients: row.ingredients,
        instructions: row.instructions,
        servings: row.servings ?? 1,
        source: row.source ?? 'manual',
        mealType: row.meal_type ?? undefined,
        createdAt: row.created_at,
    };
}

function toRecipeValues(recipe: RecipeInput) {
    return {
        recipe_name: recipe.recipeName,
        ingredients: recipe.ingredients,
        instructions: recipe.instructions,
        servings: recipe.servings ?? 1,
        // Undefined leaves the stored value as is on update.
        source: recipe.source,
        meal_type: recipe.mealType,
    };
}
