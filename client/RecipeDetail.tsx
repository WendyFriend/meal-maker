import { useImperativeHandle, useRef, useState, type Ref } from 'react';
import type { DetailEditorHandle } from './components/DetailEditorHandle';
import type { Recipe } from '../shared/types/recipe';
import type {
    GenerateMealResponse,
    UserIngredient,
} from '../shared/types/types';
import type { RecipeInput } from './services/recipeService';
import CreateRecipe from './CreateRecipe';
import MealResult from './meal-generator/components/MealResult';
import './RecipeDetail.css';

function toMeal(recipe: Recipe): GenerateMealResponse {
    return {
        mealName: recipe.recipeName,
        ingredients: recipe.ingredients.map((ingredient) => ({
            ...ingredient,
        })),
        instructions: [...recipe.instructions],
    };
}

export default function RecipeDetail({
    recipe,
    savedIngredients = [],
    ref,
    onSave,
    onEditorStateChange,
}: {
    ref?: Ref<DetailEditorHandle>;
    recipe: Recipe;
    savedIngredients?: UserIngredient[];
    onSave: (recipe: Recipe) => Promise<Recipe>;
    onEditorStateChange: (state: { editing: boolean; saving: boolean }) => void;
}) {
    const [originalMeal, setOriginalMeal] = useState(() => toMeal(recipe));
    const [meal, setMeal] = useState(originalMeal);
    const [editing, setEditing] = useState(false);
    const [journalEntryId, setJournalEntryId] = useState<string | null>(null);
    const [resetVersion, setResetVersion] = useState(0);
    const pending = useRef(false);

    useImperativeHandle(ref, () => ({
        edit: () => {
            if (pending.current) return;
            setEditing(true);
            onEditorStateChange({ editing: true, saving: false });
        },
    }));

    function cancelEditing() {
        if (pending.current) return;
        setMeal(originalMeal);
        setEditing(false);
        setResetVersion((current) => current + 1);
        onEditorStateChange({ editing: false, saving: false });
    }

    async function saveEditedRecipe(input: RecipeInput) {
        if (pending.current) return;
        pending.current = true;
        onEditorStateChange({ editing: true, saving: true });
        try {
            const updated = await onSave({ ...recipe, ...input });
            const saved = toMeal(updated);
            setOriginalMeal(saved);
            setMeal(saved);
            setEditing(false);
            setResetVersion((current) => current + 1);
            onEditorStateChange({ editing: false, saving: false });
        } catch (error) {
            onEditorStateChange({ editing: true, saving: false });
            throw error;
        } finally {
            pending.current = false;
        }
    }

    if (editing) {
        return (
            <CreateRecipe
                formId="meal-detail-form"
                initialRecipe={{
                    recipeName: meal.mealName,
                    ingredients: meal.ingredients,
                    instructions: meal.instructions,
                }}
                savedIngredients={savedIngredients}
                onSave={saveEditedRecipe}
                onCancel={cancelEditing}
            />
        );
    }

    return (
        <div className="recipe-detail">
            <MealResult
                key={resetVersion}
                meal={meal}
                originalMeal={originalMeal}
                onChange={(next) => {
                    setMeal(next);
                    setEditing(true);
                    onEditorStateChange({ editing: true, saving: false });
                }}
                showBookmark={false}
                showSavedStar
                journalControl={{
                    entryId: journalEntryId,
                    onChange: setJournalEntryId,
                }}
                showWeightControls={false}
            />
        </div>
    );
}
