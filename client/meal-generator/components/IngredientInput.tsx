import { useState } from 'react';
import './IngredientInput.css';
import type { IngredientInfo as Ingredient } from '../../../shared/types/types';
import NutritionDialog from './NutritionDialog';

type IngredientInputProps = {
    ingredients: Ingredient[];
    onChange: (ingredients: Ingredient[]) => void;
};

const savedIngredientsKey = 'meal-maker-saved-ingredients';

function getSavedIngredients(): Ingredient[] {
    try {
        const saved = localStorage.getItem(savedIngredientsKey);
        return saved ? (JSON.parse(saved) as Ingredient[]) : [];
    } catch {
        return [];
    }
}

function IngredientInput({ ingredients, onChange }: IngredientInputProps) {
    const [input, setInput] = useState('');
    const [selectedIngredient, setSelectedIngredient] = useState<Ingredient>();

    function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
        if (event.key !== 'Enter') {
            return;
        }

        event.preventDefault(); // prevent form submission

        const ingredient = input.trim();

        // if the input is empty, do not add it to the list
        if (!ingredient) {
            return;
        }

        // if the ingredient is already in the list, do not add it again
        if (ingredients.some((current) => current.name === ingredient)) {
            setInput('');
            return;
        }

        const savedIngredient = getSavedIngredients().find(
            (saved) =>
                saved.name.toLocaleLowerCase() ===
                ingredient.toLocaleLowerCase(),
        );
        onChange([...ingredients, savedIngredient ?? { name: ingredient }]);
        setInput(''); // clear the input field
    }

    function removeIngredient(ingredientToRemove: string) {
        onChange(
            ingredients.filter(
                (ingredient) => ingredient.name !== ingredientToRemove,
            ),
        );
    }

    function openNutritionDialog(ingredient: Ingredient) {
        setSelectedIngredient(ingredient);
    }

    function handleIngredientNameChange(updatedIngredient: Ingredient) {
        if (!selectedIngredient) return;

        setSelectedIngredient(updatedIngredient);
        onChange(
            ingredients.map((ingredient) =>
                ingredient.name === selectedIngredient.name
                    ? updatedIngredient
                    : ingredient,
            ),
        );
    }

    function handleNutritionDone(
        updatedIngredient: Ingredient,
        saveToIngredients: boolean,
    ) {
        if (!selectedIngredient) return;

        onChange(
            ingredients.map((ingredient) =>
                ingredient.name === selectedIngredient.name
                    ? updatedIngredient
                    : ingredient,
            ),
        );

        if (saveToIngredients) {
            const savedIngredients = getSavedIngredients().filter(
                (ingredient) =>
                    ingredient.name.toLocaleLowerCase() !==
                    selectedIngredient.name.toLocaleLowerCase(),
            );

            localStorage.setItem(
                savedIngredientsKey,
                JSON.stringify([...savedIngredients, updatedIngredient]),
            );
        }

        setSelectedIngredient(undefined);
    }

    return (
        <div className="ingredient-input">
            <h2>Ingredients</h2>
            <div className="ingredient-chips">
                {ingredients.map((ingredient) => (
                    <span className="ingredient-chip" key={ingredient.name}>
                        <button
                            type="button"
                            className="ingredient-chip-label"
                            onClick={() => openNutritionDialog(ingredient)}
                            aria-label={`Edit nutrition for ${ingredient.name}`}
                        >
                            {ingredient.name}
                        </button>
                        <button
                            type="button"
                            onClick={() => removeIngredient(ingredient.name)}
                            aria-label={`Remove ${ingredient.name}`}
                        >
                            ×
                        </button>
                    </span>
                ))}
            </div>

            <input
                type="text"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                enterKeyHint="done"
                placeholder="Add an ingredient..."
            />

            {selectedIngredient && (
                <NutritionDialog
                    ingredient={selectedIngredient}
                    isSaved={getSavedIngredients().some(
                        (saved) =>
                            saved.name.toLocaleLowerCase() ===
                            selectedIngredient.name.toLocaleLowerCase(),
                    )}
                    onClose={() => setSelectedIngredient(undefined)}
                    onIngredientNameChange={handleIngredientNameChange}
                    onDone={handleNutritionDone}
                />
            )}
        </div>
    );
}

export default IngredientInput;
