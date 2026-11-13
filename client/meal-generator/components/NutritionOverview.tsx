import { useId, useState } from 'react';
import { PARTIAL_NUTRITION_MESSAGE } from '../../components/NutritionDataNote';
import NutritionInfo from './NutritionInfo';
import './NutritionOverview.css';

type MacroKey = 'carbohydrate' | 'protein' | 'fat';
type NutrientKey = MacroKey | 'fiber';
type NutritionOverviewProps = {
    nutrition: Record<MacroKey | 'calories', number>;
    fiber: {
        grams: number;
        available: boolean;
        hasKnown: boolean;
        incomplete: boolean;
    };
    percentages: Record<MacroKey, number>;
    incomplete?: boolean;
    partial?: boolean;
    showPartialInfo?: boolean;
    showChart?: boolean;
    ariaLabel?: string;
    className?: string;
};

const macros = [
    { key: 'carbohydrate', label: 'Carbs', caloriesPerGram: 4 },
    { key: 'protein', label: 'Protein', caloriesPerGram: 4 },
    { key: 'fat', label: 'Fat', caloriesPerGram: 9 },
] as const;

export default function NutritionOverview({
    nutrition,
    fiber,
    percentages,
    incomplete = false,
    partial = false,
    showPartialInfo = true,
    showChart = true,
    ariaLabel = 'Nutrition overview',
    className = '',
}: NutritionOverviewProps) {
    const [hovered, setHovered] = useState<NutrientKey | null>(null);
    const [focused, setFocused] = useState<NutrientKey | null>(null);
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

    const showMacroValues = !incomplete || partial;
    const showFiberValue = fiber.available || fiber.hasKnown;
    const showInfo =
        showPartialInfo && (partial || (fiber.incomplete && fiber.hasKnown));

    if (!showMacroValues && !showFiberValue)
        return (
            <section
                className={`nutrition-overview nutrition-overview-unavailable ${className}`.trim()}
                role={ariaLabel === 'Nutrition overview' ? undefined : 'group'}
                aria-label={ariaLabel}
            >
                <p>Nutrition unavailable for some ingredients.</p>
            </section>
        );

    return (
        <section
            className={`nutrition-overview ${className}`.trim()}
            data-has-info={showInfo}
            role={ariaLabel === 'Nutrition overview' ? undefined : 'group'}
            aria-label={ariaLabel}
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
            {showInfo && (
                <NutritionInfo
                    label="About nutrition data"
                    triggerClassName="nutrition-info-button nutrition-overview-info"
                >
                    <p className="ingredient-details-note">
                        {PARTIAL_NUTRITION_MESSAGE}
                    </p>
                </NutritionInfo>
            )}
            <div
                className="nutrition-overview-macros"
                role="group"
                aria-label="Calories and nutrient amounts"
            >
                <div
                    className="nutrition-overview-macro nutrition-overview-calories"
                    role="group"
                    aria-label="Total calories"
                >
                    <span className="nutrition-overview-amount">
                        <strong>
                            {showMacroValues
                                ? Math.round(nutrition.calories)
                                : '—'}
                        </strong>
                        {showMacroValues && <span>kcal</span>}
                    </span>
                </div>
                <div className="nutrition-overview-detail">
                    <div className="nutrition-overview-nutrients">
                        {macros.map(({ key, label }) =>
                            showChart && showMacroValues ? (
                                <button
                                    type="button"
                                    key={key}
                                    className={`nutrition-overview-macro nutrition-overview-${key}`}
                                    data-active={activeKey === key}
                                    aria-label={`${label}: ${Math.round(nutrition[key])} grams`}
                                    aria-describedby={
                                        activeKey === key
                                            ? tooltipId
                                            : undefined
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
                                >
                                    <span className="nutrition-overview-macro-label">
                                        <span
                                            className="nutrition-overview-dot"
                                            aria-hidden="true"
                                        />
                                        {label}
                                    </span>
                                    <span className="nutrition-overview-amount">
                                        <strong>
                                            {showMacroValues
                                                ? Math.round(nutrition[key])
                                                : '—'}
                                        </strong>
                                        {showMacroValues && <span>g</span>}
                                    </span>
                                </button>
                            ) : (
                                <div
                                    key={key}
                                    className={`nutrition-overview-macro nutrition-overview-${key}`}
                                >
                                    <span className="nutrition-overview-macro-label">
                                        <span
                                            className="nutrition-overview-dot"
                                            aria-hidden="true"
                                        />
                                        {label}
                                    </span>
                                    <span className="nutrition-overview-amount">
                                        <strong>
                                            {showMacroValues
                                                ? Math.round(nutrition[key])
                                                : '—'}
                                        </strong>
                                        {showMacroValues && <span>g</span>}
                                    </span>
                                </div>
                            ),
                        )}
                        <button
                            type="button"
                            className="nutrition-overview-macro nutrition-overview-fiber"
                            data-active={activeKey === 'fiber'}
                            aria-pressed={focused === 'fiber'}
                            aria-label={`Fibre: ${showFiberValue ? Number(fiber.grams.toFixed(1)) + ' grams' : 'unavailable'}`}
                            onPointerEnter={(event) => {
                                if (event.pointerType !== 'touch')
                                    setHovered('fiber');
                            }}
                            onFocus={() => setFocused('fiber')}
                            onClick={(event) => {
                                setFocused('fiber');
                                event.currentTarget.focus({
                                    preventScroll: true,
                                });
                            }}
                        >
                            <span className="nutrition-overview-macro-label">
                                <span
                                    className="nutrition-overview-dot"
                                    aria-hidden="true"
                                />
                                Fibre
                            </span>
                            <span className="nutrition-overview-amount">
                                <strong>
                                    {showFiberValue
                                        ? Number(fiber.grams.toFixed(1))
                                        : '—'}
                                </strong>
                                {showFiberValue && <span>g</span>}
                            </span>
                        </button>
                    </div>
                </div>

                {showChart && showMacroValues && (
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
                                    {Math.round(percentages[active.key])}% of
                                    calories ·{' '}
                                    {Math.round(
                                        nutrition[active.key] *
                                            active.caloriesPerGram,
                                    )}{' '}
                                    kcal
                                </span>
                            </div>
                        )}
                        <div
                            className="nutrition-overview-bar"
                            data-has-active={active !== undefined}
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
                                        style={{
                                            width: `${percentages[key]}%`,
                                        }}
                                        aria-label={`${label}: ${Math.round(percentages[key])}% of macro calories`}
                                        aria-describedby={
                                            activeKey === key
                                                ? tooltipId
                                                : undefined
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
                )}
            </div>
        </section>
    );
}
