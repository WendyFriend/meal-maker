import type { MealSlotConfig } from '../../shared/types/profile';
import type { MealPlanEntry, Recipe } from '../../shared/types/recipe';
import { getEntryNutrition, getProgressTone, type PlannedMeal } from './budget';
import { formatTime } from './plannerDates';
import {
    MAX_SERVINGS,
    MIN_SERVINGS,
    SERVINGS_STEP,
    formatServings,
} from './servings';

type MealPeriodCardProps = {
    // Undefined for the "Other" group of entries whose period was removed.
    slot?: MealSlotConfig;
    meals: PlannedMeal[];
    // Calories this period gets from its share of the daily target.
    budgetCalories?: number;
    canReuse: boolean;
    onAdd?: () => void;
    onOpenRecipe: (recipe: Recipe) => void;
    onServingsChange: (entry: MealPlanEntry, servings: number) => void;
    onRemove: (entry: MealPlanEntry) => void;
    onRepeatTomorrow: (meal: PlannedMeal) => void;
    onCopy: (meal: PlannedMeal) => void;
    // Explains why reuse is locked; opens the plans page.
    onLockedReuse: () => void;
};

function LockIcon() {
    return (
        <svg
            className="period-lock"
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
        >
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
    );
}

export default function MealPeriodCard({
    slot,
    meals,
    budgetCalories,
    canReuse,
    onAdd,
    onOpenRecipe,
    onServingsChange,
    onRemove,
    onRepeatTomorrow,
    onCopy,
    onLockedReuse,
}: MealPeriodCardProps) {
    const label = slot?.label ?? 'Other';
    const planned = Math.round(
        meals.reduce(
            (total, meal) => total + getEntryNutrition(meal).calories,
            0,
        ),
    );
    const tone = getProgressTone(planned, budgetCalories ?? 0);

    return (
        <section className="period-card app-card" aria-label={label}>
            <header className="period-card-header">
                <div className="period-card-title">
                    <h3>{label}</h3>
                    {slot?.time && (
                        <span className="period-card-time">
                            {formatTime(slot.time)}
                        </span>
                    )}
                </div>
                <div className="period-card-budget">
                    {budgetCalories !== undefined ? (
                        <>
                            <span
                                className={`period-card-planned period-card-planned-${tone}`}
                            >
                                {planned.toLocaleString('en')}
                            </span>{' '}
                            / {budgetCalories.toLocaleString('en')} kcal
                        </>
                    ) : (
                        <>{planned.toLocaleString('en')} kcal</>
                    )}
                </div>
            </header>

            {budgetCalories !== undefined && (
                <div className="period-card-bar" aria-hidden="true">
                    <span
                        className={`period-card-bar-${tone}`}
                        style={{
                            width: `${Math.min(planned / Math.max(budgetCalories, 1), 1) * 100}%`,
                        }}
                    />
                </div>
            )}

            {meals.length > 0 ? (
                <ul className="period-entries">
                    {meals.map((meal) => {
                        const { entry, recipe } = meal;
                        const nutrition = getEntryNutrition(meal);

                        return (
                            <li key={entry.id} className="period-entry">
                                <div className="period-entry-main">
                                    <button
                                        type="button"
                                        className="period-entry-open"
                                        onClick={() => onOpenRecipe(recipe)}
                                    >
                                        {recipe.recipeName}
                                    </button>
                                    <span className="list-row-kcal">
                                        {Math.round(nutrition.calories)} kcal
                                        {entry.servings !== 1 &&
                                            ` × ${formatServings(entry.servings)}`}
                                    </span>
                                </div>
                                <p className="period-entry-macros">
                                    <span>
                                        P {Math.round(nutrition.proteinG)} g
                                    </span>
                                    <span>
                                        C {Math.round(nutrition.carbsG)} g
                                    </span>
                                    <span>
                                        F {Math.round(nutrition.fatG)} g
                                    </span>
                                </p>
                                <div className="period-entry-actions">
                                    <div
                                        className="period-stepper"
                                        role="group"
                                        aria-label={`Servings of ${recipe.recipeName}`}
                                    >
                                        <button
                                            type="button"
                                            onClick={() =>
                                                onServingsChange(
                                                    entry,
                                                    entry.servings -
                                                        SERVINGS_STEP,
                                                )
                                            }
                                            disabled={
                                                entry.servings <= MIN_SERVINGS
                                            }
                                            aria-label={`Fewer servings of ${recipe.recipeName}`}
                                        >
                                            −
                                        </button>
                                        <output>
                                            {formatServings(entry.servings)}
                                            <small>
                                                {entry.servings === 1
                                                    ? ' serving'
                                                    : ' servings'}
                                            </small>
                                        </output>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                onServingsChange(
                                                    entry,
                                                    entry.servings +
                                                        SERVINGS_STEP,
                                                )
                                            }
                                            disabled={
                                                entry.servings >= MAX_SERVINGS
                                            }
                                            aria-label={`More servings of ${recipe.recipeName}`}
                                        >
                                            +
                                        </button>
                                    </div>
                                    <div className="period-entry-tools">
                                        <button
                                            type="button"
                                            className={`period-tool${canReuse ? '' : ' period-tool-locked'}`}
                                            onClick={() =>
                                                canReuse
                                                    ? onRepeatTomorrow(meal)
                                                    : onLockedReuse()
                                            }
                                            aria-label={`Repeat ${recipe.recipeName} tomorrow${canReuse ? '' : ' (Pro)'}`}
                                        >
                                            {!canReuse && <LockIcon />}
                                            Repeat tomorrow
                                        </button>
                                        <button
                                            type="button"
                                            className={`period-tool${canReuse ? '' : ' period-tool-locked'}`}
                                            onClick={() =>
                                                canReuse
                                                    ? onCopy(meal)
                                                    : onLockedReuse()
                                            }
                                            aria-label={`Copy ${recipe.recipeName} to another day${canReuse ? '' : ' (Pro)'}`}
                                        >
                                            {!canReuse && <LockIcon />}
                                            Copy to…
                                        </button>
                                        <button
                                            type="button"
                                            className="period-tool period-tool-remove"
                                            onClick={() => onRemove(entry)}
                                            aria-label={`Remove ${recipe.recipeName}`}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            ) : (
                <p className="period-empty">Nothing planned yet.</p>
            )}

            {onAdd && slot && (
                <button
                    type="button"
                    className="period-add"
                    onClick={onAdd}
                    aria-label={`Add meal to ${slot.label}`}
                >
                    <svg
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                        focusable="false"
                    >
                        <path d="M12 5v14M5 12h14" />
                    </svg>
                    {meals.length > 0 ? 'Add another' : 'Add meal'}
                </button>
            )}
        </section>
    );
}
