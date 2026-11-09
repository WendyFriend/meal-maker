import { useId } from 'react';
import ResetIcon from '../../components/ResetIcon';
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
    editor,
}: {
    editor?: InstructionEditor;
    instructions: string[];
}) {
    const editorId = useId();
    const cooking = instructions
        .map((instruction) =>
            instruction
                .trim()
                .replace(/^(?:prepare|preparation|cook(?:ing)?):\s*/i, ''),
        )
        .filter(Boolean);

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
            ) : cooking.length > 0 ? (
                <div className="meal-instruction-group">
                    <h4>Cook & serve</h4>
                    <ol>
                        {cooking.map((step, index) => (
                            <li key={index}>{step}</li>
                        ))}
                    </ol>
                </div>
            ) : (
                <p className="meal-instructions-empty">No steps added.</p>
            )}
        </section>
    );
}
