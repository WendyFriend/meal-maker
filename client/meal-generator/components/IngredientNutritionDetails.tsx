import LoadingSpinner from '../../components/LoadingSpinner';
import type { IngredientInfo } from '../../../shared/types/types';
import { DAILY_VALUE_SOURCE } from '../../../shared/micronutrients';
import MicronutrientList, {
    type MicronutrientEditor,
} from './MicronutrientList';
import NutritionInfo from './NutritionInfo';
import './IngredientNutritionDetails.css';
import type { useMicronutrientLookup } from '../../hooks/useMicronutrientLookup';
import { micronutrientLookupKey } from '../../services/micronutrientService';

export default function IngredientNutritionDetails({
    ingredient,
    micronutrientEditor,
    lookupState,
}: {
    ingredient: IngredientInfo;
    lookupState: ReturnType<typeof useMicronutrientLookup>;
    micronutrientEditor?: MicronutrientEditor;
}) {
    const { data, loading, failed, retry } = lookupState;
    const lookup = data[micronutrientLookupKey(ingredient.name)];
    const source = lookup?.nutritionSource ?? ingredient.nutritionSource;

    return (
        <div className="ingredient-nutrition-details">
            <section aria-label="Micronutrients" aria-busy={loading}>
                <div className="ingredient-details-heading">
                    <div className="ingredient-details-title">
                        <h3>Vitamins & minerals</h3>
                        <NutritionInfo>
                            {' '}
                            <p className="ingredient-details-note">
                                Percentages use{' '}
                                <a
                                    href={DAILY_VALUE_SOURCE}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    FDA Daily Values
                                </a>{' '}
                                for adults and children 4+. These are general
                                label references, not personalised targets. N/A
                                means data is unavailable.
                            </p>
                            {source && (
                                <p className="ingredient-details-note">
                                    Reference food:{' '}
                                    <a
                                        href={`https://fdc.nal.usda.gov/food-details/${source.fdcId}/nutrients`}
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        {source.description} · USDA
                                    </a>
                                    . Values can vary by variety, brand and
                                    cooking method.
                                </p>
                            )}
                        </NutritionInfo>
                    </div>
                    <span>Per 100 g · % DV</span>
                </div>
                {micronutrientEditor && (
                    <p className="ingredient-details-note">
                        Enter amounts per 100 g. Leave blank to use reference
                        data when available.
                    </p>
                )}
                {loading && !micronutrientEditor ? (
                    <p
                        className="ingredient-details-note loading-label"
                        role="status"
                    >
                        <LoadingSpinner size="small" />
                        Loading micronutrients…
                    </p>
                ) : (
                    <>
                        {failed.length > 0 && (
                            <p
                                className="ingredient-details-note"
                                role="status"
                            >
                                Micronutrients are currently unavailable.{' '}
                                <button type="button" onClick={retry}>
                                    Try again
                                </button>
                            </p>
                        )}
                        <MicronutrientList
                            editor={micronutrientEditor}
                            amounts={{
                                ...lookup,
                                ...Object.fromEntries(
                                    Object.entries(ingredient).filter(
                                        ([, value]) =>
                                            value !== undefined &&
                                            value !== null,
                                    ),
                                ),
                            }}
                        />
                    </>
                )}
            </section>
        </div>
    );
}
