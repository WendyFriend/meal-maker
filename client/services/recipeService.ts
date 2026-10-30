import { supabase } from '../lib/supabase';
import type { Recipe } from '../../shared/types/recipe';
import type { MealIngredient } from '../../shared/types/types';

export type RecipeRow = {
    id: string;
    user_id: string;
    recipe_name: string;
    ingredients: MealIngredient[];
    instructions: string[];
    created_at: string;
    updated_at: string;
};

export type RecipeInput = Pick<
    Recipe,
    'recipeName' | 'ingredients' | 'instructions'
>;

export async function saveRecipe(recipe: RecipeInput) {
    const { data, error } = await supabase
        .from('recipes')
        .insert({
            recipe_name: recipe.recipeName,
            ingredients: recipe.ingredients,
            instructions: recipe.instructions,
        })
        .select()
        .single();

    if (error) {
        throw error;
    }

    return toRecipe(data as RecipeRow);
}

export async function getRecipes() {
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
    const { data, error } = await supabase
        .from('recipes')
        .update({
            recipe_name: recipe.recipeName,
            ingredients: recipe.ingredients,
            instructions: recipe.instructions,
            updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

    if (error) {
        throw error;
    }

    return toRecipe(data as RecipeRow);
}

export async function deleteRecipe(id: string) {
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

export async function deleteRecipes(ids: string[]): Promise<string[]> {
    const uniqueIds = [...new Set(ids)];
    if (!uniqueIds.length) return [];
    const { data, error } = await supabase
        .from('recipes')
        .delete()
        .in('id', uniqueIds)
        .select('id');
    if (error) throw error;
    return (data ?? []).map(({ id }) => id as string);
}

export function toRecipe(row: RecipeRow): Recipe {
    return {
        id: row.id,
        userId: row.user_id,
        recipeName: row.recipe_name,
        ingredients: row.ingredients,
        instructions: row.instructions,
    };
}

// To Do: make a function to convert Recipe to RecipeRow
