import { useId, useState, type ReactNode } from 'react';
import IngredientThumbnail from './IngredientThumbnail';
import IngredientNutritionDetails from './IngredientNutritionDetails';
import './IngredientNutritionContent.css';
import type { MicronutrientEditor } from './MicronutrientList';
import './NutritionOverview.css';
import type { IngredientInfo } from '../../../shared/types/types';
import type { NutritionFieldId } from './NutritionField';

export type IngredientNutritionEditor = {
    name: string;
    showRequiredMarkers?: boolean;
    micronutrients?: MicronutrientEditor;
    values: Record<NutritionFieldId, string>;
    preparationTips: string;
    onNameChange: (name: string) => void;
    onValueChange: (field: NutritionFieldId, value: string) => void;
    onPreparationChange: (value: string) => void;
    disabled?: boolean;
};

type IngredientNutritionContentProps = {
    ingredient: IngredientInfo & { weight?: number };
    onClose?: () => void;
    titleId?: string;
    headingLevel?: 'h1' | 'h4';
    headerAction?: ReactNode;
    editor?: IngredientNutritionEditor;
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
    unit = 'g',
}: {
    value: number | undefined;
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
    const amount = value;
    return (
        <>
            {unit === 'kcal' ? Math.round(amount) : amount.toFixed(1)}
            <span className="nutrition-facts-unit"> {unit}</span>
        </>
    );
}

export default function IngredientNutritionContent({
    ingredient,
    onClose,
    titleId,
    headingLevel = 'h4',
    headerAction,
    editor,
}: IngredientNutritionContentProps) {
    const generatedId = useId();
    const nameId = titleId ?? generatedId;
    const Heading = headingLevel;
    const tooltipId = useId();
    const [hoveredMacro, setHoveredMacro] = useState<string | null>(null);
    const [focusedMacro, setFocusedMacro] = useState<string | null>(null);
    const activeKey = hoveredMacro ?? focusedMacro;
    const macroEnergy = [
        {
            key: 'carbs',
            label: 'Carbs',
            color: '#7f9fbd',
            calories:
                Number(
                    editor?.values.carbohydratePer100g ??
                        ingredient.carbohydratePer100g,
                ) * 4,
        },
        {
            key: 'protein',
            label: 'Protein',
            color: '#f4796c',
            calories:
                Number(
                    editor?.values.proteinPer100g ?? ingredient.proteinPer100g,
                ) * 4,
        },
        {
            key: 'fat',
            label: 'Fat',
            color: '#d4a85f',
            calories:
                Number(editor?.values.fatPer100g ?? ingredient.fatPer100g) * 9,
        },
    ];
    const hasMacroData = macroEnergy.every(
        ({ calories }) => Number.isFinite(calories) && calories >= 0,
    );
    const macroTotal = hasMacroData
        ? macroEnergy.reduce((sum, { calories }) => sum + calories, 0)
        : 0;
    const breakdown = macroEnergy.map((macro) => {
        const barPercentage =
            macroTotal > 0 ? (macro.calories / macroTotal) * 100 : 0;
        return {
            ...macro,
            barPercentage,
            percentage: Math.floor(barPercentage),
        };
    });
    if (macroTotal > 0) {
        // Allocate rounding differences to the largest fractional shares so
        // the displayed whole-number percentages always total 100.
        const remainder =
            100 - breakdown.reduce((sum, macro) => sum + macro.percentage, 0);
        const ranked = [...breakdown].sort(
            (a, b) =>
                b.barPercentage -
                b.percentage -
                (a.barPercentage - a.percentage),
        );
        for (const macro of ranked.slice(0, remainder)) macro.percentage += 1;
    }
    const activeIndex = breakdown.findIndex(({ key }) => key === activeKey);
    const activeMacro = breakdown[activeIndex];
    const tooltipCenter = activeMacro
        ? breakdown
              .slice(0, activeIndex)
              .reduce((sum, macro) => sum + macro.barPercentage, 0) +
          activeMacro.barPercentage / 2
        : 50;

    function nutritionValue(
        field: NutritionFieldId,
        label: string,
        unit: 'g' | 'kcal' = 'g',
    ) {
        if (!editor)
            return <NutritionAmount value={ingredient[field]} unit={unit} />;
        const required = [
            'caloriesPer100g',
            'proteinPer100g',
            'carbohydratePer100g',
            'fatPer100g',
        ].includes(field);
        return (
            <span className="ingredient-inline-value">
                <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    required={required}
                    aria-label={`${label} per 100 grams`}
                    value={editor.values[field]}
                    disabled={editor.disabled}
                    onChange={(event) =>
                        editor.onValueChange(field, event.target.value)
                    }
                />
                <span className="nutrition-facts-unit">{unit}</span>
            </span>
        );
    }

    return (
        <div className="ingredient-nutrition-content">
            <header className="ingredient-nutrition-header">
                <IngredientThumbnail name={ingredient.name} />
                <div className="ingredient-nutrition-title">
                    {editor ? (
                        <>
                            {editor.showRequiredMarkers && (
                                <label
                                    className="ingredient-name-label"
                                    htmlFor={nameId}
                                >
                                    Ingredient name{' '}
                                    <span
                                        className="ingredient-required-marker"
                                        aria-hidden="true"
                                    >
                                        *
                                    </span>
                                </label>
                            )}
                            <input
                                id={nameId}
                                className="ingredient-nutrition-name ingredient-inline-name"
                                aria-label="Ingredient name"
                                placeholder="e.g. chickpeas"
                                value={editor.name}
                                onChange={(event) =>
                                    editor.onNameChange(event.target.value)
                                }
                                required
                                disabled={editor.disabled}
                            />
                        </>
                    ) : (
                        <Heading
                            className="ingredient-nutrition-name"
                            id={nameId}
                        >
                            {ingredient.name}
                        </Heading>
                    )}
                </div>
                {onClose && (
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
                )}
                {headerAction}
            </header>

            <section className="nutrition-facts" aria-label="Nutrition facts">
                <section
                    className="ingredient-macro-breakdown"
                    aria-label="Macro energy breakdown"
                    onPointerLeave={() => setHoveredMacro(null)}
                    onBlur={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget))
                            setFocusedMacro(null);
                    }}
                    onKeyDown={(event) => {
                        if (event.key === 'Escape' && activeKey !== null) {
                            event.preventDefault();
                            event.stopPropagation();
                            setHoveredMacro(null);
                            setFocusedMacro(null);
                        }
                    }}
                >
                    <ul className="ingredient-macro-legend">
                        {breakdown.map(({ key, label, color, percentage }) => (
                            <li
                                key={key}
                                data-macro={key}
                                data-active={activeKey === key}
                            >
                                <span
                                    className="ingredient-macro-dot"
                                    style={{ background: color }}
                                    aria-hidden="true"
                                />
                                <span>{label}</span>
                                <strong>
                                    {macroTotal > 0 ? `${percentage}%` : '—'}
                                </strong>
                            </li>
                        ))}
                    </ul>
                    <div className="nutrition-overview-chart">
                        {activeMacro && (
                            <div
                                className="nutrition-overview-tooltip"
                                id={tooltipId}
                                role="tooltip"
                                style={{
                                    left: `clamp(80px, ${tooltipCenter}%, calc(100% - 80px))`,
                                }}
                            >
                                <strong>{activeMacro.label}</strong>
                                <span>
                                    {activeMacro.percentage}% of macro energy
                                </span>
                            </div>
                        )}
                        <div
                            className="ingredient-macro-bar nutrition-overview-bar"
                            data-has-active={activeKey !== null}
                            role="group"
                            aria-label={
                                macroTotal > 0
                                    ? breakdown
                                          .map(
                                              ({ label, percentage }) =>
                                                  `${label}: ${percentage}% of macro energy`,
                                          )
                                          .join(', ')
                                    : 'No macro energy breakdown available'
                            }
                        >
                            {breakdown
                                .filter(
                                    ({ barPercentage }) => barPercentage > 0,
                                )
                                .map(
                                    ({
                                        key,
                                        label,
                                        color,
                                        percentage,
                                        barPercentage,
                                    }) => (
                                        <button
                                            type="button"
                                            key={key}
                                            className="nutrition-overview-segment"
                                            data-active={activeKey === key}
                                            aria-pressed={focusedMacro === key}
                                            aria-label={`${label}: ${percentage}% of macro energy`}
                                            aria-describedby={
                                                activeKey === key
                                                    ? tooltipId
                                                    : undefined
                                            }
                                            style={
                                                {
                                                    '--macro-color': color,
                                                    width: `${barPercentage}%`,
                                                } as React.CSSProperties
                                            }
                                            onPointerEnter={(event) => {
                                                if (
                                                    event.pointerType !==
                                                    'touch'
                                                )
                                                    setHoveredMacro(key);
                                            }}
                                            onFocus={() => setFocusedMacro(key)}
                                            onClick={(event) => {
                                                setFocusedMacro(key);
                                                event.currentTarget.focus({
                                                    preventScroll: true,
                                                });
                                            }}
                                        />
                                    ),
                                )}
                        </div>
                    </div>
                </section>
                <table className="nutrition-facts-table">
                    <thead>
                        <tr>
                            <th scope="col" aria-label="Nutrient" />
                            <th scope="col">Per 100 g</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <th scope="row">
                                Calories
                                {editor?.showRequiredMarkers && (
                                    <span
                                        className="ingredient-required-marker"
                                        aria-hidden="true"
                                    >
                                        {' '}
                                        *
                                    </span>
                                )}
                            </th>
                            <td>
                                {nutritionValue(
                                    'caloriesPer100g',
                                    'Calories',
                                    'kcal',
                                )}
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
                                <th scope="row">
                                    {nutrient.label}
                                    {editor?.showRequiredMarkers &&
                                        [
                                            'proteinPer100g',
                                            'fatPer100g',
                                            'carbohydratePer100g',
                                        ].includes(nutrient.key) && (
                                            <span
                                                className="ingredient-required-marker"
                                                aria-hidden="true"
                                            >
                                                {' '}
                                                *
                                            </span>
                                        )}
                                </th>
                                <td>
                                    {nutritionValue(
                                        nutrient.key,
                                        nutrient.label,
                                    )}
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
            <IngredientNutritionDetails
                ingredient={ingredient}
                micronutrientEditor={editor?.micronutrients}
                preparationEditor={
                    editor
                        ? {
                              value: editor.preparationTips,
                              onChange: editor.onPreparationChange,
                              disabled: editor.disabled,
                          }
                        : undefined
                }
            />
        </div>
    );
}
