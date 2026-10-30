import { totalNutrition } from '../utils/nutrition';
import type { MealIngredient } from '../../shared/types/types';

const macros = [
    { key: 'carbohydrate', label: 'Carbs', factor: 4, color: '#7f9fbd' },
    { key: 'protein', label: 'Protein', factor: 4, color: '#f4796c' },
    { key: 'fat', label: 'Fat', factor: 9, color: '#d4a85f' },
] as const;
export default function DailyMacros({
    ingredients,
}: {
    ingredients: MealIngredient[];
}) {
    const totals = totalNutrition(ingredients);
    const energy = macros.reduce(
        (sum, macro) => sum + totals[macro.key] * macro.factor,
        0,
    );
    let end = 0;
    const slices = macros.map((macro) => {
        const start = end;
        end +=
            energy > 0
                ? ((totals[macro.key] * macro.factor) / energy) * 100
                : 0;
        return `${macro.color} ${start}% ${end}%`;
    });
    return (
        <section
            className="journal-section"
            aria-labelledby="journal-macros-heading"
        >
            <h2 id="journal-macros-heading">Daily nutrition</h2>
            <div className="journal-macros">
                <div
                    className="journal-pie"
                    role="img"
                    aria-label={
                        energy > 0
                            ? 'Daily energy breakdown: carbs, protein and fat. Amounts are listed beside the chart.'
                            : 'No food logged for this day'
                    }
                    style={{
                        background:
                            energy > 0
                                ? `conic-gradient(${slices.join(',')})`
                                : 'var(--surface-muted)',
                    }}
                />
                <div className="journal-calories">
                    <strong>{Math.round(totals.calories)}</strong>
                    <span>kcal</span>
                </div>
                <ul className="journal-macro-legends">
                    {macros.map((macro) => (
                        <li key={macro.key}>
                            <span
                                className="journal-macro-dot"
                                style={{ background: macro.color }}
                            />
                            <span>{macro.label}</span>
                            <strong>
                                {Number(totals[macro.key].toFixed(1))}
                                <small> g</small>
                            </strong>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}
