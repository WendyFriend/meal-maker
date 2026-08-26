import { useState } from 'react';
import type { MealIngredient } from '../types';

type NutritionTableProps = {
    ingredients: MealIngredient[];
    onChange: (ingredients: MealIngredient[]) => void;
};

function NutritionTable({
    ingredients,
    onChange,
}: NutritionTableProps) {
    const [ingredientNutritionInput, setIngredientNutritionInput] = useState(
        ingredients.map((ingredient) => ({
            name: ingredient.name,
            caloriesPer100g: String(ingredient.caloriesPer100g),
            proteinPer100g: String(ingredient.proteinPer100g),
        })),
    );

    function updateNutritionInput(
        name: string,
        field: 'caloriesPer100g' | 'proteinPer100g',
        value: string,
    ) {
        setIngredientNutritionInput((current) =>
            current.map((ingredient) =>
                ingredient.name === name
                    ? {
                          ...ingredient,
                          [field]: value,
                      }
                    : ingredient,
            ),
        );
    }
    function commitNutrition(
        name: string,
        field: 'caloriesPer100g' | 'proteinPer100g',
    ) {
        const input = ingredientNutritionInput.find(
            (ingredient) => ingredient.name === name,
        );

        const current = ingredients.find(
            (ingredient) => ingredient.name === name,
        );

        if (!input || !current) return;

        const rawValue = input[field];
        const value = Number(rawValue);

        const isValid =
            rawValue.trim() !== '' && Number.isFinite(value) && value >= 0;

        if (!isValid) {
            // Restore the input to the last valid value
            setIngredientNutritionInput((currentInputs) =>
                currentInputs.map((ingredient) =>
                    ingredient.name === name
                        ? {
                              ...ingredient,
                              [field]: String(current[field]),
                          }
                        : ingredient,
                ),
            );
            return;
        }

        // Commit the valid value
        onChange(
            ingredients.map((ingredient) =>
                ingredient.name === name
                    ? {
                          ...ingredient,
                          [field]: value,
                      }
                    : ingredient,
            ),
        );

        // Normalize the displayed value
        setIngredientNutritionInput((currentInputs) =>
            currentInputs.map((ingredient) =>
                ingredient.name === name
                    ? {
                          ...ingredient,
                          [field]: String(value),
                      }
                    : ingredient,
            ),
        );
    }

    return (
        <section className="meal-section">
            <h2>Ingredients</h2>
            <div className="table-scroll">
                <div className="nutrition-table">
                    <div className="nutrition-row nutrition-header">
                        <span>Ingredient</span>
                        <span>kcal/100g</span>
                        <span>Protein/100g</span>
                    </div>

                    {ingredientNutritionInput.map((ingredient) => (
                        <div className="nutrition-row" key={ingredient.name}>
                            <span>{ingredient.name}</span>

                            <span className="nutrition-value">
                                <input
                                    className="nutrition-input"
                                    type="text"
                                    inputMode="decimal"
                                    enterKeyHint="done"
                                    value={ingredient.caloriesPer100g}
                                    onChange={(event) =>
                                        updateNutritionInput(
                                            ingredient.name,
                                            'caloriesPer100g',
                                            event.target.value,
                                        )
                                    }
                                    onBlur={() =>
                                        commitNutrition(
                                            ingredient.name,
                                            'caloriesPer100g',
                                        )
                                    }
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                            event.preventDefault();
                                            commitNutrition(
                                                ingredient.name,
                                                'caloriesPer100g',
                                            );
                                            event.currentTarget.blur();
                                        }
                                    }}
                                />
                                kcal
                            </span>

                            <span className="nutrition-value">
                                <input
                                    className="nutrition-input"
                                    value={ingredient.proteinPer100g}
                                    type="text"
                                    inputMode="decimal"
                                    enterKeyHint="done"
                                    onChange={(event) =>
                                        updateNutritionInput(
                                            ingredient.name,
                                            'proteinPer100g',
                                            event.target.value,
                                        )
                                    }
                                    onBlur={() =>
                                        commitNutrition(
                                            ingredient.name,
                                            'proteinPer100g',
                                        )
                                    }
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                            event.preventDefault();
                                            commitNutrition(
                                                ingredient.name,
                                                'proteinPer100g',
                                            );
                                            event.currentTarget.blur();
                                        }
                                    }}
                                />
                                g
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

export default NutritionTable;
