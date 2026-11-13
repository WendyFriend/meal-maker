import './IngredientCalorieContribution.css';

export default function IngredientCalorieContribution({
    name,
    calories,
    scale,
}: {
    name: string;
    calories?: number;
    scale: number;
}) {
    const value =
        calories === undefined || !Number.isFinite(calories)
            ? undefined
            : Math.max(0, calories);
    const width =
        value === undefined ? 0 : Math.min(100, (value / scale) * 100);
    return (
        <div className="ingredient-calorie-contribution">
            <div
                className="ingredient-calorie-track"
                role="meter"
                aria-label={`${name} calorie contribution`}
                aria-valuemin={0}
                aria-valuemax={scale}
                aria-valuenow={
                    value === undefined ? undefined : Math.min(scale, value)
                }
                aria-valuetext={
                    value === undefined
                        ? 'Calories unavailable'
                        : `${Math.round(value)} kcal`
                }
            >
                <span
                    className="ingredient-calorie-fill"
                    style={{ width: `${width}%` }}
                />
            </div>
        </div>
    );
}
