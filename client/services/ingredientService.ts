import { supabase } from '../lib/supabase';
import type { IngredientInfo, UserIngredient } from '../../shared/types/types';

export type UserIngredientRow = {
    id: string;
    user_id: string;
    name: string;
    calories_per_100g: number;
    protein_per_100g: number;
    carbohydrate_per_100g: number;
    fat_per_100g: number;
    saturated_fat_per_100g: number | null;
    fiber_per_100g: number | null;
    created_at: string;
    updated_at: string;
};

export async function saveUserIngredient(ingredient: IngredientInfo) {
    const { data, error } = await supabase
        .from('user_ingredients')
        .insert({
            name: ingredient.name,
            calories_per_100g: ingredient.caloriesPer100g,
            protein_per_100g: ingredient.proteinPer100g,
            carbohydrate_per_100g: ingredient.carbohydratePer100g,
            fat_per_100g: ingredient.fatPer100g,
            saturated_fat_per_100g: ingredient.saturatedFatPer100g,
            fiber_per_100g: ingredient.fiberPer100g,
        })
        .select()
        .single();

    if (error) {
        throw error;
    }

    return toUserIngredient(data as UserIngredientRow);
}

export async function getUserIngredients() {
    const { data, error } = await supabase
        .from('user_ingredients')
        .select('*')
        .order('name');

    if (error) {
        throw error;
    }

    return (data as UserIngredientRow[]).map(toUserIngredient);
}

export async function updateUserIngredient(
    id: string,
    ingredient: UserIngredient,
) {
    const { data, error } = await supabase
        .from('user_ingredients')
        .update({
            name: ingredient.name,
            calories_per_100g: ingredient.caloriesPer100g,
            protein_per_100g: ingredient.proteinPer100g,
            carbohydrate_per_100g: ingredient.carbohydratePer100g,
            fat_per_100g: ingredient.fatPer100g,
            saturated_fat_per_100g: ingredient.saturatedFatPer100g,
            fiber_per_100g: ingredient.fiberPer100g,
            updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

    if (error) {
        throw error;
    }

    return toUserIngredient(data as UserIngredientRow);
}

export async function deleteUserIngredient(ingredient: UserIngredient) {
    const { data, error } = await supabase
        .from('user_ingredients')
        .delete()
        .eq('id', ingredient.ingredientId)
        .select()
        .single();

    if (error) {
        throw error;
    }

    return toUserIngredient(data as UserIngredientRow);
}

export function toUserIngredient(row: UserIngredientRow): UserIngredient {
    return {
        ingredientId: row.id,
        name: row.name,
        caloriesPer100g: row.calories_per_100g,
        proteinPer100g: row.protein_per_100g,
        carbohydratePer100g: row.carbohydrate_per_100g ?? undefined,
        fatPer100g: row.fat_per_100g ?? undefined,
        saturatedFatPer100g: row.saturated_fat_per_100g ?? undefined,
        fiberPer100g: row.fiber_per_100g ?? undefined,
    };
}

// To Do: make a function to convert UserIngredient to UserIngredientRow
