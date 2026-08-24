import { useState } from 'react';
import type { IngredientNutrition, Meal } from '../types';

type MealTableProps = {
    meal: Meal;
    nutrition: IngredientNutrition[];
    onMealChange: (meal: Meal) => void;
    isTotalUpdated: boolean;
};

function MealTable({
    meal,
    nutrition,
    onMealChange,
    isTotalUpdated,
}: MealTableProps) {
    const [mealInputs, setMealInputs] = useState(
        meal.map((ingredient) => ({
            name: ingredient.name,
            amount: String(ingredient.amount),
        })),
    );

    function formatNumber(value: number): string {
        return Number.isInteger(value) ? String(value) : value.toFixed(1);
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

        onMealChange(
            meal.map((ingredient) =>
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
    }

    return (
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
                                                input.name === ingredient.name,
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
                                            commitMealAmount(ingredient.name);
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
