import { useId, useState } from 'react';
import './NutritionOverview.css';

type MacroKey = 'carbohydrate' | 'protein' | 'fat';
type NutritionOverviewProps = {
    nutrition: Record<MacroKey | 'calories', number>;
    percentages: Record<MacroKey, number>;
};

const macros = [
    { key: 'carbohydrate', label: 'Carbs', caloriesPerGram: 4 },
    { key: 'protein', label: 'Protein', caloriesPerGram: 4 },
    { key: 'fat', label: 'Fat', caloriesPerGram: 9 },
] as const;

export default function NutritionOverview({
    nutrition,
    percentages,
}: NutritionOverviewProps) {
    const [hovered, setHovered] = useState<MacroKey | null>(null);
    const [focused, setFocused] = useState<MacroKey | null>(null);
    const tooltipId = useId();
    const activeKey = hovered ?? focused;
    const active = macros.find(({ key }) => key === activeKey);
    const activeIndex = macros.findIndex(({ key }) => key === activeKey);
    const center = active
        ? macros
              .slice(0, activeIndex)
              .reduce((sum, { key }) => sum + percentages[key], 0) +
          percentages[active.key] / 2
        : 50;

    return (
        <section
            className="nutrition-overview"
            aria-label="Nutrition overview"
            onPointerLeave={() => setHovered(null)}
            onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget))
                    setFocused(null);
            }}
            onKeyDown={(event) => {
                if (event.key === 'Escape') {
                    setHovered(null);
                    setFocused(null);
                }
            }}
        >
            <div
                className="nutrition-overview-macros"
                role="group"
                aria-label="Calories and macronutrient amounts"
            >
                <div className="nutrition-overview-macro nutrition-overview-calories">
                    <span className="nutrition-overview-macro-label">
                        Calories
                    </span>
                    <span className="nutrition-overview-amount">
                        <strong>{Math.round(nutrition.calories)}</strong>
                        <span>kcal</span>
                    </span>
                </div>
                {macros.map(({ key, label }) => (
                    <button
                        type="button"
                        key={key}
                        className={`nutrition-overview-macro nutrition-overview-${key}`}
                        data-active={activeKey === key}
                        aria-label={`${label}: ${Math.round(nutrition[key])} grams`}
                        aria-describedby={
                            activeKey === key ? tooltipId : undefined
                        }
                        onPointerEnter={(event) => {
                            if (event.pointerType !== 'touch') setHovered(key);
                        }}
                        onFocus={() => setFocused(key)}
                        onClick={(event) => {
                            setFocused(key);
                            event.currentTarget.focus({ preventScroll: true });
                        }}
                    >
                        <span className="nutrition-overview-macro-label">
                            <span
                                className="nutrition-overview-dot"
                                aria-hidden="true"
                            />
                            {label}
                        </span>
                        <span className="nutrition-overview-amount">
                            <strong>{Math.round(nutrition[key])}</strong>
                            <span>g</span>
                        </span>
                    </button>
                ))}
            </div>

            <div className="nutrition-overview-chart">
                {active && (
                    <div
                        className="nutrition-overview-tooltip"
                        id={tooltipId}
                        role="tooltip"
                        style={{
                            left: `clamp(88px, ${center}%, calc(100% - 88px))`,
                        }}
                    >
                        <strong>{active.label}</strong>
                        <span>
                            {Math.round(percentages[active.key])}% of calories ·{' '}
                            {Math.round(
                                nutrition[active.key] * active.caloriesPerGram,
                            )}{' '}
                            kcal
                        </span>
                    </div>
                )}
                <div
                    className="nutrition-overview-bar"
                    data-has-active={activeKey !== null}
                    role="group"
                    aria-label="Macro calorie proportions"
                >
                    {macros
                        .filter(({ key }) => percentages[key] > 0)
                        .map(({ key, label }) => (
                            <button
                                type="button"
                                key={key}
                                className={`nutrition-overview-segment nutrition-overview-${key}`}
                                data-active={activeKey === key}
                                aria-pressed={focused === key}
                                style={{ width: `${percentages[key]}%` }}
                                aria-label={`${label}: ${Math.round(percentages[key])}% of macro calories`}
                                aria-describedby={
                                    activeKey === key ? tooltipId : undefined
                                }
                                onPointerEnter={(event) => {
                                    if (event.pointerType !== 'touch')
                                        setHovered(key);
                                }}
                                onFocus={() => setFocused(key)}
                                onClick={(event) => {
                                    setFocused(key);
                                    event.currentTarget.focus({
                                        preventScroll: true,
                                    });
                                }}
                            />
                        ))}
                </div>
            </div>
        </section>
    );
}
