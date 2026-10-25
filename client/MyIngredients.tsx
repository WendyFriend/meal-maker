import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { UserIngredient } from '../shared/types/types';
import NutritionDialog from './meal-generator/components/NutritionDialog';
import ActionMenu from './meal-generator/components/ActionMenu';
import './MyIngredients.css';
import { isUserIngredient } from './utils/Ingredient';
import { usePlan } from './plan/PlanContext';
import UpgradeNotice from './plan/UpgradeNotice';
import {
    expiryTone,
    filterExpiringSoon,
    formatPantrySummary,
} from './utils/pantry';

// Soft avatar tints, picked per ingredient name so each row is
// recognisable at a glance.
const AVATAR_TINTS = [
    { background: '#fde4df', color: '#c4523f' },
    { background: '#dce9e8', color: '#2f5f59' },
    { background: '#f7ead2', color: '#9a6a1f' },
    { background: '#e6e4f4', color: '#5a5394' },
    { background: '#e2efd9', color: '#4b7a33' },
];

function getAvatarTint(name: string) {
    let hash = 0;

    for (const char of name) {
        hash = (hash * 31 + char.charCodeAt(0)) | 0;
    }

    return AVATAR_TINTS[Math.abs(hash) % AVATAR_TINTS.length];
}

function formatGrams(value: number | undefined) {
    return value === undefined ? '–' : `${Math.round(value * 10) / 10}g`;
}

type MyIngredientsProps = {
    ingredients: UserIngredient[];
    onUpdate: (
        ingredientId: string,
        ingredient: UserIngredient,
    ) => Promise<void>;
    onDelete: (ingredient: UserIngredient) => Promise<void>;
    // Favourites are offered first when building a meal in the planner.
    onToggleFavorite?: (ingredient: UserIngredient) => void;
    onAdd: () => void;
};

export default function MyIngredients({
    ingredients,
    onUpdate,
    onDelete,
    onToggleFavorite,
    onAdd,
}: MyIngredientsProps) {
    const { limits } = usePlan();
    const [search, setSearch] = useState('');
    // Show only items expiring within a week (or already expired).
    const [expiringOnly, setExpiringOnly] = useState(false);
    const [favoritesOnly, setFavoritesOnly] = useState(false);
    // Shown when Add is pressed with the plan's ingredient limit reached.
    const [showLimitNotice, setShowLimitNotice] = useState(false);
    // Ingredient currently being edited.
    const [selectedIngredient, setSelectedIngredient] =
        useState<UserIngredient | null>(null);

    // Ingredient whose long-press action menu is currently open.
    const [actionMenuIngredient, setActionMenuIngredient] =
        useState<UserIngredient | null>(null);

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

    const hasExpiryDates = ingredients.some(
        (ingredient) => ingredient.expiresOn,
    );
    const expiringCount = filterExpiringSoon(ingredients).length;
    const favoriteCount = ingredients.filter(
        (ingredient) => ingredient.isFavorite,
    ).length;

    const ingredientLimit = limits.savedIngredients;
    const isAtLimit =
        ingredientLimit !== null && ingredients.length >= ingredientLimit;

    const matchingIngredients = ingredients.filter(
        (ingredient) =>
            ingredient.name
                .toLowerCase()
                .includes(search.trim().toLowerCase()) &&
            (!favoritesOnly || ingredient.isFavorite),
    );
    const filteredIngredients = expiringOnly
        ? filterExpiringSoon(matchingIngredients)
        : matchingIngredients;

    function handleAdd() {
        if (isAtLimit) {
            setShowLimitNotice(true);
            return;
        }
        onAdd();
    }

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
            await onUpdate(updatedIngredient.ingredientId, updatedIngredient);

            setSelectedIngredient(null);
        } catch (error) {
            console.error(error);
        } finally {
            // show error message
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
            <header className="list-page-header">
                <h1>Ingredients</h1>
                <p>
                    {ingredientLimit !== null
                        ? `${ingredients.length} of ${ingredientLimit} saved`
                        : ingredients.length === 1
                          ? '1 saved ingredient'
                          : `${ingredients.length} saved ingredients`}
                    {' · nutrition per 100g'}
                </p>
            </header>

            {showLimitNotice && isAtLimit && ingredientLimit !== null && (
                <div className="ingredients-limit-notice">
                    <UpgradeNotice
                        feature="Ingredient limit reached"
                        description={`The Free plan saves up to ${ingredientLimit} ingredients. Remove some, or upgrade for unlimited.`}
                    />
                </div>
            )}

            <div className="ingredient-search-field">
                <span className="ingredient-search-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none">
                        <circle cx="10.8" cy="10.8" r="6.8" />
                        <path d="m16 16 4.2 4.2" />
                    </svg>
                </span>

                <input
                    className="ingredient-search"
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search ingredients"
                    aria-label="Search ingredients"
                />
            </div>

            {(hasExpiryDates || expiringOnly || favoriteCount > 0) && (
                <div className="ingredient-filters">
                    {(favoriteCount > 0 || favoritesOnly) && (
                        <button
                            type="button"
                            className="ingredient-filter-chip"
                            aria-pressed={favoritesOnly}
                            onClick={() => setFavoritesOnly((value) => !value)}
                        >
                            Favourites
                            <span className="ingredient-filter-count">
                                {favoriteCount}
                            </span>
                        </button>
                    )}
                    {(hasExpiryDates || expiringOnly) && (
                        <button
                            type="button"
                            className="ingredient-filter-chip"
                            aria-pressed={expiringOnly}
                            onClick={() => setExpiringOnly((value) => !value)}
                        >
                            Expiring soon
                            <span className="ingredient-filter-count">
                                {expiringCount}
                            </span>
                        </button>
                    )}
                </div>
            )}

            {filteredIngredients.length > 0 ? (
                <div className="ingredients-list">
                    {filteredIngredients.map((ingredient) => {
                        const pantrySummary = formatPantrySummary(ingredient);
                        const tone = expiryTone(ingredient.expiresOn);

                        return (
                            <div
                                key={ingredient.ingredientId ?? ingredient.name}
                                className={`ingredient-row-wrapper ${
                                    deletingIngredientId ===
                                    ingredient.ingredientId
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
                                    onPointerDown={() =>
                                        handlePointerDown(ingredient)
                                    }
                                    onPointerUp={handlePointerUp}
                                    onPointerCancel={handlePointerUp}
                                    onPointerLeave={handlePointerUp}
                                    onClick={() =>
                                        handleIngredientClick(ingredient)
                                    }
                                >
                                    <span
                                        className="ingredient-icon"
                                        style={getAvatarTint(ingredient.name)}
                                        aria-hidden="true"
                                    >
                                        {ingredient.name.trim().charAt(0)}
                                    </span>

                                    <span className="ingredient-row-info">
                                        <strong>{ingredient.name}</strong>

                                        <span>
                                            {formatGrams(
                                                ingredient.proteinPer100g,
                                            )}{' '}
                                            protein ·{' '}
                                            {formatGrams(
                                                ingredient.carbohydratePer100g,
                                            )}{' '}
                                            carbs ·{' '}
                                            {formatGrams(ingredient.fatPer100g)}{' '}
                                            fat
                                        </span>

                                        {pantrySummary && (
                                            <span
                                                className={`ingredient-pantry-line ${
                                                    tone
                                                        ? `ingredient-pantry-line-${tone}`
                                                        : ''
                                                }`}
                                            >
                                                {pantrySummary}
                                            </span>
                                        )}
                                    </span>

                                    <span className="list-row-kcal">
                                        {ingredient.caloriesPer100g !==
                                        undefined
                                            ? `${Math.round(ingredient.caloriesPer100g)} kcal`
                                            : '– kcal'}
                                    </span>
                                </button>

                                {onToggleFavorite && (
                                    <button
                                        type="button"
                                        className={`ingredient-favorite${
                                            ingredient.isFavorite
                                                ? ' ingredient-favorite-on'
                                                : ''
                                        }`}
                                        aria-pressed={!!ingredient.isFavorite}
                                        aria-label={`Favourite ${ingredient.name}`}
                                        onClick={() =>
                                            onToggleFavorite(ingredient)
                                        }
                                    >
                                        <svg
                                            viewBox="0 0 24 24"
                                            aria-hidden="true"
                                            focusable="false"
                                        >
                                            <path d="m12 3.5 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" />
                                        </svg>
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="ingredients-empty">
                    <div className="ingredients-empty-icon" aria-hidden="true">
                        {ingredients.length === 0
                            ? '🥕'
                            : expiringOnly && !search.trim()
                              ? '✅'
                              : '🔎'}
                    </div>
                    <p className="ingredients-empty-title">
                        {ingredients.length === 0
                            ? 'No ingredients yet'
                            : expiringOnly && !search.trim()
                              ? 'Nothing expiring soon'
                              : 'No matching ingredients'}
                    </p>
                    <p className="ingredients-empty-hint">
                        {ingredients.length === 0
                            ? 'Add an ingredient to start building your pantry.'
                            : expiringOnly && !search.trim()
                              ? 'Nothing is expiring in the next 7 days.'
                              : 'Try a different search.'}
                    </p>
                </div>
            )}

            {createPortal(
                <button
                    type="button"
                    className="floating-add-button"
                    onClick={handleAdd}
                    aria-label="Add ingredient"
                >
                    <span aria-hidden="true">+</span>
                </button>,
                document.body,
            )}

            {/* Normal tap → edit ingredient */}
            {selectedIngredient && (
                <NutritionDialog
                    ingredientInfo={selectedIngredient}
                    onClose={() => setSelectedIngredient(null)}
                    onSave={async (ingredient) => {
                        if (isUserIngredient(ingredient)) {
                            await handleSave(ingredient);
                        }
                    }}
                    showPantry
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
