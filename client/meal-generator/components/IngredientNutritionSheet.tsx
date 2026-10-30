import { useId } from 'react';
import type { IngredientNutrition } from '../../../shared/types/types';
import IngredientNutritionContent from './IngredientNutritionContent';
import NutritionSheetDialog from './NutritionSheetDialog';

type IngredientNutritionSheetProps = {
    ingredient: IngredientNutrition & { weight?: number };
    onClose: () => void;
};

export default function IngredientNutritionSheet({
    ingredient,
    onClose,
}: IngredientNutritionSheetProps) {
    const titleId = useId();
    return (
        <NutritionSheetDialog labelledBy={titleId} onClose={onClose}>
            <IngredientNutritionContent
                ingredient={ingredient}
                titleId={titleId}
                onClose={onClose}
            />
        </NutritionSheetDialog>
    );
}
