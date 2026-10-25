import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { Recipe, ShoppingListItem } from '../shared/types/recipe';
import RecipePickerDialog from './RecipePickerDialog';
import { getRecipes } from './services/recipeService';
import {
    addItems,
    aggregateIngredients,
    clearChecked,
    getItems,
    removeItem,
    setChecked,
} from './services/shoppingListService';
import './ShoppingList.css';

export default function ShoppingList() {
    const [items, setItems] = useState<ShoppingListItem[]>([]);
    const [recipes, setRecipes] = useState<Recipe[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [name, setName] = useState('');
    const [quantity, setQuantity] = useState('');
    const [isPickerOpen, setIsPickerOpen] = useState(false);

    useEffect(() => {
        getItems()
            .then(setItems)
            .catch((error) => {
                console.error(error);
                setError('Could not load your shopping list.');
            })
            .finally(() => setIsLoading(false));

        getRecipes()
            .then(setRecipes)
            .catch((error) => console.error(error));
    }, []);

    async function reload() {
        setItems(await getItems());
    }

    // Runs a change, then refreshes the list from the data source.
    async function run(action: () => Promise<unknown>, failure: string) {
        try {
            await action();
            await reload();
            setError(null);
        } catch (error) {
            console.error(error);
            setError(failure);
        }
    }

    async function handleAdd(event: FormEvent) {
        event.preventDefault();

        if (!name.trim()) {
            return;
        }

        await run(
            () => addItems([{ name, quantity }]),
            'Could not add that item.',
        );
        setName('');
        setQuantity('');
        setNotice(null);
    }

    async function handleAddFromRecipe(recipe: Recipe) {
        setIsPickerOpen(false);

        await run(async () => {
            const count = await addItems(aggregateIngredients([recipe]));
            setNotice(`Added ${count} ${count === 1 ? 'item' : 'items'}`);
        }, 'Could not add those ingredients.');
    }

    const toBuy = items.filter((item) => !item.checked);
    const checked = items.filter((item) => item.checked);
    const sorted = [...toBuy, ...checked];

    return (
        <main className="shopping-list">
            <header className="list-page-header">
                <h1>Shopping List</h1>
                <p>
                    {isLoading || error
                        ? 'What you need to buy'
                        : `${toBuy.length} to buy · ${checked.length} checked`}
                </p>
            </header>

            <form className="shopping-add" onSubmit={handleAdd}>
                <input
                    className="shopping-add-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Add an item"
                    aria-label="Item name"
                />
                <input
                    className="shopping-add-quantity"
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                    placeholder="Qty"
                    aria-label="Quantity"
                />
                <button
                    type="submit"
                    className="shopping-add-submit"
                    disabled={!name.trim()}
                >
                    Add
                </button>
            </form>

            <div className="shopping-actions">
                <button
                    type="button"
                    className="shopping-action"
                    disabled={recipes.length === 0}
                    onClick={() => setIsPickerOpen(true)}
                >
                    Add from recipe
                </button>
                <button
                    type="button"
                    className="shopping-action"
                    disabled={checked.length === 0}
                    onClick={() =>
                        run(clearChecked, 'Could not clear checked items.')
                    }
                >
                    Clear checked
                </button>
            </div>

            {notice && (
                <p className="shopping-notice" role="status">
                    {notice}
                </p>
            )}
            {error && (
                <p className="shopping-error" role="alert">
                    {error}
                </p>
            )}

            {isLoading ? (
                <p className="shopping-loading" role="status">
                    Loading your list...
                </p>
            ) : items.length === 0 ? (
                <div className="shopping-empty">
                    <div className="shopping-empty-icon" aria-hidden="true">
                        🛒
                    </div>
                    <p className="shopping-empty-title">Your list is empty</p>
                    <p className="shopping-empty-hint">
                        Add an item above, pull in a recipe&apos;s ingredients,
                        or add your meal plan from the Meal Plan page.
                    </p>
                </div>
            ) : (
                <ul className="shopping-items">
                    {sorted.map((item) => (
                        <li
                            key={item.id}
                            className={
                                item.checked
                                    ? 'shopping-item shopping-item-checked'
                                    : 'shopping-item'
                            }
                        >
                            <label className="shopping-item-label">
                                <input
                                    type="checkbox"
                                    className="shopping-checkbox"
                                    checked={item.checked}
                                    onChange={(event) =>
                                        run(
                                            () =>
                                                setChecked(
                                                    item.id,
                                                    event.target.checked,
                                                ),
                                            'Could not update that item.',
                                        )
                                    }
                                />
                                <span className="shopping-item-name">
                                    {item.name}
                                </span>
                                {item.quantity && (
                                    <span className="shopping-item-quantity">
                                        {item.quantity}
                                    </span>
                                )}
                            </label>
                            <button
                                type="button"
                                className="shopping-item-delete"
                                onClick={() =>
                                    run(
                                        () => removeItem(item.id),
                                        'Could not delete that item.',
                                    )
                                }
                                aria-label={`Delete ${item.name}`}
                            >
                                ×
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {isPickerOpen && (
                <RecipePickerDialog
                    title="Add ingredients from a recipe"
                    recipes={recipes}
                    onPick={handleAddFromRecipe}
                    onClose={() => setIsPickerOpen(false)}
                />
            )}
        </main>
    );
}
