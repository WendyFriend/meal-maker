import { useEffect, useRef } from 'react';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { MealIngredient } from '../../../shared/types/types';
import {
    DAILY_VALUE_SOURCE,
    MICRONUTRIENTS,
    type MicronutrientValues,
} from '../../../shared/micronutrients';
import MicronutrientList from './MicronutrientList';
import NutritionInfo from './NutritionInfo';
import type { MicronutrientContributions } from './MicronutrientContributors';
import MicronutrientContributors from './MicronutrientContributors';
import { useMicronutrientLookup } from '../../hooks/useMicronutrientLookup';
import {
    hasMicronutrientValue,
    micronutrientLookupKey,
} from '../../services/micronutrientService';
import {
    recipeNutritionEnrichments,
    type RecipeNutritionEnrichment,
} from '../../utils/recipeNutrition';

const FIBER_DAILY_VALUE_GRAMS = 28;

function MealFiber({
    ingredients,
    scope,
}: {
    ingredients: MealIngredient[];
    scope: 'meal' | 'day';
}) {
    let total = 0;
    let hasKnownValue = false;
    const missing: string[] = [];
    const byIngredient = new Map<string, { name: string; amount: number }>();

    for (const ingredient of ingredients) {
        const { weight, fiberPer100g, name } = ingredient;
        if (!Number.isFinite(weight) || weight < 0) {
            missing.push(name);
            continue;
        }
        if (weight === 0) continue;
        if (
            typeof fiberPer100g !== 'number' ||
            !Number.isFinite(fiberPer100g) ||
            fiberPer100g < 0
        ) {
            missing.push(name);
            continue;
        }
        const amount = (fiberPer100g * weight) / 100;
        total += amount;
        hasKnownValue = true;
        if (amount > 0) {
            const key = micronutrientLookupKey(name);
            const previous = byIngredient.get(key);
            byIngredient.set(key, {
                name,
                amount: (previous?.amount ?? 0) + amount,
            });
        }
    }

    const contribution = {
        ingredients: [...byIngredient.values()].sort(
            (a, b) => b.amount - a.amount,
        ),
        missing: [...new Set(missing)],
    };
    const percentage = (total / FIBER_DAILY_VALUE_GRAMS) * 100;
    const percentageText =
        percentage > 0 && percentage < 1 ? '<1%' : `${Math.round(percentage)}%`;
    const label = scope === 'day' ? 'Fibre' : 'Fiber';
    const track = (
        <>
            <progress
                max={100}
                value={Math.min(100, percentage)}
                aria-label={`${label} daily value ${scope === 'day' ? 'for this day' : 'in this meal'}`}
                aria-valuetext={`${percentageText} of Daily Value${missing.length ? ' from ingredients with available data' : ''}`}
            />
            <span aria-hidden="true">{percentageText} DV</span>
        </>
    );

    return (
        <li>
            <div className="ingredient-micronutrient-label">
                <span className="ingredient-micronutrient-trigger meal-fiber-label">
                    {label}
                </span>
                <span className="ingredient-micronutrient-value">
                    <span>
                        {hasKnownValue
                            ? `${Number(total.toFixed(2))} g`
                            : 'N/A'}
                    </span>
                    {!hasKnownValue && missing.length > 0 && (
                        <small>Missing</small>
                    )}
                </span>
            </div>
            {hasKnownValue || missing.length > 0 ? (
                <MicronutrientContributors
                    label={label}
                    unit="g"
                    contribution={contribution}
                    scopeLabel={scope === 'day' ? 'this day' : 'this meal'}
                    percentageText={hasKnownValue ? percentageText : 'N/A'}
                    trigger={
                        hasKnownValue ? (
                            track
                        ) : (
                            <span className="micronutrient-missing-trigger">
                                See missing ingredients
                            </span>
                        )
                    }
                />
            ) : null}
        </li>
    );
}

export default function MealMicronutrients({
    ingredients,
    scope = 'meal',
    onNutritionFound,
}: {
    ingredients: MealIngredient[];
    scope?: 'meal' | 'day';
    onNutritionFound?: (enrichments: RecipeNutritionEnrichment[]) => void;
}) {
    const { data, loading, failed, retry } = useMicronutrientLookup(
        ingredients.filter(({ weight }) => weight > 0),
    );
    const lastReported = useRef('');
    useEffect(() => {
        if (!onNutritionFound) return;
        const enrichments = recipeNutritionEnrichments(ingredients, data);
        const fingerprint = JSON.stringify(enrichments);
        if (!enrichments.length) {
            lastReported.current = '';
            return;
        }
        if (fingerprint === lastReported.current) return;
        lastReported.current = fingerprint;
        onNutritionFound(enrichments);
    }, [ingredients, data, onNutritionFound]);
    const contributions: MicronutrientContributions = {};
    const totals: MicronutrientValues = Object.fromEntries(
        MICRONUTRIENTS.map(({ key }) => {
            let total = 0;
            let hasKnownValue = false;
            const missing: string[] = [];
            const byIngredient = new Map<
                string,
                { name: string; amount: number }
            >();
            for (const ingredient of ingredients) {
                if (
                    !Number.isFinite(ingredient.weight) ||
                    ingredient.weight < 0
                ) {
                    missing.push(ingredient.name);
                    continue;
                }
                if (ingredient.weight === 0) continue;
                const value = hasMicronutrientValue(ingredient[key])
                    ? ingredient[key]
                    : ingredient.unavailableMicronutrients?.includes(key)
                      ? undefined
                      : data[micronutrientLookupKey(ingredient.name)]?.[key];
                if (
                    typeof value !== 'number' ||
                    !Number.isFinite(value) ||
                    value < 0
                ) {
                    missing.push(ingredient.name);
                    continue;
                }
                const amount = (value * ingredient.weight) / 100;
                if (!Number.isFinite(amount)) {
                    missing.push(ingredient.name);
                    continue;
                }
                total += amount;
                hasKnownValue = true;
                if (amount > 0) {
                    const nameKey = micronutrientLookupKey(ingredient.name);
                    const previous = byIngredient.get(nameKey);
                    byIngredient.set(nameKey, {
                        name: ingredient.name,
                        amount: (previous?.amount ?? 0) + amount,
                    });
                }
            }
            contributions[key] = {
                ingredients: [...byIngredient.values()].sort(
                    (a, b) => b.amount - a.amount,
                ),
                missing: [...new Set(missing)],
            };
            return [
                key,
                (hasKnownValue ||
                    (scope === 'day' && ingredients.length === 0)) &&
                Number.isFinite(total)
                    ? total
                    : undefined,
            ];
        }),
    );

    return (
        <section
            className="ingredient-nutrition-details meal-micronutrients"
            aria-label={
                scope === 'day' ? 'Daily key nutrients' : 'Meal key nutrients'
            }
            aria-busy={loading}
        >
            <div className="ingredient-details-heading">
                <div className="ingredient-details-title">
                    <h3>Key nutrients</h3>
                    <NutritionInfo label="About key nutrients">
                        {' '}
                        <p className="ingredient-details-note">
                            Based on{' '}
                            {scope === 'day'
                                ? 'foods logged for this day'
                                : 'the ingredient amounts above'}{' '}
                            and{' '}
                            <a
                                href={DAILY_VALUE_SOURCE}
                                target="_blank"
                                rel="noreferrer"
                            >
                                FDA Daily Values
                            </a>{' '}
                            for adults and children 4+. Missing ingredient data
                            for vitamins and minerals is looked up from USDA
                            reference foods. Fiber uses available ingredient
                            data. Totals include every ingredient with an
                            available value; tap the nutrient bar to see which
                            ingredients are excluded. N/A means no ingredient
                            has an available value for that nutrient.
                        </p>{' '}
                    </NutritionInfo>
                </div>
                <span className="meal-micronutrients-heading-status">
                    {scope === 'day' ? 'This day' : 'This meal'} · % DV
                    <span
                        className="meal-micronutrients-loading-indicator"
                        role={loading ? 'status' : undefined}
                        aria-label={
                            loading ? 'Updating key nutrients' : undefined
                        }
                    >
                        {loading && <LoadingSpinner size="small" />}
                    </span>
                </span>
            </div>
            {failed.length > 0 && (
                <p className="ingredient-details-note" role="status">
                    Some ingredient data could not be loaded.{' '}
                    <button type="button" onClick={retry}>
                        Try again
                    </button>
                </p>
            )}
            <MicronutrientList
                leadingItem={
                    <MealFiber ingredients={ingredients} scope={scope} />
                }
                amounts={totals}
                basis={scope === 'day' ? 'for this day' : 'in this meal'}
                contributions={contributions}
                contributionScope={scope === 'day' ? 'this day' : 'this meal'}
            />
        </section>
    );
}
