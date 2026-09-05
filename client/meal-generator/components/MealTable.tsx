import { useState } from 'react';
import type { MealIngredient } from '../../../shared/types/types';
// import type { MealIngredient } from '../types';

type MealTableProps = {
    ingredients: MealIngredient[];
    onChange: (ingredients: MealIngredient[]) => void;
    isTotalUpdated: boolean;
};

function MealTable({ ingredients, onChange, isTotalUpdated }: MealTableProps) {
    const [ingredientWeightInput, setIngredientWeightInput] = useState(
        ingredients.map((ingredient) => ({
            name: ingredient.name,
            weight: String(ingredient.weight),
        })),
    );

    function formatNumber(value: number): string {
        return Number.isInteger(value) ? String(value) : value.toFixed(1);
    }

    const calculatedIngredients = ingredients.map((ingredient) => {
        const calories = (ingredient.weight / 100) * ingredient.caloriesPer100g;

        const protein = (ingredient.weight / 100) * ingredient.proteinPer100g;

        return {
            ...ingredient,
            calories,
            protein,
        };
    });

    const totalCalories = calculatedIngredients.reduce(
        (total, ingredient) => total + ingredient.calories,
        0,
    );

    const totalProtein = calculatedIngredients.reduce(
        (total, ingredient) => total + ingredient.protein,
        0,
    );

    const proteinPercentage =
        totalCalories > 0 ? (totalProtein * 4 * 100) / totalCalories : 0;

    function updateIngredientWeight(name: string, value: string) {
        setIngredientWeightInput((current) =>
            current.map((ingredient) =>
                ingredient.name === name
                    ? {
                          ...ingredient,
                          weight: value,
                      }
                    : ingredient,
            ),
        );
    }

    function commitIngredientWeight(name: string) {
        const input = ingredientWeightInput.find(
            (ingredient) => ingredient.name === name,
        );

        const current = ingredients.find(
            (ingredient) => ingredient.name === name,
        );

        if (!input || !current) return;

        const value = Number(input.weight);

        const isValid =
            input.weight.trim() !== '' && Number.isFinite(value) && value >= 0;

        if (!isValid) {
            setIngredientWeightInput((currentInputs) =>
                currentInputs.map((ingredient) =>
                    ingredient.name === name
                        ? {
                              ...ingredient,
                              weight: String(current.weight),
                          }
                        : ingredient,
                ),
            );

            return;
        }

        // Nothing changed — don't notify the parent.
        if (value === current.weight) {
            setIngredientWeightInput((currentInputs) =>
                currentInputs.map((ingredient) =>
                    ingredient.name === name
                        ? {
                              ...ingredient,
                              weight: String(value),
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
                          weight: value,
                      }
                    : ingredient,
            ),
        );

        setIngredientWeightInput((currentInputs) =>
            currentInputs.map((ingredient) =>
                ingredient.name === name
                    ? {
                          ...ingredient,
                          weight: String(value),
                      }
                    : ingredient,
            ),
        );
    }

    return (
        <section className="meal-section">
            <h2>Meal</h2>

            <div className="table-scroll">
                <div className="meal-table">
                    <div className="meal-row meal-header">
                        <span>Food</span>
                        <span>Weight</span>
                        <span>Calories</span>
                        <span>Protein</span>
                    </div>

                    {calculatedIngredients.map((ingredient) => (
                        <div className="meal-row" key={ingredient.name}>
                            <span>{ingredient.name}</span>
                            <span className="meal-weight">
                                <input
                                    className="meal-weight-input"
                                    type="text"
                                    inputMode="decimal"
                                    enterKeyHint="done"
                                    value={
                                        ingredientWeightInput.find(
                                            (input) =>
                                                input.name === ingredient.name,
                                        )?.weight ?? ''
                                    }
                                    onChange={(event) =>
                                        updateIngredientWeight(
                                            ingredient.name,
                                            event.target.value,
                                        )
                                    }
                                    onBlur={() =>
                                        commitIngredientWeight(ingredient.name)
                                    }
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                            event.preventDefault();
                                            commitIngredientWeight(
                                                ingredient.name,
                                            );
                                            event.currentTarget.blur();
                                        }
                                    }}
                                />
                                g
                            </span>
                            <span>
                                {formatNumber(ingredient.calories)} kcal
                            </span>
                            <span>{formatNumber(ingredient.protein)} g</span>
                        </div>
                    ))}

                    <div className="meal-row meal-total-row">
                        <span>Total</span>
                        <span></span>

                        <span
                            className={
                                isTotalUpdated ? 'total-value-updated' : ''
                            }
                        >
                            {formatNumber(totalCalories)} kcal
                        </span>

                        <span
                            className={
                                isTotalUpdated ? 'total-value-updated' : ''
                            }
                        >
                            {formatNumber(totalProtein)} g
                        </span>
                    </div>

                    <div className="meal-row protein-percentage">
                        <span></span>
                        <span></span>
                        <span></span>
                        <span>{proteinPercentage.toFixed(0)}% of calories</span>
                    </div>
                </div>
            </div>
        </section>
    );
}

export default MealTable;
