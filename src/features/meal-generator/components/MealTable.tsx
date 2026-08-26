import { useState } from 'react';
import type { MealIngredient } from '../types';

type MealTableProps = {
    ingredients: MealIngredient[];
    onChange: (ingredients: MealIngredient[]) => void;
    isTotalUpdated: boolean;
};

function MealTable({
    ingredients,
    onChange,
    isTotalUpdated,
}: MealTableProps) {
    const [ingredientAmountInput, setIngredientAmountInput] = useState(
        ingredients.map((ingredient) => ({
            name: ingredient.name,
            amount: String(ingredient.amount),
        })),
    );

    function formatNumber(value: number): string {
        return Number.isInteger(value) ? String(value) : value.toFixed(1);
    }

    const calculatedIngredients = ingredients.map((ingredient) => {

        const calories =
            (ingredient.amount / 100) * ingredient.caloriesPer100g;

        const protein =
            (ingredient.amount / 100) * ingredient.proteinPer100g;

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

    function updateIngredientAmount(name: string, value: string) {
        setIngredientAmountInput((current) =>
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

    function commitIngredientAmount(name: string) {
        const input = ingredientAmountInput.find((ingredient) => ingredient.name === name);

        const current = ingredients.find((ingredient) => ingredient.name === name);

        if (!input || !current) return;

        const value = Number(input.amount);

        const isValid =
            input.amount.trim() !== '' && Number.isFinite(value) && value >= 0;

        if (!isValid) {
            setIngredientAmountInput((currentInputs) =>
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

        onChange(
            ingredients.map((ingredient) =>
                ingredient.name === name
                    ? {
                          ...ingredient,
                          amount: value,
                      }
                    : ingredient,
            ),
        );

        setIngredientAmountInput((currentInputs) =>
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

                    {calculatedIngredients.map((ingredient) => (
                        <div className="meal-row" key={ingredient.name}>
                            <span>{ingredient.name}</span>
                            <span className="meal-amount">
                                <input
                                    className="meal-amount-input"
                                    type="text"
                                    inputMode="decimal"
                                    enterKeyHint="done"
                                    value={
                                        ingredientAmountInput.find(
                                            (input) =>
                                                input.name === ingredient.name,
                                        )?.amount ?? ''
                                    }
                                    onChange={(event) =>
                                        updateIngredientAmount(
                                            ingredient.name,
                                            event.target.value,
                                        )
                                    }
                                    onBlur={() =>
                                        commitIngredientAmount(ingredient.name)
                                    }
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                            event.preventDefault();
                                            commitIngredientAmount(ingredient.name);
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
