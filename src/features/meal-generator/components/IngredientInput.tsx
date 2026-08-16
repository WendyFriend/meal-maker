import { useState } from 'react';

type IngredientInputProps = {
    ingredients: string[];
    onChange: (ingredients: string[]) => void;
};

function IngredientInput({ ingredients, onChange }: IngredientInputProps) {
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
        if (ingredients.includes(ingredient)) {
            setInput('');
            return;
        }

        onChange([...ingredients, ingredient]);
        setInput(''); // clear the input field
    }

    function removeIngredient(ingredientToRemove: string) {
        onChange(
            ingredients.filter(
                (ingredient) => ingredient !== ingredientToRemove,
            ),
        );
    }

    return (
        <div className="ingredient-input">
            <h2>What ingredients do you have?</h2>
            <div className="ingredient-chips">
                {ingredients.map((ingredient) => (
                    <span className="ingredient-chip" key={ingredient}>
                        {ingredient}
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

            <input
                type="text"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Add an ingredient..."
            />

            {/* <p>Type an ingredient and press Enter</p> */}
        </div>
    );
}

export default IngredientInput;
