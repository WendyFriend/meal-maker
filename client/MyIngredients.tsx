import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { IngredientInfo, UserIngredient } from '../shared/types/types';
import IngredientThumbnail from './meal-generator/components/IngredientThumbnail';
import AddIngredientSheet from './components/AddIngredientSheet';
import IngredientCamera from './components/IngredientCamera';
import PullRefreshIndicator from './components/PullRefreshIndicator';
import { usePullToRefresh } from './hooks/usePullToRefresh';
import './components/SavedCollection.css';
import { useCollectionSelection } from './hooks/useCollectionSelection';
import {
    SelectionToggle,
    SelectionControls,
    SelectionIndicator,
    BulkDeleteToolbar,
} from './components/CollectionSelection';

type MyIngredientsProps = {
    ingredients: UserIngredient[];
    onDeleteMany: (ids: string[]) => Promise<string[]>;
    onAdd: (ingredient?: IngredientInfo, referencePhoto?: string) => void;
    onSaveFromDatabase: (ingredient: IngredientInfo) => Promise<UserIngredient>;
    onOpen: (ingredient: UserIngredient) => void;
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
    isActive = true,
    refreshing = false,
    refreshError,
    onRefresh,
}: MyIngredientsProps) {
    const [search, setSearch] = useState('');
    const [addMode, setAddMode] = useState<
        'choices' | 'search' | 'camera-food' | 'camera-label' | null
    >(null);
    const filteredIngredients = ingredients.filter(({ name }) =>
        name.toLowerCase().includes(search.trim().toLowerCase()),
    );
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
        onOpen,
        onDeleteMany,
        noun: 'ingredient',
        search,
        isActive,
    });
    const { containerRef, pullDistance } = usePullToRefresh({
        enabled: isActive && Boolean(onRefresh),
        disabled: deleting || selecting,
        refreshing,
        onRefresh: () => onRefresh?.(),
    });

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
                    onChange={(event) => setSearch(event.target.value)}
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
                            <div
                                key={ingredient.ingredientId}
                                className={`saved-collection-row-wrapper${selected ? ' saved-collection-row-wrapper-selected' : ''}`}
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
                                    onContextMenu={(event) =>
                                        event.preventDefault()
                                    }
                                    onKeyDown={(event) => {
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
