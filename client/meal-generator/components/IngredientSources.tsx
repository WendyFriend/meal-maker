import { useId, useState } from 'react';
import './IngredientSources.css';
import { normalizeIngredientName } from '../../utils/Ingredient';
import { AI_ESTIMATE, type IngredientSource } from './ingredientMatching';

type IngredientSourcesProps = {
    ingredients: string[];
    // By normalized ingredient name.
    sources: Record<string, IngredientSource>;
    // `optionIndex` is AI_ESTIMATE to let the AI estimate instead.
    onSelect: (ingredient: string, optionIndex: number) => void;
};

function summarize(sources: IngredientSource[]): string {
    const count = (kind: IngredientSource['kind']) =>
        sources.filter((source) => source.kind === kind).length;
    const parts = [
        [count('usda'), 'from our database'],
        [count('yours') + count('edited'), 'yours'],
        [count('estimate'), 'estimated'],
    ]
        .filter(([total]) => total !== 0)
        .map(([total, label]) => `${total} ${label}`);

    return parts.join(' · ');
}

function describe(source: IngredientSource) {
    switch (source.kind) {
        case 'matching':
            return <span className="inline-loading">Finding a match…</span>;
        case 'usda':
            return (
                <span className="source-description">{source.description}</span>
            );
        case 'yours':
            return <span className="source-description">Your nutrition</span>;
        case 'edited':
            return (
                <span className="source-description">
                    Your edits for this meal
                </span>
            );
        default:
            return (
                <span className="source-description source-description-muted">
                    {source.options?.length
                        ? 'No close match, the AI will estimate'
                        : 'The AI will estimate'}
                </span>
            );
    }
}

/*
 * "Nutrition data" under the ingredient chips: for each ingredient, where its
 * nutrition comes from (the user's own, or the closest USDA food) and, for
 * USDA matches, a way to pick a different food or hand it to the AI.
 */
function IngredientSources({
    ingredients,
    sources,
    onSelect,
}: IngredientSourcesProps) {
    // Open on desktop; phones keep the form short and open it on demand.
    const [isOpen, setIsOpen] = useState(
        () => !window.matchMedia?.('(max-width: 640px)').matches,
    );
    const [changing, setChanging] = useState<string | null>(null);
    const panelId = useId();

    const rows = ingredients.flatMap((name) => {
        const source = sources[normalizeIngredientName(name)];

        return source ? [{ name, source }] : [];
    });

    if (rows.length === 0) return null;

    const summary = summarize(rows.map(({ source }) => source));
    const isMatching = rows.some(({ source }) => source.kind === 'matching');

    return (
        <section className="ingredient-sources" aria-label="Nutrition data">
            <button
                type="button"
                className="ingredient-sources-toggle"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setIsOpen((current) => !current)}
            >
                <span className="ingredient-sources-title">Nutrition data</span>
                <span className="ingredient-sources-summary">
                    {isMatching ? (
                        <span className="inline-loading">Matching…</span>
                    ) : (
                        summary
                    )}
                </span>
                <span
                    className="ingredient-sources-chevron"
                    aria-hidden="true"
                />
            </button>

            {isOpen && (
                <ul className="ingredient-sources-list" id={panelId}>
                    {rows.map(({ name, source }) => {
                        const options = source.options ?? [];
                        const canChange = options.length > 0;
                        const isChanging = changing === name;

                        return (
                            <li className="ingredient-source" key={name}>
                                <p className="ingredient-source-line">
                                    <strong>{name}</strong>
                                    <span aria-hidden="true"> → </span>
                                    <span className="visually-hidden">
                                        uses
                                    </span>
                                    {describe(source)}
                                </p>

                                {source.kind !== 'matching' &&
                                    source.caloriesPer100g !== undefined && (
                                        <p className="ingredient-source-meta">
                                            {Math.round(source.caloriesPer100g)}{' '}
                                            kcal/100 g
                                        </p>
                                    )}

                                {canChange && (
                                    <button
                                        type="button"
                                        className="ingredient-source-change"
                                        aria-expanded={isChanging}
                                        aria-label={`Change nutrition source for ${name}`}
                                        onClick={() =>
                                            setChanging(
                                                isChanging ? null : name,
                                            )
                                        }
                                    >
                                        {isChanging ? 'Done' : 'Change'}
                                    </button>
                                )}

                                {source.kind === 'usda' &&
                                    source.confidence === 'low' && (
                                        <p
                                            className="ingredient-source-warning"
                                            role="note"
                                        >
                                            Loose match. Check this is the right
                                            food, or pick another.
                                        </p>
                                    )}

                                {isChanging && (
                                    <div
                                        className="ingredient-source-options"
                                        role="radiogroup"
                                        aria-label={`Nutrition source for ${name}`}
                                    >
                                        {options.map((option, index) => (
                                            <label
                                                key={`${option.description}-${index}`}
                                                className="ingredient-source-option"
                                            >
                                                <input
                                                    type="radio"
                                                    name={`${panelId}-${name}`}
                                                    checked={
                                                        source.selected ===
                                                        index
                                                    }
                                                    onChange={() => {
                                                        onSelect(name, index);
                                                        setChanging(null);
                                                    }}
                                                />
                                                <span className="ingredient-source-option-text">
                                                    {option.description}
                                                </span>
                                                <span className="ingredient-source-option-kcal">
                                                    {Math.round(
                                                        option.caloriesPer100g,
                                                    )}{' '}
                                                    kcal
                                                </span>
                                            </label>
                                        ))}

                                        <label className="ingredient-source-option">
                                            <input
                                                type="radio"
                                                name={`${panelId}-${name}`}
                                                checked={
                                                    source.selected ===
                                                    AI_ESTIMATE
                                                }
                                                onChange={() => {
                                                    onSelect(name, AI_ESTIMATE);
                                                    setChanging(null);
                                                }}
                                            />
                                            <span className="ingredient-source-option-text">
                                                Let AI estimate
                                            </span>
                                        </label>
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}

export default IngredientSources;
