import type { GenerateMealResponse } from '../../shared/types/types';
import {
    getPrepConsiderations,
    type PrepConsideration,
} from '../../shared/nutrition/prepGuidance';
import { getRecipeNutrition, type SlotBudget } from './budget';

type GeneratedMealPreviewProps = {
    meal: GenerateMealResponse;
    budget: SlotBudget;
};

function formatNumber(value: number) {
    return Math.round(value).toLocaleString('en');
}

function Stat({
    label,
    value,
    budget,
    unit,
}: {
    label: string;
    value: number;
    budget: number;
    unit: string;
}) {
    const ratio = budget > 0 ? value / budget : 0;
    const tone = ratio > 1.15 ? 'over' : ratio >= 0.85 ? 'on' : 'under';

    return (
        <div className={`meal-preview-stat meal-preview-stat-${tone}`}>
            <span className="meal-preview-stat-label">{label}</span>
            <strong>
                {formatNumber(value)}
                <small> {unit}</small>
            </strong>
            <span className="meal-preview-stat-budget">
                budget ≈ {formatNumber(budget)}
            </span>
            <span className="meal-preview-stat-bar" aria-hidden="true">
                <span style={{ width: `${Math.min(ratio, 1) * 100}%` }} />
            </span>
        </div>
    );
}

function Consideration({ item }: { item: PrepConsideration }) {
    return (
        <li className={`meal-preview-note meal-preview-note-${item.severity}`}>
            <strong>{item.title}</strong>
            <p>{item.summary}</p>
            <ul>
                {item.steps.map((step) => (
                    <li key={step}>{step}</li>
                ))}
            </ul>
        </li>
    );
}

/* A generated meal at a glance: how it compares with the period's budget,
   what's in it, preparation and safety notes, and the method. */
export default function GeneratedMealPreview({
    meal,
    budget,
}: GeneratedMealPreviewProps) {
    const nutrition = getRecipeNutrition(meal);
    const considerations: PrepConsideration[] =
        meal.considerations ??
        getPrepConsiderations(meal.ingredients.map(({ name }) => name));
    const required = considerations.filter(
        (item) => item.severity === 'required',
    );
    const others = considerations.filter(
        (item) => item.severity !== 'required',
    );

    return (
        <article className="meal-preview" aria-label={meal.mealName}>
            <h3 className="meal-preview-name">{meal.mealName}</h3>

            <div className="meal-preview-stats">
                <Stat
                    label="Calories"
                    value={nutrition.calories}
                    budget={budget.calories}
                    unit="kcal"
                />
                <Stat
                    label="Protein"
                    value={nutrition.proteinG}
                    budget={budget.proteinG}
                    unit="g"
                />
                <Stat
                    label="Carbs"
                    value={nutrition.carbsG}
                    budget={budget.carbsG}
                    unit="g"
                />
                <Stat
                    label="Fat"
                    value={nutrition.fatG}
                    budget={budget.fatG}
                    unit="g"
                />
            </div>

            <section className="meal-preview-section">
                <h4>Ingredients</h4>
                <ul className="meal-preview-ingredients">
                    {meal.ingredients.map((ingredient) => (
                        <li key={ingredient.name}>
                            <span>{ingredient.name}</span>
                            <span>{Math.round(ingredient.weight)} g</span>
                        </li>
                    ))}
                </ul>
            </section>

            {required.length > 0 && (
                <section
                    className="meal-preview-section"
                    aria-label="Safety notes"
                >
                    <h4>Prepare safely</h4>
                    <ul className="meal-preview-notes">
                        {required.map((item) => (
                            <Consideration key={item.id} item={item} />
                        ))}
                    </ul>
                </section>
            )}

            {others.length > 0 && (
                <details className="meal-preview-details">
                    <summary>
                        Preparation tips <span>{others.length}</span>
                    </summary>
                    <ul className="meal-preview-notes">
                        {others.map((item) => (
                            <Consideration key={item.id} item={item} />
                        ))}
                    </ul>
                </details>
            )}

            {meal.instructions.length > 0 && (
                <details className="meal-preview-details">
                    <summary>Method</summary>
                    <ol className="meal-preview-method">
                        {meal.instructions.map((step, index) => (
                            <li key={index}>{step}</li>
                        ))}
                    </ol>
                </details>
            )}
        </article>
    );
}
