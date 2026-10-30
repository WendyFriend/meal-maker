import type { MealGenerator } from '../shared/types/types';
import './Settings.css';

const options: { id: MealGenerator; label: string; description: string }[] = [
    {
        id: 'ollama',
        label: 'Ollama',
        description: 'Uses USDA nutrition data and Ollama to create your meal.',
    },
    {
        id: 'nutrition-lab',
        label: 'Nutrition Lab',
        description:
            'Uses the Nutrition Lab API for nutrition data and meal generation.',
    },
];

export default function Settings({
    mealGenerator,
    onMealGeneratorChange,
}: {
    mealGenerator: MealGenerator;
    onMealGeneratorChange: (generator: MealGenerator) => void;
}) {
    return (
        <section
            className="settings saved-collection"
            aria-labelledby="settings-heading"
        >
            <header className="saved-collection-intro">
                <div className="saved-collection-title">
                    <h1 id="settings-heading">Settings</h1>
                </div>
                <p>Choices are saved on this device.</p>
            </header>
            <fieldset className="settings-group">
                <legend>Meal generation</legend>
                {options.map(({ id, label, description }) => (
                    <label
                        key={id}
                        className={`settings-option${mealGenerator === id ? ' settings-option-selected' : ''}`}
                    >
                        <input
                            type="radio"
                            name="meal-generator"
                            value={id}
                            checked={mealGenerator === id}
                            onChange={() => onMealGeneratorChange(id)}
                        />
                        <span className="settings-option-text">
                            <span className="settings-option-label">
                                {label}
                            </span>
                            <span className="settings-option-description">
                                {description}
                            </span>
                        </span>
                    </label>
                ))}
            </fieldset>
        </section>
    );
}
