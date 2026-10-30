import type { Ref } from 'react';
import type { DetailEditorHandle } from './components/DetailEditorHandle';
import type { UserIngredient } from '../shared/types/types';
import IngredientPage from './IngredientPage';

export default function IngredientDetail({
    ingredient,
    ref,
    onUpdate,
    onEditorStateChange,
}: {
    ref?: Ref<DetailEditorHandle>;
    ingredient: UserIngredient;
    onUpdate: (id: string, ingredient: UserIngredient) => Promise<void>;
    onEditorStateChange: (state: { editing: boolean; saving: boolean }) => void;
}) {
    return (
        <IngredientPage
            ref={ref}
            ingredient={ingredient}
            onEditorStateChange={onEditorStateChange}
            onSave={(updated) =>
                onUpdate(ingredient.ingredientId, {
                    ...updated,
                    ingredientId: ingredient.ingredientId,
                })
            }
        />
    );
}
