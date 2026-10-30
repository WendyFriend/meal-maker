import { useId } from 'react';
import ResetIcon from '../../components/ResetIcon';
import type { MealIngredient } from '../../../shared/types/types';
import { getIngredientPreparation } from '../../../shared/ingredientPreparation';
import './MealInstructions.css';

export type InstructionEditor = {
    editing: boolean;
    canReset: boolean;
    onReset: () => void;
    disabled?: boolean;
    onChange: (value: string) => void;
};

export default function MealInstructions({
    instructions,
    ingredients,
    editor,
}: {
    editor?: InstructionEditor;
    instructions: string[];
    ingredients: MealIngredient[];
}) {
    const editorId = useId();
    const preparation: string[] = [];
    const cooking: string[] = [];
    for (const instruction of instructions) {
        const text = instruction.trim();
        if (!text) continue;
        if (/^(prepare|preparation):\s*/i.test(text)) {
            preparation.push(text.replace(/^(prepare|preparation):\s*/i, ''));
        } else {
            cooking.push(text.replace(/^cook(?:ing)?:\s*/i, ''));
        }
    }
    const guides = preparation.length
        ? []
        : ingredients
              .filter(({ weight }) => weight > 0)
              .map(({ name, preparationTips }) => ({
                  name,
                  custom: preparationTips !== undefined,
                  ...getIngredientPreparation(name, preparationTips),
              }))
              .filter(
                  ({ source, custom, tips }) =>
                      (source || custom) && tips.length > 0,
              );

    return (
        <section className="meal-instructions" aria-label="Instructions">
            <div className="meal-section-header">
                <h3>Instructions</h3>
                {editor?.canReset && (
                    <button
                        type="button"
                        className="meal-reset-button"
                        onClick={editor.onReset}
                        aria-label="Reset instructions"
                        title="Reset instructions"
                        disabled={editor.disabled}
                    >
                        <ResetIcon />
                    </button>
                )}
            </div>
            {editor?.editing ? (
                <div>
                    <label
                        className="meal-instructions-edit-label"
                        htmlFor={editorId}
                    >
                        One step per line
                    </label>
                    <textarea
                        id={editorId}
                        className="meal-instructions-editor"
                        aria-label="Instructions"
                        rows={10}
                        value={instructions.join('\n')}
                        onChange={(event) =>
                            editor.onChange(event.target.value)
                        }
                        disabled={editor.disabled}
                    />
                </div>
            ) : (
                <>
                    {(preparation.length > 0 || guides.length > 0) && (
                        <div className="meal-instruction-group">
                            <h4>Prepare your ingredients</h4>
                            {preparation.length > 0 ? (
                                <ol>
                                    {preparation.map((step, index) => (
                                        <li key={index}>{step}</li>
                                    ))}
                                </ol>
                            ) : (
                                <div className="meal-preparation-guides">
                                    {guides.map(
                                        (
                                            { name, title, tips, source },
                                            index,
                                        ) => (
                                            <div
                                                className="meal-preparation-guide"
                                                key={`${name}-${index}`}
                                            >
                                                <h5>{name}</h5>
                                                <p>{title}</p>
                                                <ul>
                                                    {tips.map((tip) => (
                                                        <li key={tip}>{tip}</li>
                                                    ))}
                                                </ul>
                                                {source && (
                                                    <a
                                                        href={source.url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                    >
                                                        {source.label} ↗
                                                    </a>
                                                )}
                                            </div>
                                        ),
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                    {cooking.length > 0 && (
                        <div className="meal-instruction-group">
                            <h4>Cook & serve</h4>
                            <ol>
                                {cooking.map((step, index) => (
                                    <li key={index}>{step}</li>
                                ))}
                            </ol>
                        </div>
                    )}
                </>
            )}
        </section>
    );
}
