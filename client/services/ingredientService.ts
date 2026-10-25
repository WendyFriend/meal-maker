import { supabase } from '../lib/supabase';
import { devTable } from '../lib/devStore';
import { isDevSessionActive } from '../auth/devAuth';
import type {
    IngredientInfo,
    PantryDetails,
    UserIngredient,
} from '../../shared/types/types';
import type { Micronutrients } from '../../shared/nutrition/nutrients';

type IngredientValuesInput = IngredientInfo &
    PantryDetails & { isFavorite?: boolean };

export type UserIngredientRow = {
    id: string;
    user_id: string;
    name: string;
    calories_per_100g: number;
    protein_per_100g: number;
    carbohydrate_per_100g: number;
    fat_per_100g: number;
    sugar_per_100g: number | null;
    saturated_fat_per_100g: number | null;
    fiber_per_100g: number | null;
    quantity?: number | null;
    unit?: string | null;
    expires_on?: string | null;
    is_favorite?: boolean | null;
    usda_fdc_id?: number | null;
    usda_description?: string | null;
    micronutrients?: Micronutrients | null;
    created_at: string;
    updated_at: string;
};

const devIngredients = devTable<UserIngredientRow>('user_ingredients');

export async function saveUserIngredient(ingredient: IngredientValuesInput) {
    const values = toUserIngredientValues(ingredient);

    if (isDevSessionActive()) {
        return toUserIngredient(devIngredients.insert(values));
    }

    const { data, error } = await supabase
        .from('user_ingredients')
        .insert(values)
        .select()
        .single();

    if (error) {
        throw error;
    }

    return toUserIngredient(data as UserIngredientRow);
}

export async function getUserIngredients() {
    if (isDevSessionActive()) {
        return devIngredients
            .list()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(toUserIngredient);
    }

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
    const values = {
        ...toUserIngredientValues(ingredient),
        updated_at: new Date().toISOString(),
    };

    if (isDevSessionActive()) {
        return toUserIngredient(devIngredients.update(id, values));
    }

    const { data, error } = await supabase
        .from('user_ingredients')
        .update(values)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        throw error;
    }

    return toUserIngredient(data as UserIngredientRow);
}

/* Favourites are offered first when building a meal in the day planner. */
export async function setIngredientFavorite(id: string, isFavorite: boolean) {
    const values = {
        is_favorite: isFavorite,
        updated_at: new Date().toISOString(),
    };

    if (isDevSessionActive()) {
        return toUserIngredient(devIngredients.update(id, values));
    }

    const { data, error } = await supabase
        .from('user_ingredients')
        .update(values)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        throw error;
    }

    return toUserIngredient(data as UserIngredientRow);
}

export async function deleteUserIngredient(ingredient: UserIngredient) {
    if (isDevSessionActive()) {
        return toUserIngredient(devIngredients.remove(ingredient.ingredientId));
    }

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
        sugarPer100g: row.sugar_per_100g ?? undefined,
        saturatedFatPer100g: row.saturated_fat_per_100g ?? undefined,
        fiberPer100g: row.fiber_per_100g ?? undefined,
        quantity: row.quantity ?? undefined,
        unit: row.unit ?? undefined,
        expiresOn: row.expires_on ?? undefined,
        isFavorite: row.is_favorite ?? false,
        micronutrientsPer100g: row.micronutrients ?? undefined,
        usda:
            row.usda_fdc_id != null
                ? {
                      fdcId: row.usda_fdc_id,
                      description: row.usda_description ?? row.name,
                  }
                : undefined,
    };
}

export function toUserIngredientValues(ingredient: IngredientValuesInput) {
    return {
        name: ingredient.name,
        calories_per_100g: ingredient.caloriesPer100g,
        protein_per_100g: ingredient.proteinPer100g,
        carbohydrate_per_100g: ingredient.carbohydratePer100g,
        fat_per_100g: ingredient.fatPer100g,
        sugar_per_100g: ingredient.sugarPer100g,
        saturated_fat_per_100g: ingredient.saturatedFatPer100g,
        fiber_per_100g: ingredient.fiberPer100g,
        // null (not undefined) so clearing a value actually clears the column.
        quantity: ingredient.quantity ?? null,
        unit: ingredient.unit || null,
        expires_on: ingredient.expiresOn || null,
        // Left undefined (unchanged / column default) unless given.
        is_favorite: ingredient.isFavorite,
        usda_fdc_id: ingredient.usda?.fdcId,
        usda_description: ingredient.usda?.description,
        micronutrients: ingredient.micronutrientsPer100g,
    };
}
