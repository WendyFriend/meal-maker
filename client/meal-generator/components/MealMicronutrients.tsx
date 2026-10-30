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
import { useMicronutrientLookup } from '../../hooks/useMicronutrientLookup';
import {
    hasMicronutrientValue,
    micronutrientLookupKey,
} from '../../services/micronutrientService';

export default function MealMicronutrients({
    ingredients,
    scope = 'meal',
}: {
    ingredients: MealIngredient[];
    scope?: 'meal' | 'day';
}) {
    const { data, loading, failed, retry } = useMicronutrientLookup(
        ingredients.filter(({ weight }) => weight > 0),
    );
    const contributions: MicronutrientContributions = {};
    const totals: MicronutrientValues = Object.fromEntries(
        MICRONUTRIENTS.map(({ key }) => {
            let total = 0;
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
                (scope === 'day' || ingredients.length > 0) &&
                missing.length === 0 &&
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
                scope === 'day'
                    ? 'Daily vitamins and minerals'
                    : 'Meal vitamins and minerals'
            }
            aria-busy={loading}
        >
            <div className="ingredient-details-heading">
                <div className="ingredient-details-title">
                    <h3>Vitamins & minerals</h3>
                    <NutritionInfo>
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
                            is looked up from USDA reference foods. N/A means at
                            least one ingredient’s nutrient value is still
                            unavailable.
                        </p>{' '}
                    </NutritionInfo>
                </div>
                <span>{scope === 'day' ? 'This day' : 'This meal'} · % DV</span>
            </div>
            {loading ? (
                <p
                    className="ingredient-details-note loading-label"
                    role="status"
                >
                    <LoadingSpinner size="small" />
                    Loading vitamins & minerals…
                </p>
            ) : (
                <>
                    {failed.length > 0 && (
                        <p className="ingredient-details-note" role="status">
                            Some ingredient data could not be loaded.{' '}
                            <button type="button" onClick={retry}>
                                Try again
                            </button>
                        </p>
                    )}
                    <MicronutrientList
                        amounts={totals}
                        basis={
                            scope === 'day' ? 'for this day' : 'in this meal'
                        }
                        contributions={contributions}
                        contributionScope={
                            scope === 'day' ? 'this day' : 'this meal'
                        }
                    />
                </>
            )}
        </section>
    );
}
