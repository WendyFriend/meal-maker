import { useId, useMemo, useState } from 'react';
import type { UserIngredient } from '../../../shared/types/types';
import SlidingSheet from '../../components/SlidingSheet';
import CheckIcon from '../../components/CheckIcon';
import { normalizeIngredientName } from '../../utils/Ingredient';
import grainsPhoto from '../../assets/ingredients/grains-oats.webp';
import proteinPhoto from '../../assets/ingredients/protein-chickpeas.webp';
import veggiesPhoto from '../../assets/ingredients/veggies-spinach.webp';
import IngredientThumbnail from './IngredientThumbnail';
import {
    getIngredientSearchOptions,
    groupQuickAddIngredients,
    type QuickAddCategoryId,
} from './quickAddIngredients';
import './FavouriteIngredientsSheet.css';

type Category = Extract<
    QuickAddCategoryId,
    'saved' | 'vegetables' | 'proteins' | 'grains'
>;

const categories: { id: Category; label: string; image?: string }[] = [
    { id: 'saved', label: 'Favourites' },
    { id: 'vegetables', label: 'Veggies', image: veggiesPhoto },
    { id: 'proteins', label: 'Protein', image: proteinPhoto },
    { id: 'grains', label: 'Grains', image: grainsPhoto },
];

export default function FavouriteIngredientsSheet({
    ingredients,
    savedIngredients,
    onChange,
    onClose,
}: {
    ingredients: string[];
    savedIngredients: UserIngredient[];
    onChange: (ingredients: string[]) => void;
    onClose: () => void;
}) {
    const [category, setCategory] = useState<Category>('saved');
    const [search, setSearch] = useState('');
    const titleId = useId();
    const groups = useMemo(
        () => groupQuickAddIngredients(savedIngredients),
        [savedIngredients],
    );
    const allOptions = useMemo(
        () => getIngredientSearchOptions(savedIngredients),
        [savedIngredients],
    );
    const query = normalizeIngredientName(search);
    const options = query
        ? allOptions.filter(({ name }) =>
              normalizeIngredientName(name).includes(query),
          )
        : groups[category];
    const selected = new Set(ingredients.map(normalizeIngredientName));

    function toggleIngredient(name: string) {
        const key = normalizeIngredientName(name);
        onChange(
            selected.has(key)
                ? ingredients.filter(
                      (ingredient) =>
                          normalizeIngredientName(ingredient) !== key,
                  )
                : [...ingredients, name],
        );
    }

    return (
        <SlidingSheet
            className="favourite-ingredient-sheet"
            labelledBy={titleId}
            onClose={onClose}
            header={
                <div className="favourite-ingredient-heading">
                    <button
                        type="button"
                        className="favourite-ingredient-close"
                        aria-label="Close ingredient picker"
                        onClick={onClose}
                    >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="m5 5 14 14M19 5 5 19" />
                        </svg>
                    </button>
                    <h2 id={titleId}>Add ingredient</h2>
                    <span aria-hidden="true" />
                </div>
            }
        >
            <div className="favourite-ingredient-search">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="10.8" cy="10.8" r="6.8" />
                    <path d="m16 16 5 5" />
                </svg>
                <input
                    type="search"
                    aria-label="Search ingredients"
                    placeholder="Search ingredients..."
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                />
            </div>

            <div
                className="favourite-ingredient-categories"
                role="group"
                aria-label="Ingredient categories"
            >
                {categories.map(({ id, label, image }) => (
                    <button
                        type="button"
                        key={id}
                        className="favourite-ingredient-category"
                        aria-pressed={category === id && !query}
                        onClick={() => {
                            setSearch('');
                            setCategory(id);
                        }}
                    >
                        <span className="favourite-ingredient-category-icon">
                            {image ? (
                                <img src={image} alt="" />
                            ) : (
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                    <path d="M12 2.4c.5 0 .91.29 1.13.74l2.4 4.88 5.39.78c1.03.15 1.44 1.41.69 2.14l-3.9 3.8.92 5.36c.18 1.02-.9 1.8-1.82 1.32L12 18.89l-4.81 2.53c-.92.48-2-.3-1.82-1.32l.92-5.36-3.9-3.8c-.75-.73-.34-1.99.69-2.14l5.39-.78 2.4-4.88c.22-.45.63-.74 1.13-.74Z" />
                                </svg>
                            )}
                        </span>
                        <span>{label}</span>
                    </button>
                ))}
            </div>

            <div className="favourite-ingredient-results">
                <h3>
                    {query
                        ? 'Search results'
                        : category === 'saved'
                          ? 'My ingredients'
                          : 'Suggested'}
                </h3>
                {options.length > 0 ? (
                    <div className="favourite-ingredient-grid">
                        {options.map((option) => {
                            const added = selected.has(
                                normalizeIngredientName(option.name),
                            );
                            return (
                                <button
                                    type="button"
                                    key={option.id}
                                    className="favourite-ingredient-option"
                                    aria-pressed={added}
                                    onClick={() =>
                                        toggleIngredient(option.name)
                                    }
                                >
                                    <span className="favourite-ingredient-image">
                                        <IngredientThumbnail
                                            name={option.name}
                                            fdcId={option.fdcId}
                                        />
                                        <span
                                            className="favourite-ingredient-option-state"
                                            aria-hidden="true"
                                        >
                                            {added ? <CheckIcon /> : '+'}
                                        </span>
                                    </span>
                                    <span className="favourite-ingredient-option-name">
                                        {option.name}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <p className="favourite-ingredient-empty">
                        {query
                            ? 'No ingredients match your search.'
                            : 'Your saved ingredients will appear here.'}
                    </p>
                )}
            </div>
        </SlidingSheet>
    );
}
