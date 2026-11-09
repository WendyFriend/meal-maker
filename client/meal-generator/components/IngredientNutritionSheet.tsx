import type { IngredientNutrition } from '../../../shared/types/types';
import NutritionDialog from './NutritionDialog';

type IngredientNutritionSheetProps = {
    ingredient: IngredientNutrition & { weight?: number };
    onClose: () => void;
};

export default function IngredientNutritionSheet({
    ingredient,
    onClose,
}: IngredientNutritionSheetProps) {
    return (
        <NutritionDialog
            ingredientInfo={ingredient}
            onClose={onClose}
            onSave={async () => undefined}
            editable={false}
        />
    );
}
