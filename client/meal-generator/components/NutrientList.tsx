import './NutrientList.css';
import {
    BASIC_NUTRIENT_KEYS,
    type Micronutrients,
} from '../../../shared/nutrition/nutrients';
import { usePlan } from '../../plan/PlanContext';
import UpgradeNotice from '../../plan/UpgradeNotice';
import { formatAmount, groupNutrients } from './nutrientRows';

type NutrientListProps = {
    // Amounts in each nutrient's own unit, at the quantity being shown.
    amounts: Micronutrients;
    // How many of the meal's ingredients have USDA data; omitted for a
    // single ingredient.
    coverage?: { known: number; total: number };
    // What the amounts are for, e.g. "per serving".
    basis?: string;
};

/*
 * Fats, minerals and vitamins with % Daily Value bars. Nutrients to keep
 * under a limit (sodium, saturated fat...) are marked and coloured apart.
 * The free plan sees the basics and a prompt for the rest.
 */
function NutrientList({ amounts, coverage, basis }: NutrientListProps) {
    const { limits } = usePlan();
    const allGroups = groupNutrients(amounts);
    const groups = limits.fullNutrients
        ? allGroups
        : groupNutrients(amounts, BASIC_NUTRIENT_KEYS);
    const countRows = (list: typeof groups) =>
        list.reduce((total, { rows }) => total + rows.length, 0);
    const hasLockedNutrients = countRows(allGroups) > countRows(groups);
    const partialNote =
        coverage && coverage.known > 0 && coverage.known < coverage.total
            ? `Based on our database for ${coverage.known} of ${coverage.total} ingredients, so totals may be low. `
            : '';

    return (
        <div className="nutrient-list">
            {groups.map(({ group, label, rows }) => (
                <section key={group} className="nutrient-group">
                    <h5 className="nutrient-group-title">{label}</h5>

                    <ul className="nutrient-rows">
                        {rows.map(({ nutrient, amount, percent }) => (
                            <li
                                key={nutrient.key}
                                className={`nutrient-row${
                                    nutrient.limit ? ' nutrient-row-limit' : ''
                                }`}
                            >
                                <span className="nutrient-name">
                                    {nutrient.label}
                                    {nutrient.limit && (
                                        <span className="nutrient-limit-tag">
                                            keep under
                                        </span>
                                    )}
                                </span>
                                <span className="nutrient-amount">
                                    {formatAmount(amount)} {nutrient.unit}
                                </span>

                                {percent !== undefined && (
                                    <>
                                        <span
                                            className="nutrient-bar"
                                            role="img"
                                            aria-label={`${percent}% of the daily ${
                                                nutrient.limit
                                                    ? 'limit'
                                                    : 'value'
                                            }`}
                                        >
                                            <span
                                                className={`nutrient-bar-fill${
                                                    nutrient.limit &&
                                                    percent > 100
                                                        ? ' nutrient-bar-over'
                                                        : ''
                                                }`}
                                                style={{
                                                    width: `${Math.min(percent, 100)}%`,
                                                }}
                                            />
                                        </span>
                                        <span className="nutrient-percent">
                                            {percent}% DV
                                        </span>
                                    </>
                                )}
                            </li>
                        ))}
                    </ul>
                </section>
            ))}

            {allGroups.length === 0 && (
                <p className="nutrient-note">
                    No detailed nutrient data for{' '}
                    {coverage ? 'these ingredients' : 'this ingredient'}.
                </p>
            )}

            {groups.length > 0 && (partialNote || basis) && (
                <p className="nutrient-note">
                    {partialNote}
                    {basis &&
                        `Amounts ${basis}; % DV is for a 2,000 kcal diet.`}
                </p>
            )}

            {hasLockedNutrients && (
                <UpgradeNotice
                    feature="Vitamins & minerals"
                    description="See every vitamin, mineral and the full fat breakdown with % Daily Value."
                    compact
                />
            )}
        </div>
    );
}

export default NutrientList;
