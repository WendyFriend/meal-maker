import { useState } from 'react';
import './IngredientInput.css';

type IngredientInputProps = {
    ingredients: string[]; // ingredients entered by users
    onChange: (ingredients: string[]) => void;
    removeIngredient: (ingredient: string) => void;
    onIngredientClick: (index: number) => void;
};

function IngredientInput({
    ingredients,
    onChange,
    removeIngredient,
    onIngredientClick,
}: IngredientInputProps) {
    const [input, setInput] = useState('');

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
        if (ingredients.some((current) => current === ingredient)) {
            setInput('');
            return;
        }

        onChange([...ingredients, ingredient]);
        setInput(''); // clear the input field
    }

    return (
        <div className="ingredient-input">
            <h2>Ingredients</h2>
            <div className="ingredient-chips">
                {ingredients.map((ingredient, index) => (
                    <span className="ingredient-chip" key={ingredient}>
                        <button
                            type="button"
                            className="ingredient-chip-label"
                            onClick={() => onIngredientClick(index)}
                            aria-label={`Edit nutrition for ${ingredient}`}
                        >
                            {ingredient}
                        </button>
                        <button
                            type="button"
                            onClick={() => removeIngredient(ingredient)}
                            aria-label={`Remove ${ingredient}`}
                        >
                            ×
                        </button>
                    </span>
                ))}
            </div>

            <div className="ingredient-input-field">
                <input
                    type="text"
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={handleKeyDown}
                    enterKeyHint="done"
                    placeholder="Add an ingredient..."
                />
            </div>
        </div>
    );
}

export default IngredientInput;
