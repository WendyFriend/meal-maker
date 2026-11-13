import type { totalFiber } from '../../utils/nutrition';
import NutritionDataNote from '../../components/NutritionDataNote';
import './MealNutritionHighlights.css';

export default function MealNutritionHighlights({
    calories,
    protein,
    fiber,
    partial = false,
}: {
    calories?: number;
    protein?: number;
    fiber: ReturnType<typeof totalFiber>;
    partial?: boolean;
}) {
    return (
        <div
            className="meal-result-highlights"
            role="group"
            aria-label="Meal nutrition summary"
        >
            <div>
                <strong>
                    {calories === undefined
                        ? '—'
                        : `~${Math.round(calories)} kcal`}
                </strong>
                <span>Calories</span>
            </div>
            <div>
                <strong>
                    {protein === undefined ? '—' : `~${Math.round(protein)} g`}
                </strong>
                <span>Protein</span>
            </div>
            <div
                title={
                    fiber.incomplete
                        ? 'Fiber data is unavailable for some ingredients'
                        : undefined
                }
            >
                <strong>
                    {fiber.available || (partial && fiber.hasKnown)
                        ? `~${Math.round(fiber.grams)} g`
                        : '—'}
                </strong>
                <span>Fiber</span>
            </div>
            {partial && (
                <NutritionDataNote className="meal-result-highlights-note" />
            )}
        </div>
    );
}
