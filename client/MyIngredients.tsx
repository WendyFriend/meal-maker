import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { UserIngredient } from '../shared/types/types';
import IngredientThumbnail from './meal-generator/components/IngredientThumbnail';
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
    onAdd: () => void;
    onOpen: (ingredient: UserIngredient) => void;
    isActive?: boolean;
};

export default function MyIngredients({
    ingredients,
    onDeleteMany,
    onAdd,
    onOpen,
    isActive = true,
}: MyIngredientsProps) {
    const [search, setSearch] = useState('');
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

    return (
        <section
            className={`my-ingredients saved-collection${selecting ? ' saved-collection-selecting' : ''}`}
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
            <header className="saved-collection-intro">
                <div className="saved-collection-title">
                    <h1 id="my-ingredients-heading">My Ingredients</h1>
                    <span>{ingredients.length} saved</span>
                    {ingredients.length > 0 && (
                        <SelectionToggle
                            selecting={selecting}
                            disabled={deleting}
                            noun="ingredient"
                            onClick={toggleSelection}
                        />
                    )}
                </div>
                <p>Your ingredients, ready for your next meal.</p>
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
            {selecting && (
                <SelectionControls
                    count={selectedItems.length}
                    allVisibleSelected={allVisibleSelected}
                    label={selectAllLabel}
                    disabled={deleting || selectableCount === 0}
                    onToggle={toggleVisible}
                />
            )}
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
                                    {selecting && (
                                        <SelectionIndicator
                                            selected={selected}
                                        />
                                    )}
                                    <IngredientThumbnail
                                        name={ingredient.name}
                                    />
                                    <span className="saved-collection-row-info">
                                        <strong>{ingredient.name}</strong>
                                        <span>
                                            {ingredient.caloriesPer100g} kcal ·{' '}
                                            {ingredient.proteinPer100g}g protein
                                            / 100g
                                        </span>
                                    </span>
                                    {!selecting && (
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
                            <IngredientThumbnail name="Carrot" />
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
                            onClick={onAdd}
                            aria-label="Add ingredient"
                        >
                            <span aria-hidden="true">+</span>
                        </button>
                    ),
                    document.body,
                )}
        </section>
    );
}
