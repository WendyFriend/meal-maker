import './PrepNotes.css';
import type {
    PrepConsideration,
    PrepSeverity,
} from '../../../shared/nutrition/prepGuidance';

type PrepNotesProps = {
    considerations: PrepConsideration[];
    heading: string;
    // One line under the heading.
    description?: string;
};

const SEVERITY_ORDER: PrepSeverity[] = ['required', 'recommended', 'tip'];

const SEVERITY_LABELS: Record<PrepSeverity, string> = {
    required: 'Must',
    recommended: 'Recommended',
    tip: 'Tip',
};

// "Spinach", "Spinach and Rice", "Spinach, Rice and Beans"
function formatList(items: string[]) {
    return items.length <= 1
        ? (items[0] ?? '')
        : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/*
 * Anti-nutrient and food-safety guidance for the chosen ingredients, most
 * important first. "Must" notes start expanded; hidden when there are none.
 */
function PrepNotes({ considerations, heading, description }: PrepNotesProps) {
    if (considerations.length === 0) return null;

    const sorted = [...considerations].sort(
        (a, b) =>
            SEVERITY_ORDER.indexOf(a.severity) -
            SEVERITY_ORDER.indexOf(b.severity),
    );

    return (
        <section className="prep-notes" aria-label={heading}>
            <div className="prep-notes-header">
                <h3>{heading}</h3>
                {description && <p>{description}</p>}
            </div>

            <ul className="prep-notes-list">
                {sorted.map((consideration) => (
                    <li key={consideration.id}>
                        <details
                            className={`prep-note prep-note-${consideration.severity}`}
                            open={consideration.severity === 'required'}
                        >
                            <summary>
                                <span className="prep-note-badge">
                                    {SEVERITY_LABELS[consideration.severity]}
                                </span>
                                <span className="prep-note-heading">
                                    <span className="prep-note-title">
                                        {consideration.title}
                                    </span>
                                    <span className="prep-note-ingredients">
                                        {formatList(consideration.ingredients)}
                                    </span>
                                </span>
                            </summary>

                            <div className="prep-note-body">
                                <p>{consideration.summary}</p>

                                {consideration.steps.length > 0 && (
                                    <ol className="prep-note-steps">
                                        {consideration.steps.map((step) => (
                                            <li key={step}>{step}</li>
                                        ))}
                                    </ol>
                                )}

                                {consideration.compounds.length > 0 && (
                                    <p className="prep-note-compounds">
                                        {consideration.compounds.join(' · ')}
                                    </p>
                                )}
                            </div>
                        </details>
                    </li>
                ))}
            </ul>
        </section>
    );
}

export default PrepNotes;
