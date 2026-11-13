import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { IngredientInfo, UserIngredient } from '../shared/types/types';
import IngredientThumbnail from './meal-generator/components/IngredientThumbnail';
import AddIngredientSheet from './components/AddIngredientSheet';
import IngredientCamera from './components/IngredientCamera';
import PullRefreshIndicator from './components/PullRefreshIndicator';
import { usePullToRefresh } from './hooks/usePullToRefresh';
import useSavedIngredientFoodIds from './hooks/useSavedIngredientFoodIds';
import { normalizeIngredientName } from './utils/Ingredient';
import './components/SavedCollection.css';
import { useCollectionSelection } from './hooks/useCollectionSelection';
import {
    SelectionToggle,
    SelectionControls,
    SelectionIndicator,
    BulkDeleteToolbar,
} from './components/CollectionSelection';
import SwipeableCollectionRow from './components/SwipeableCollectionRow';
import CollectionContextMenu from './components/CollectionContextMenu';
import { contextMenuPosition } from './components/contextMenuPosition';

type IngredientMenu = {
    ingredient: UserIngredient;
    trigger: HTMLButtonElement;
    x: number;
    y: number;
};

type MyIngredientsProps = {
    ingredients: UserIngredient[];
    onDeleteMany: (ids: string[]) => Promise<string[]>;
    onAdd: (ingredient?: IngredientInfo, referencePhoto?: string) => void;
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
    const lastPointerType = useRef<string | null>(null);
    const [swipeError, setSwipeError] = useState<string>();
    const [addMode, setAddMode] = useState<
        'choices' | 'search' | 'camera-food' | 'camera-label' | null
    >(null);
    const filteredIngredients = ingredients.filter(({ name }) =>
        name.toLowerCase().includes(search.trim().toLowerCase()),
    );
    const legacyFoodIds = useSavedIngredientFoodIds(ingredients, isActive);
    const {
        selecting,
        deleting,
        error,
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
        items: ingredients,
        visibleItems: filteredIngredients,
        getId: (ingredient) => ingredient.ingredientId,
        onOpen: (ingredient) => {
            setOpenSwipeId(null);
            setIngredientMenu(null);
            onOpen(ingredient);
        },
        onDeleteMany,
        noun: 'ingredient',
        search,
        isActive,
        onSelectionStart: () => {
            setOpenSwipeId(null);
            setIngredientMenu(null);
        },
    });
    const { containerRef, pullDistance } = usePullToRefresh({
        enabled: isActive && Boolean(onRefresh),
        disabled: deleting || selecting,
        refreshing,
        onRefresh: () => onRefresh?.(),
    });

    async function deleteIngredient(ingredient: UserIngredient) {
        setIngredientMenu(null);
        setSwipeError(undefined);
        try {
            const deleted = await onDeleteMany([ingredient.ingredientId]);
            if (!deleted.includes(ingredient.ingredientId))
                throw new Error('Ingredient was not removed.');
            setOpenSwipeId(null);
            return true;
        } catch {
            setSwipeError(
                `Could not delete ${ingredient.name}. Please try again.`,
            );
            return false;
        }
    }

    function openMenu(
        ingredient: UserIngredient,
        trigger: HTMLButtonElement,
        x: number,
        y: number,
    ) {
        if (selecting || deleting || !isActive) return;
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
            className={`my-ingredients saved-collection${isActive && onRefresh ? ' pull-refresh-active' : ''}${selecting ? ' saved-collection-selecting' : ''}`}
            aria-labelledby="my-ingredients-heading"
            hidden={!isActive}
            inert={!isActive}
            aria-busy={deleting}
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
                    <h1 id="my-ingredients-heading">My Ingredients</h1>
                    {ingredients.length > 0 && (
                        <SelectionToggle
                            selecting={selecting}
                            disabled={deleting}
                            noun="ingredient"
                            onClick={toggleSelection}
                        />
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
                    disabled={deleting}
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
            <SelectionControls
                visible={selecting}
                count={selectedItems.length}
                allVisibleSelected={allVisibleSelected}
                label={selectAllLabel}
                disabled={deleting || selectableCount === 0}
                onToggle={toggleVisible}
            />
            {filteredIngredients.length > 0 ? (
                <div className="saved-collection-list">
                    {filteredIngredients.map((ingredient) => {
                        const selected = isSelected(ingredient);
                        return (
                            <SwipeableCollectionRow
                                key={ingredient.ingredientId}
                                name={ingredient.name}
                                enabled={!selecting && !deleting}
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
                                <div
                                    className={`saved-collection-row-wrapper${selected ? ' saved-collection-row-wrapper-selected' : ''}`}
                                    onPointerDownCapture={(event) => {
                                        lastPointerType.current =
                                            event.pointerType;
                                    }}
                                    onContextMenu={(event) => {
                                        event.preventDefault();
                                        if (lastPointerType.current === 'touch')
                                            return;
                                        const trigger =
                                            event.currentTarget.querySelector<HTMLButtonElement>(
                                                '.saved-collection-row',
                                            );
                                        if (trigger)
                                            openMenu(
                                                ingredient,
                                                trigger,
                                                event.clientX,
                                                event.clientY,
                                            );
                                    }}
                                >
                                    <button
                                        type="button"
                                        className="saved-collection-row"
                                        id={`saved-ingredient-${ingredient.ingredientId}`}
                                        aria-pressed={
                                            selecting ? selected : undefined
                                        }
                                        aria-label={
                                            selecting
                                                ? `${selected ? 'Deselect' : 'Select'} ${ingredient.name}`
                                                : undefined
                                        }
                                        disabled={deleting}
                                        onPointerDown={(event) =>
                                            startPress(event, ingredient)
                                        }
                                        onPointerMove={movePress}
                                        onPointerUp={endPress}
                                        onPointerCancel={endPress}
                                        onPointerLeave={endPress}
                                        onKeyDown={(event) => {
                                            if (
                                                event.key === 'ContextMenu' ||
                                                (event.shiftKey &&
                                                    event.key === 'F10')
                                            ) {
                                                event.preventDefault();
                                                const rect =
                                                    event.currentTarget.getBoundingClientRect();
                                                openMenu(
                                                    ingredient,
                                                    event.currentTarget,
                                                    rect.left + 20,
                                                    rect.bottom - 8,
                                                );
                                                return;
                                            }
                                            if (
                                                event.key === 'Enter' ||
                                                event.key === ' '
                                            )
                                                resetClickSuppression();
                                        }}
                                        onClick={() => clickItem(ingredient)}
                                    >
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
                                        <span className="saved-collection-row-info">
                                            <strong>{ingredient.name}</strong>
                                        </span>
                                        {selecting ? (
                                            <SelectionIndicator
                                                selected={selected}
                                            />
                                        ) : (
                                            <svg
                                                className="saved-collection-row-chevron"
                                                viewBox="0 0 24 24"
                                                aria-hidden="true"
                                            >
                                                <path d="m9 6 6 6-6 6" />
                                            </svg>
                                        )}
                                    </button>
                                </div>
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
                        {ingredients.length === 0 ? (
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
                        {ingredients.length === 0
                            ? 'No ingredients yet'
                            : 'No matching ingredients'}
                    </p>
                    <p className="saved-collection-empty-hint">
                        {ingredients.length === 0
                            ? 'Add an ingredient to start building your pantry.'
                            : 'Try a different search.'}
                    </p>
                </div>
            )}
            {isActive &&
                createPortal(
                    selecting ? (
                        <BulkDeleteToolbar
                            count={selectedItems.length}
                            noun="ingredient"
                            deleting={deleting}
                            error={error}
                            onDelete={deleteSelected}
                        />
                    ) : (
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
                    onDelete={() =>
                        void deleteIngredient(ingredientMenu.ingredient)
                    }
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
            {isActive &&
                (addMode === 'camera-food' || addMode === 'camera-label') && (
                    <IngredientCamera
                        mode={addMode === 'camera-label' ? 'label' : 'food'}
                        onClose={() => setAddMode(null)}
                        onContinue={(photo) => {
                            setAddMode(null);
                            onAdd(undefined, photo);
                        }}
                    />
                )}
        </section>
    );
}
