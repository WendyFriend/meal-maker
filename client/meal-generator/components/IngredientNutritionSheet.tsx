import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './IngredientNutritionSheet.css';
import type { IngredientNutrition } from '../../../shared/types/types';
import { sumMicronutrients } from '../../../shared/nutrition/nutrients';
import { thumbnailUrl } from '../../../shared/nutrition/thumbnail';
import NutrientList from './NutrientList';
import { getIngredientMicronutrients } from './nutrientRows';

type IngredientNutritionSheetProps = {
    // With a weight, vitamins and minerals are shown for that amount.
    ingredient: IngredientNutrition & { weight?: number };
    onClose: () => void;
};

function describeSource({ nutritionSource, usda }: IngredientNutrition) {
    if (usda) return `USDA: ${usda.description}`;
    if (nutritionSource === 'user') return 'Your saved nutrition';
    if (nutritionSource === 'estimated') return 'Estimated by AI';

    return undefined;
}

function formatMacro(value: number | undefined, unit: 'kcal' | 'g') {
    if (value === undefined || !Number.isFinite(value)) return '–';
    return unit === 'kcal' ? `${Math.round(value)} kcal` : `${value.toFixed(1)} g`;
}

function IngredientNutritionSheet({
    ingredient,
    onClose,
}: IngredientNutritionSheetProps) {
    const panelRef = useRef<HTMLDivElement>(null);
    // Most foods have no thumbnail yet; the server 404s and the image is skipped.
    const [imageFailed, setImageFailed] = useState(false);
    const source = describeSource(ingredient);
    const weight = ingredient.weight ?? 100;
    const hasPortion = ingredient.weight !== undefined;
    const macroRows: {
        label: string;
        per100g: number | undefined;
        unit: 'kcal' | 'g';
        minor?: boolean;
    }[] = [
        { label: 'Energy', per100g: ingredient.caloriesPer100g, unit: 'kcal' },
        { label: 'Protein', per100g: ingredient.proteinPer100g, unit: 'g' },
        { label: 'Carbs', per100g: ingredient.carbohydratePer100g, unit: 'g' },
        { label: 'of which sugars', per100g: ingredient.sugarPer100g, unit: 'g', minor: true },
        { label: 'Fibre', per100g: ingredient.fiberPer100g, unit: 'g' },
        { label: 'Fat', per100g: ingredient.fatPer100g, unit: 'g' },
        { label: 'of which saturated', per100g: ingredient.saturatedFatPer100g, unit: 'g', minor: true },
    ];
    const amounts = sumMicronutrients([
        {
            weight,
            micronutrientsPer100g: getIngredientMicronutrients(ingredient),
        },
    ]);

    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                onClose();
            }
        }

        document.addEventListener('keydown', handleKeyDown);

        panelRef.current?.focus();

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [onClose]);

    return createPortal(
        <>
            <div
                className="ingredient-nutrition-backdrop"
                onClick={onClose}
                aria-hidden="true"
            />

            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-label={`${ingredient.name} nutrition facts`}
                tabIndex={-1}
                className="ingredient-nutrition-sheet"
            >
                {ingredient.usda && !imageFailed && (
                    <img
                        className="ingredient-nutrition-image"
                        src={thumbnailUrl(ingredient.usda.fdcId)}
                        alt={ingredient.name}
                        onError={() => setImageFailed(true)}
                    />
                )}

                <h4 className="ingredient-nutrition-name">{ingredient.name}</h4>

                {source && (
                    <p className="ingredient-nutrition-source">{source}</p>
                )}

                <table className="ingredient-nutrition-table">
                    <thead>
                        <tr>
                            <th scope="col">
                                <span className="visually-hidden">Nutrient</span>
                            </th>
                            <th scope="col">Per 100 g</th>
                            {hasPortion && (
                                <th scope="col">In your {Math.round(weight)} g</th>
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {macroRows.map((row) => (
                            <tr key={row.label} className={row.minor ? 'is-minor' : undefined}>
                                <th scope="row">{row.label}</th>
                                <td>{formatMacro(row.per100g, row.unit)}</td>
                                {hasPortion && (
                                    <td>
                                        <strong>
                                            {formatMacro(
                                                row.per100g === undefined
                                                    ? undefined
                                                    : (row.per100g * weight) / 100,
                                                row.unit,
                                            )}
                                        </strong>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>

                <h5 className="ingredient-nutrition-subtitle">
                    {ingredient.weight === undefined
                        ? 'Fats, minerals and vitamins per 100 g'
                        : `In your ${Math.round(weight)} g`}
                </h5>

                <NutrientList amounts={amounts} />
            </div>
        </>,
        document.body,
    );
}

export default IngredientNutritionSheet;
