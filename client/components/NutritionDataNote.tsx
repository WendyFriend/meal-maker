import './NutritionDataNote.css';

export const PARTIAL_NUTRITION_MESSAGE =
    'Based on ingredients with available nutrition data';

export default function NutritionDataNote({
    message = PARTIAL_NUTRITION_MESSAGE,
    className = '',
}: {
    message?: string;
    className?: string;
}) {
    return (
        <p className={`nutrition-data-note ${className}`.trim()}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 11v6" />
                <circle
                    className="nutrition-data-note-dot"
                    cx="12"
                    cy="7.5"
                    r=".8"
                />
            </svg>
            <span>{message}</span>
        </p>
    );
}
