import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import IngredientThumbnail from './IngredientThumbnail';
import './IngredientNutritionSheet.css';
import type { IngredientNutrition } from '../../../shared/types/types';

type IngredientNutritionSheetProps = {
    ingredient: IngredientNutrition & { weight?: number };
    onClose: () => void;
};

const nutrients = [
    { key: 'fatPer100g', label: 'Total fat' },
    { key: 'saturatedFatPer100g', label: 'Saturated fat', inset: true },
    { key: 'carbohydratePer100g', label: 'Carbohydrate' },
    { key: 'sugarPer100g', label: 'Total sugars', inset: true },
    { key: 'fiberPer100g', label: 'Dietary fiber', inset: true },
    { key: 'proteinPer100g', label: 'Protein' },
] as const;

function NutritionAmount({
    value,
    multiplier = 1,
    unit = 'g',
}: {
    value: number | undefined;
    multiplier?: number;
    unit?: 'g' | 'kcal';
}) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        return (
            <span
                className="nutrition-facts-unavailable"
                aria-label="Not available"
            >
                N/A
            </span>
        );
    }
    const amount = value * multiplier;
    return (
        <>
            {unit === 'kcal' ? Math.round(amount) : amount.toFixed(1)}
            <span className="nutrition-facts-unit"> {unit}</span>
        </>
    );
}

export default function IngredientNutritionSheet({
    ingredient,
    onClose,
}: IngredientNutritionSheetProps) {
    const panelRef = useRef<HTMLDialogElement>(null);
    const titleId = useId();
    const portion =
        typeof ingredient.weight === 'number' &&
        Number.isFinite(ingredient.weight) &&
        ingredient.weight >= 0
            ? ingredient.weight
            : undefined;
    const macroEnergy = [
        {
            key: 'carbs',
            label: 'Carbs',
            color: '#7f9fbd',
            calories: ingredient.carbohydratePer100g * 4,
        },
        {
            key: 'protein',
            label: 'Protein',
            color: '#f4796c',
            calories: ingredient.proteinPer100g * 4,
        },
        {
            key: 'fat',
            label: 'Fat',
            color: '#d4a85f',
            calories: ingredient.fatPer100g * 9,
        },
    ];
    const hasMacroData = macroEnergy.every(
        ({ calories }) => Number.isFinite(calories) && calories >= 0,
    );
    const macroTotal = hasMacroData
        ? macroEnergy.reduce((sum, { calories }) => sum + calories, 0)
        : 0;
    const breakdown = macroEnergy.map((macro) => ({
        ...macro,
        percentage: macroTotal > 0 ? (macro.calories / macroTotal) * 100 : 0,
    }));

    useEffect(() => {
        const panel = panelRef.current;
        if (!panel) return;
        const scrollers = [
            document.body,
            ...document.querySelectorAll<HTMLElement>('.page-transition'),
        ];
        const previous = scrollers.map((element) => ({
            element,
            overflow: element.style.overflow,
        }));
        panel.showModal();
        panel.focus({ preventScroll: true });
        for (const { element } of previous) element.style.overflow = 'hidden';
        return () => {
            for (const { element, overflow } of previous)
                element.style.overflow = overflow;
            panel.close();
        };
    }, []);

    return createPortal(
        <dialog
            ref={panelRef}
            aria-labelledby={titleId}
            tabIndex={-1}
            className="ingredient-nutrition-sheet"
            onCancel={(event) => {
                event.preventDefault();
                onClose();
            }}
            onClick={(event) => {
                if (event.target !== event.currentTarget) return;
                const bounds = event.currentTarget.getBoundingClientRect();
                if (
                    event.clientX < bounds.left ||
                    event.clientX > bounds.right ||
                    event.clientY < bounds.top ||
                    event.clientY > bounds.bottom
                )
                    onClose();
            }}
        >
            <header className="ingredient-nutrition-header">
                <IngredientThumbnail name={ingredient.name} />
                <div className="ingredient-nutrition-title">
                    <h4 className="ingredient-nutrition-name" id={titleId}>
                        {ingredient.name}
                    </h4>
                    <p className="ingredient-nutrition-caption">
                        {portion !== undefined
                            ? `${Number(portion.toFixed(1))} g in this meal`
                            : 'Nutrition per 100 g'}
                    </p>
                </div>
                <button
                    type="button"
                    className="ingredient-nutrition-close"
                    onClick={onClose}
                    aria-label="Close nutrition facts"
                >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="m6 6 12 12M18 6 6 18" />
                    </svg>
                </button>
            </header>

            <section className="nutrition-facts" aria-label="Nutrition facts">
                <section
                    className="ingredient-macro-breakdown"
                    aria-label="Macro energy breakdown"
                >
                    <ul className="ingredient-macro-legend">
                        {breakdown.map(({ key, label, color, percentage }) => (
                            <li key={key}>
                                <span
                                    className="ingredient-macro-dot"
                                    style={{ background: color }}
                                    aria-hidden="true"
                                />
                                <span>{label}</span>
                                <strong>
                                    {macroTotal > 0
                                        ? `${Math.round(percentage)}%`
                                        : '—'}
                                </strong>
                            </li>
                        ))}
                    </ul>
                    <div
                        className="ingredient-macro-bar"
                        role="img"
                        aria-label={
                            macroTotal > 0
                                ? breakdown
                                      .map(
                                          ({ label, percentage }) =>
                                              `${label}: ${Math.round(percentage)}% of macro energy`,
                                      )
                                      .join(', ')
                                : 'No macro energy breakdown available'
                        }
                    >
                        {breakdown
                            .filter(({ percentage }) => percentage > 0)
                            .map(({ key, color, percentage }) => (
                                <span
                                    key={key}
                                    style={{
                                        background: color,
                                        width: `${percentage}%`,
                                    }}
                                />
                            ))}
                    </div>
                </section>
                <table className="nutrition-facts-table">
                    <thead>
                        <tr>
                            <th scope="col">Amount</th>
                            {portion !== undefined && (
                                <th scope="col">In this meal</th>
                            )}
                            <th scope="col">Per 100 g</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr className="nutrition-facts-calories">
                            <th scope="row">Calories</th>
                            {portion !== undefined && (
                                <td>
                                    <NutritionAmount
                                        value={ingredient.caloriesPer100g}
                                        multiplier={portion / 100}
                                        unit="kcal"
                                    />
                                </td>
                            )}
                            <td>
                                <NutritionAmount
                                    value={ingredient.caloriesPer100g}
                                    unit="kcal"
                                />
                            </td>
                        </tr>
                        {nutrients.map((nutrient) => (
                            <tr
                                key={nutrient.key}
                                className={
                                    'inset' in nutrient
                                        ? 'nutrition-facts-inset'
                                        : undefined
                                }
                            >
                                <th scope="row">{nutrient.label}</th>
                                {portion !== undefined && (
                                    <td>
                                        <NutritionAmount
                                            value={ingredient[nutrient.key]}
                                            multiplier={portion / 100}
                                        />
                                    </td>
                                )}
                                <td>
                                    <NutritionAmount
                                        value={ingredient[nutrient.key]}
                                    />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <p className="nutrition-facts-note">
                    N/A means the value isn’t available for this ingredient.
                    Amounts are based on the ingredient’s nutrition data.
                </p>
            </section>
        </dialog>,
        document.body,
    );
}
