import { useState } from 'react';
import { mockIngredientNutrition, mockMeal } from '../mockData';
import './MealResult.css';

function MealResult() {
    const [nutrition, setNutrition] = useState(mockIngredientNutrition);

    const [nutritionInputs, setNutritionInputs] = useState(
        mockIngredientNutrition.map((ingredient) => ({
            name: ingredient.name,
            caloriesPer100g: String(ingredient.caloriesPer100g),
            proteinPer100g: String(ingredient.proteinPer100g),
        })),
    );

    const [meal, setMeal] = useState(mockMeal);

    const [mealInputs, setMealInputs] = useState(
        mockMeal.map((ingredient) => ({
            name: ingredient.name,
            amount: String(ingredient.amount),
        })),
    );

    const [isTotalUpdated, setIsTotalUpdated] = useState(false);

    function showTotalUpdated() {
        setIsTotalUpdated(true);

        setTimeout(() => {
            setIsTotalUpdated(false);
        }, 2500);
    }

    function formatNumber(value: number): string {
        return Number.isInteger(value) ? String(value) : value.toFixed(1);
    }

    function updateNutritionInput(
        name: string,
        field: 'caloriesPer100g' | 'proteinPer100g',
        value: string,
    ) {
        setNutritionInputs((current) =>
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
        const input = nutritionInputs.find(
            (ingredient) => ingredient.name === name,
        );

        const current = nutrition.find(
            (ingredient) => ingredient.name === name,
        );

        if (!input || !current) return;

        const rawValue = input[field];
        const value = Number(rawValue);

        const isValid =
            rawValue.trim() !== '' && Number.isFinite(value) && value >= 0;

        if (!isValid) {
            // Restore the input to the last valid value
            setNutritionInputs((currentInputs) =>
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
        setNutrition((currentNutrition) =>
            currentNutrition.map((ingredient) =>
                ingredient.name === name
                    ? {
                          ...ingredient,
                          [field]: value,
                      }
                    : ingredient,
            ),
        );

        // Normalize the displayed value
        setNutritionInputs((currentInputs) =>
            currentInputs.map((ingredient) =>
                ingredient.name === name
                    ? {
                          ...ingredient,
                          [field]: String(value),
                      }
                    : ingredient,
            ),
        );

        showTotalUpdated();
    }

    const mealWithNutrition = meal.map((mealIngredient) => {
        const ingredientNutrition = nutrition.find(
            (ingredient) => ingredient.name === mealIngredient.name,
        );

        if (!ingredientNutrition) {
            return {
                ...mealIngredient,
                calories: 0,
                protein: 0,
            };
        }

        const calories =
            (mealIngredient.amount / 100) * ingredientNutrition.caloriesPer100g;

        const protein =
            (mealIngredient.amount / 100) * ingredientNutrition.proteinPer100g;

        return {
            ...mealIngredient,
            calories,
            protein,
        };
    });

    const totalCalories = mealWithNutrition.reduce(
        (total, ingredient) => total + ingredient.calories,
        0,
    );

    const totalProtein = mealWithNutrition.reduce(
        (total, ingredient) => total + ingredient.protein,
        0,
    );

    const proteinPercentage =
        totalCalories > 0 ? (totalProtein * 4 * 100) / totalCalories : 0;

    function updateMealInput(name: string, value: string) {
        setMealInputs((current) =>
            current.map((ingredient) =>
                ingredient.name === name
                    ? {
                          ...ingredient,
                          amount: value,
                      }
                    : ingredient,
            ),
        );
    }

    function commitMealAmount(name: string) {
        const input = mealInputs.find((ingredient) => ingredient.name === name);

        const current = meal.find((ingredient) => ingredient.name === name);

        if (!input || !current) return;

        const value = Number(input.amount);

        const isValid =
            input.amount.trim() !== '' && Number.isFinite(value) && value >= 0;

        if (!isValid) {
            setMealInputs((currentInputs) =>
                currentInputs.map((ingredient) =>
                    ingredient.name === name
                        ? {
                              ...ingredient,
                              amount: String(current.amount),
                          }
                        : ingredient,
                ),
            );

            return;
        }

        setMeal((currentMeal) =>
            currentMeal.map((ingredient) =>
                ingredient.name === name
                    ? {
                          ...ingredient,
                          amount: value,
                      }
                    : ingredient,
            ),
        );

        setMealInputs((currentInputs) =>
            currentInputs.map((ingredient) =>
                ingredient.name === name
                    ? {
                          ...ingredient,
                          amount: String(value),
                      }
                    : ingredient,
            ),
        );

        showTotalUpdated();
    }

    return (
        <div className="meal-result">
            <h1>Your Meal</h1>
            <section className="meal-section">
                <h2>Ingredients</h2>
                <div className="table-scroll">
                    <div className="nutrition-table">
                        <div className="nutrition-row nutrition-header">
                            <span>Ingredient</span>
                            <span>kcal/100g</span>
                            <span>Protein/100g</span>
                        </div>

                        {nutritionInputs.map((ingredient) => (
                            <div
                                className="nutrition-row"
                                key={ingredient.name}
                            >
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

            <section className="meal-section">
                <h2>Meal</h2>

                <div className="table-scroll">
                    <div className="meal-table">
                        <div className="meal-row meal-header">
                            <span>Food</span>
                            <span>Amount</span>
                            <span>Calories</span>
                            <span>Protein</span>
                        </div>

                        {mealWithNutrition.map((ingredient) => (
                            <div className="meal-row" key={ingredient.name}>
                                <span>{ingredient.name}</span>
                                <span className="meal-amount">
                                    <input
                                        className="meal-amount-input"
                                        type="text"
                                        inputMode="decimal"
                                        enterKeyHint="done"
                                        value={
                                            mealInputs.find(
                                                (input) =>
                                                    input.name ===
                                                    ingredient.name,
                                            )?.amount ?? ''
                                        }
                                        onChange={(event) =>
                                            updateMealInput(
                                                ingredient.name,
                                                event.target.value,
                                            )
                                        }
                                        onBlur={() =>
                                            commitMealAmount(ingredient.name)
                                        }
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter') {
                                                event.preventDefault();
                                                event.currentTarget.blur();
                                            }
                                        }}
                                    />
                                    g
                                </span>
                                <span>
                                    {formatNumber(ingredient.calories)} kcal
                                </span>
                                <span>
                                    {formatNumber(ingredient.protein)} g
                                </span>
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
                            <span>
                                {proteinPercentage.toFixed(0)}% of calories
                            </span>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}

export default MealResult;
