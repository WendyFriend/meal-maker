import { useEffect, useRef, useState } from 'react';
import type { UserIngredient } from '../shared/types/types';
import NutritionDialog from './meal-generator/components/NutritionDialog';
import ActionMenu from './meal-generator/components/ActionMenu';
import './MyIngredients.css';

type MyIngredientsProps = {
    ingredients: UserIngredient[];
    onUpdate: (
        ingredientId: string,
        ingredient: UserIngredient,
    ) => Promise<void>;
    onDelete: (ingredient: UserIngredient) => Promise<void>;
    onAdd: () => void;
};

export default function MyIngredients({
    ingredients,
    onUpdate,
    onDelete,
    onAdd,
}: MyIngredientsProps) {
    const [search, setSearch] = useState('');
    // Ingredient currently being edited.
    const [selectedIngredient, setSelectedIngredient] =
        useState<UserIngredient | null>(null);

    // Ingredient whose long-press action menu is currently open.
    const [actionMenuIngredient, setActionMenuIngredient] =
        useState<UserIngredient | null>(null);

    const [isSaving, setIsSaving] = useState(false);

    const [deletingIngredientId, setDeletingIngredientId] = useState<
        string | null
    >(null);

    /*
     * Timer used to detect a long press.
     *
     * When the user presses an ingredient, we start a 500ms timer.
     * If they release before 500ms, we cancel it.
     * If they keep holding for 500ms, we treat it as a long press.
     */
    const longPressTimer = useRef<number | null>(null);

    /*
     * Remember whether the current interaction became a long press.
     *
     * This is needed because a long press can still cause a click event
     * when the user releases the mouse/finger.
     *
     * true  = this interaction was already handled as a long press
     * false = this interaction should be treated as a normal tap
     */
    const didLongPress = useRef(false);

    const filteredIngredients = ingredients.filter((ingredient) =>
        ingredient.name.toLowerCase().includes(search.trim().toLowerCase()),
    );

    /*
     * Cancel the pending long-press timer.
     */
    function clearLongPressTimer() {
        if (longPressTimer.current !== null) {
            window.clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    }

    /*
     * User starts pressing an ingredient.
     *
     * We don't know yet whether this is a tap or a long press,
     * so we wait 500ms before deciding.
     */
    function handlePointerDown(ingredient: UserIngredient) {
        didLongPress.current = false;

        // Make sure there isn't an old timer still running.
        clearLongPressTimer();

        longPressTimer.current = window.setTimeout(() => {
            /*
             * The user has held the ingredient for 500ms.
             * This is now a long press.
             */
            didLongPress.current = true;

            // Close the edit dialog if it happens to be open.
            setSelectedIngredient(null);

            // Open the action menu for this ingredient.
            setActionMenuIngredient(ingredient);

            // The timer has finished.
            longPressTimer.current = null;
        }, 500);
    }

    /*
     * User releases the mouse/finger.
     *
     * If this happened before 500ms, cancel the long press.
     * If the 500ms timer already fired, there is nothing to cancel.
     */
    function handlePointerUp() {
        clearLongPressTimer();
    }

    /*
     * User taps an ingredient.
     *
     * If the interaction was actually a long press,
     * ignore this click.
     *
     * Otherwise, open the nutrition editor.
     */
    function handleIngredientClick(ingredient: UserIngredient) {
        if (didLongPress.current) {
            didLongPress.current = false;
            return;
        }

        setSelectedIngredient(ingredient);
    }

    /*
     * Save changes from the nutrition dialog.
     */
    async function handleSave(updatedIngredient: UserIngredient) {
        if (!updatedIngredient.ingredientId) return;

        try {
            setIsSaving(true);

            await onUpdate(updatedIngredient.ingredientId, updatedIngredient);

            setSelectedIngredient(null);
        } catch (error) {
            console.error(error);
        } finally {
            setIsSaving(false);
        }
    }

    async function handleDelete() {
        if (!actionMenuIngredient?.ingredientId) return;

        const ingredient = actionMenuIngredient;
        const ingredientId = ingredient.ingredientId;

        setActionMenuIngredient(null);
        setDeletingIngredientId(ingredientId!);

        await new Promise((res) => setTimeout(res, 250));

        try {
            // setIsSaving(true);

            await onDelete(actionMenuIngredient);

            // setActionMenuIngredient(null);
        } catch (error) {
            console.error(error);
        } finally {
            setDeletingIngredientId(null);
        }
    }

    /*
     * Make sure we don't leave a timer running if the component
     * is removed from the page.
     */
    useEffect(() => {
        return () => {
            clearLongPressTimer();
        };
    }, []);

    return (
        <main className="my-ingredients">
            <div className="ingredient-search-field">
                <span className="ingredient-search-icon" aria-hidden="true">
                    🔍
                </span>

                <div className="ingredient-search-input">
                    <input
                        className="ingredient-search"
                        type="search"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search ingredients..."
                        aria-label="Search ingredients"
                    />
                </div>
            </div>

            {filteredIngredients.map((ingredient) => (
                <div
                    key={ingredient.ingredientId ?? ingredient.name}
                    className={`ingredient-row-wrapper ${
                        deletingIngredientId === ingredient.ingredientId
                            ? 'ingredient-row-wrapper-deleting'
                            : ''
                    } ${
                        actionMenuIngredient?.ingredientId ===
                        ingredient.ingredientId
                            ? 'ingredient-row-wrapper-selected'
                            : ''
                    }`}
                >
                    <button
                        type="button"
                        className="ingredient-row"
                        onPointerDown={() => handlePointerDown(ingredient)}
                        onPointerUp={handlePointerUp}
                        onPointerCancel={handlePointerUp}
                        onPointerLeave={handlePointerUp}
                        onClick={() => handleIngredientClick(ingredient)}
                    >
                        <span className="ingredient-icon" aria-hidden="true">
                            🥕
                        </span>

                        <span className="ingredient-row-info">
                            <strong>{ingredient.name}</strong>

                            <span>
                                {ingredient.caloriesPer100g !== undefined
                                    ? `${ingredient.caloriesPer100g} kcal`
                                    : 'Calories not set'}
                                {' · '}
                                {ingredient.proteinPer100g !== undefined
                                    ? `${ingredient.proteinPer100g}g protein`
                                    : 'Protein not set'}
                                {' / 100g'}
                            </span>
                        </span>
                    </button>
                </div>
            ))}

            <button
                type="button"
                className="add-ingredient-button"
                onClick={onAdd}
                aria-label="Add ingredient"
            >
                <span aria-hidden="true">+</span>
            </button>

            {/* Normal tap → edit ingredient */}
            {selectedIngredient && (
                <NutritionDialog
                    ingredientInfo={selectedIngredient}
                    onClose={() => setSelectedIngredient(null)}
                    onSave={handleSave}
                    // showSaveOption={false}
                    // disabled={isSaving}
                />
            )}
            {/* Long press → action menu */}
            <ActionMenu
                open={actionMenuIngredient !== null}
                items={[
                    {
                        label: 'Delete',
                        icon: '🗑',
                        destructive: true,
                        onClick: handleDelete,
                    },
                ]}
                onClose={() => setActionMenuIngredient(null)}
            />
        </main>
    );
}
