import type { IngredientInfo } from '../../../shared/types/types';
import NutritionDialog from './NutritionDialog';

type IngredientNutritionSheetProps = {
    ingredient: IngredientInfo & {
        weight?: number;
        nutritionUnavailable?: true;
    };
    onClose: () => void;
    onNutritionResolved?: (ingredient: IngredientInfo) => void;
};

export default function IngredientNutritionSheet({
    ingredient,
    onClose,
    onNutritionResolved,
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
            onSave={async () => undefined}
            editable={false}
        />
    );
}
