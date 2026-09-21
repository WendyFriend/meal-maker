import { useState } from 'react';
import type { MealIngredient } from '../../../shared/types/types';

type NutritionTableProps = {
    ingredients: MealIngredient[];
    onChange: (ingredients: MealIngredient[]) => void;
};

function NutritionTable({ ingredients, onChange }: NutritionTableProps) {
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

        if (value === current[field]) {
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

            return;
        }

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
            <h3>Ingredients</h3>

            <div className="table-scroll">
                <div className="nutrition-table">
                    {/* Header */}

                    <div className="nutrition-row nutrition-header">
                        <div className="nutrition-cell nutrition-ingredient-cell">
                            Ingredient
                        </div>

                        <div className="nutrition-cell">kcal/100g</div>

                        <div className="nutrition-cell">Protein/100g</div>
                    </div>

                    {/* Ingredients */}

                    {ingredientNutritionInput.map((ingredient) => (
                        <div className="nutrition-row" key={ingredient.name}>
                            <div className="nutrition-cell nutrition-ingredient-cell">
                                {ingredient.name}
                            </div>

                            <div className="nutrition-cell">
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
                            </div>

                            <div className="nutrition-cell">
                                <span className="nutrition-value">
                                    <input
                                        className="nutrition-input"
                                        type="text"
                                        inputMode="decimal"
                                        enterKeyHint="done"
                                        value={ingredient.proteinPer100g}
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
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

export default NutritionTable;
