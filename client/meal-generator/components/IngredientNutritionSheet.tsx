import type { IngredientInfo } from '../../../shared/types/types';
import NutritionDialog from './NutritionDialog';

type IngredientNutritionSheetProps = {
    ingredient: IngredientInfo & {
        weight?: number;
        nutritionUnavailable?: true;
    };
    onClose: () => void;
    onNutritionResolved?: (ingredient: IngredientInfo) => void;
    /**
     * Saves a fix from "Doesn't look right?" (another food, a label scan or
     * corrected numbers). Without it the sheet is read-only.
     */
    onSave?: (
        ingredient: IngredientInfo,
        saveToUserIngredients: boolean,
    ) => Promise<void>;
    /** Renames from the title (My Diary); needs onSave too. */
    onRename?: (
        ingredient: IngredientInfo,
        saveToUserIngredients: boolean,
    ) => Promise<void>;
    /** Guests: the ☆ asks for an account instead of saving. */
    onStarAuthRequired?: () => boolean;
};

export default function IngredientNutritionSheet({
    ingredient,
    onClose,
    onNutritionResolved,
    onSave,
    onRename,
    onStarAuthRequired,
}: IngredientNutritionSheetProps) {
    return (
        <NutritionDialog
            ingredientInfo={
                ingredient.nutritionUnavailable
                    ? ({
                          ...ingredient,
                          caloriesPer100g: undefined,
                          proteinPer100g: undefined,
                          carbohydratePer100g: undefined,
                          fatPer100g: undefined,
                      } satisfies IngredientInfo)
                    : ingredient
            }
            onClose={onClose}
            onNutritionResolved={onNutritionResolved}
            onSave={onSave ?? (async () => undefined)}
            editable={Boolean(onSave)}
            onRename={onSave ? onRename : undefined}
            onStarAuthRequired={onStarAuthRequired}
        />
    );
}
