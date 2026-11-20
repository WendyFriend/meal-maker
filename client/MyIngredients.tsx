import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { IngredientInfo, UserIngredient } from '../shared/types/types';
import IngredientThumbnail from './meal-generator/components/IngredientThumbnail';
import AddIngredientSheet from './components/AddIngredientSheet';
import IngredientCamera from './components/IngredientCamera';
import { LabelScanCamera } from './components/LabelScan';
import type { IngredientPhoto } from './AddIngredient';
import PullRefreshIndicator from './components/PullRefreshIndicator';
import { usePullToRefresh } from './hooks/usePullToRefresh';
import useSavedIngredientFoodIds from './hooks/useSavedIngredientFoodIds';
import { normalizeIngredientName } from './utils/Ingredient';
import './components/SavedCollection.css';
import { useCollectionSelection } from './hooks/useCollectionSelection';
import {
    CollectionTitle,
    SelectionActions,
    SelectionToggle,
} from './components/CollectionSelection';
import SwipeableCollectionRow from './components/SwipeableCollectionRow';
import SavedCollectionRow from './components/SavedCollectionRow';
import CollectionContextMenu from './components/CollectionContextMenu';
import { contextMenuPosition } from './components/contextMenuPosition';
import { useUndoableDelete } from './hooks/useUndoableDelete';

type IngredientMenu = {
    ingredient: UserIngredient;
    trigger: HTMLButtonElement;
    x: number;
    y: number;
};

type MyIngredientsProps = {
    ingredients: UserIngredient[];
    onDeleteMany: (ids: string[]) => Promise<string[]>;
    onAdd: (ingredient?: IngredientInfo, photo?: IngredientPhoto) => void;
    onSaveFromDatabase: (ingredient: IngredientInfo) => Promise<UserIngredient>;
    onOpen: (ingredient: UserIngredient) => void;
    onEdit?: (ingredient: UserIngredient) => void;
    isActive?: boolean;
    refreshing?: boolean;
    refreshError?: string;
    onRefresh?: () => void;
};

export default function MyIngredients({
    ingredients,
    onDeleteMany,
    onAdd,
    onSaveFromDatabase,
    onOpen,
    onEdit,
    isActive = true,
    refreshing = false,
    refreshError,
    onRefresh,
}: MyIngredientsProps) {
    const [search, setSearch] = useState('');
    const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
    const [ingredientMenu, setIngredientMenu] = useState<IngredientMenu | null>(
        null,
    );
    const [swipeError, setSwipeError] = useState<string>();
    const [addMode, setAddMode] = useState<
        'choices' | 'search' | 'camera-food' | 'camera-label' | null
    >(null);
    const { rowRef, exitClass, exitStyle, hiddenIds, remove, undoToast } =
        useUndoableDelete<HTMLDivElement>({
            isActive,
            onHidden: () => setOpenSwipeId(null),
            commit: async (ids) => {
                const names = ingredients
                    .filter(({ ingredientId }) => ids.includes(ingredientId))
                    .map(({ name }) => name);
                try {
                    const deleted = new Set(await onDeleteMany(ids));
                    if (ids.some((id) => !deleted.has(id)))
                        throw new Error('Ingredient was not removed.');
                } catch {
                    setSwipeError(
                        `Could not delete ${names.join(', ') || 'ingredient'}. Please try again.`,
                    );
                }
            },
        });
    const visibleIngredients = ingredients.filter(
        ({ ingredientId }) => !hiddenIds.has(ingredientId),
    );
    const filteredIngredients = visibleIngredients.filter(({ name }) =>
        name.toLowerCase().includes(search.trim().toLowerCase()),
    );
    const legacyFoodIds = useSavedIngredientFoodIds(ingredients, isActive);
    const {
        selecting,
        selectedItems,
        allVisibleSelected,
        selectAllLabel,
        isSelected,
        selectableCount,
        startPress,
        movePress,
        endPress,
        clickItem,
        cancelSelection,
        toggleSelection,
        toggleVisible,
        deleteSelected,
        resetClickSuppression,
    } = useCollectionSelection({
        items: visibleIngredients,
        visibleItems: filteredIngredients,
        getId: (ingredient) => ingredient.ingredientId,
        onOpen: (ingredient) => {
            setOpenSwipeId(null);
            setIngredientMenu(null);
            onOpen(ingredient);
        },
        onDelete: (ids) => {
            setSwipeError(undefined);
            remove(
                ids,
                ids.length === 1
                    ? 'Ingredient removed.'
                    : `${ids.length} ingredients removed.`,
            );
        },
        search,
        isActive,
        onSelectionStart: () => {
            setOpenSwipeId(null);
            setIngredientMenu(null);
        },
    });
    const { containerRef, pullDistance } = usePullToRefresh({
        enabled: isActive && Boolean(onRefresh),
        disabled: selecting,
        refreshing,
        onRefresh: () => onRefresh?.(),
    });

    function deleteIngredient(ingredient: UserIngredient) {
        setIngredientMenu(null);
        setSwipeError(undefined);
        remove([ingredient.ingredientId], 'Ingredient removed.');
    }

    function openMenu(
        ingredient: UserIngredient,
        trigger: HTMLButtonElement,
        x: number,
        y: number,
    ) {
        if (selecting || !isActive) return;
        setOpenSwipeId(null);
        setIngredientMenu({
            ingredient,
            trigger,
            ...contextMenuPosition(x, y),
        });
    }

    return (
        <section
            ref={containerRef}
            className={`my-ingredients saved-collection${isActive && onRefresh ? ' pull-refresh-active' : ''}`}
            aria-labelledby="my-ingredients-heading"
            hidden={!isActive}
            inert={!isActive}
            onKeyDown={(event) => {
                if (event.key === 'Escape' && selecting) {
                    event.preventDefault();
                    cancelSelection();
                }
            }}
        >
            {onRefresh && (
                <PullRefreshIndicator
                    distance={pullDistance}
                    refreshing={refreshing}
                    label="Refreshing ingredients"
                />
            )}
            <header className="saved-collection-intro">
                <div className="saved-collection-title">
                    <CollectionTitle
                        id="my-ingredients-heading"
                        title="My Ingredients"
                        selecting={selecting}
                        count={selectedItems.length}
                    />
                    {selecting ? (
                        <SelectionActions
                            count={selectedItems.length}
                            noun="ingredient"
                            allVisibleSelected={allVisibleSelected}
                            toggleAllLabel={selectAllLabel}
                            selectableCount={selectableCount}
                            onToggleAll={toggleVisible}
                            onDelete={deleteSelected}
                            onCancel={cancelSelection}
                        />
                    ) : (
                        ingredients.length > 0 && (
                            <SelectionToggle
                                selecting={false}
                                noun="ingredient"
                                onClick={toggleSelection}
                            />
                        )
                    )}
                </div>
            </header>
            <div className="saved-collection-search-field">
                <span
                    className="saved-collection-search-icon"
                    aria-hidden="true"
                >
                    <svg viewBox="0 0 24 24" fill="none">
                        <circle cx="10.8" cy="10.8" r="6.8" />
                        <path d="m16 16 4.2 4.2" />
                    </svg>
                </span>
                <input
                    className="saved-collection-search-input"
                    type="search"
                    value={search}
                    onChange={(event) => {
                        setSearch(event.target.value);
                        setOpenSwipeId(null);
                        setIngredientMenu(null);
                    }}
                    placeholder="Search ingredients..."
                    aria-label="Search ingredients"
                />
            </div>
            {refreshError && (
                <div className="saved-collection-refresh-error" role="alert">
                    <span>{refreshError}</span>
                    <button type="button" onClick={onRefresh}>
                        Try again
                    </button>
                </div>
            )}
            {swipeError && (
                <p className="saved-collection-swipe-error" role="alert">
                    {swipeError}
                </p>
            )}
            {filteredIngredients.length > 0 ? (
                <div className="saved-collection-list">
                    {filteredIngredients.map((ingredient) => {
                        const selected = isSelected(ingredient);
                        return (
                            <SwipeableCollectionRow
                                key={ingredient.ingredientId}
                                name={ingredient.name}
                                enabled={!selecting}
                                open={
                                    isActive &&
                                    !selecting &&
                                    openSwipeId === ingredient.ingredientId
                                }
                                onOpen={() =>
                                    setOpenSwipeId(ingredient.ingredientId)
                                }
                                onClose={() => setOpenSwipeId(null)}
                                onDelete={() => deleteIngredient(ingredient)}
                            >
                                <SavedCollectionRow
                                    rowRef={rowRef(ingredient.ingredientId)}
                                    className={exitClass(
                                        ingredient.ingredientId,
                                    )}
                                    style={exitStyle(ingredient.ingredientId)}
                                    id={`saved-ingredient-${ingredient.ingredientId}`}
                                    name={ingredient.name}
                                    media={
                                        <IngredientThumbnail
                                            name={ingredient.name}
                                            size={64}
                                            fdcId={
                                                ingredient.nutritionSource
                                                    ?.fdcId ??
                                                legacyFoodIds[
                                                    normalizeIngredientName(
                                                        ingredient.name,
                                                    )
                                                ]
                                            }
                                        />
                                    }
                                    selecting={selecting}
                                    selected={selected}
                                    onPressStart={(event) =>
                                        startPress(event, ingredient)
                                    }
                                    onPressMove={movePress}
                                    onPressEnd={endPress}
                                    onActivate={() => clickItem(ingredient)}
                                    onKeyActivate={resetClickSuppression}
                                    onMenu={(trigger, x, y) =>
                                        openMenu(ingredient, trigger, x, y)
                                    }
                                />
                            </SwipeableCollectionRow>
                        );
                    })}
                </div>
            ) : (
                <div className="saved-collection-empty">
                    <div
                        className="saved-collection-empty-icon"
                        aria-hidden="true"
                    >
                        {visibleIngredients.length === 0 ? (
                            <svg viewBox="0 0 32 32" fill="none">
                                <path d="M5 17h22c-.8 7-5 11-11 11S5.8 24 5 17Z" />
                                <path d="M16 17V9m0 4c-4 0-6-2-6-6 4 0 6 2 6 6Zm0-2c0-4 2-6 6-6 0 4-2 6-6 6Z" />
                            </svg>
                        ) : (
                            <svg viewBox="0 0 24 24" fill="none">
                                <circle cx="10.8" cy="10.8" r="6.8" />
                                <path d="m16 16 4.2 4.2" />
                            </svg>
                        )}
                    </div>
                    <p className="saved-collection-empty-title">
                        {visibleIngredients.length === 0
                            ? 'No ingredients yet'
                            : 'No matching ingredients'}
                    </p>
                    <p className="saved-collection-empty-hint">
                        {visibleIngredients.length === 0
                            ? 'Add an ingredient to start building your pantry.'
                            : 'Try a different search.'}
                    </p>
                </div>
            )}
            {isActive &&
                createPortal(
                    !selecting && (
                        <button
                            type="button"
                            className="floating-add-button saved-collection-add-button ingredients-add-button"
                            onClick={() => setAddMode('choices')}
                            aria-label="Add ingredient"
                        >
                            <span aria-hidden="true">+</span>
                        </button>
                    ),
                    document.body,
                )}
            {isActive && ingredientMenu && !selecting && (
                <CollectionContextMenu
                    name={ingredientMenu.ingredient.name}
                    x={ingredientMenu.x}
                    y={ingredientMenu.y}
                    trigger={ingredientMenu.trigger}
                    onClose={() => setIngredientMenu(null)}
                    onEdit={() => {
                        if (onEdit) onEdit(ingredientMenu.ingredient);
                        else onOpen(ingredientMenu.ingredient);
                    }}
                    onDelete={() => deleteIngredient(ingredientMenu.ingredient)}
                />
            )}
            {isActive && (addMode === 'choices' || addMode === 'search') && (
                <AddIngredientSheet
                    key={addMode}
                    searching={addMode === 'search'}
                    onSearch={() => setAddMode('search')}
                    savedIngredients={ingredients}
                    onDatabaseAdd={onSaveFromDatabase}
                    onDatabaseRemove={async (ingredientId) => {
                        const deleted = await onDeleteMany([ingredientId]);
                        if (!deleted.includes(ingredientId))
                            throw new Error('Ingredient was not removed.');
                    }}
                    onRefreshSavedIngredients={onRefresh}
                    onClose={() => setAddMode(null)}
                    onManual={() => {
                        setAddMode(null);
                        onAdd();
                    }}
                    onPhoto={() => setAddMode('camera-food')}
                    onScan={() => setAddMode('camera-label')}
                />
            )}
            {isActive && addMode === 'camera-food' && (
                <IngredientCamera
                    mode="food"
                    onClose={() => setAddMode(null)}
                    onContinue={(src) => {
                        setAddMode(null);
                        onAdd(undefined, { src, kind: 'food' });
                    }}
                />
            )}
            {isActive && addMode === 'camera-label' && (
                <LabelScanCamera
                    backLabel="Back to My Ingredients"
                    onClose={() => setAddMode(null)}
                    onPhoto={(src) => {
                        setAddMode(null);
                        onAdd(undefined, { src, kind: 'label' });
                    }}
                />
            )}
            {undoToast}
        </section>
    );
}
