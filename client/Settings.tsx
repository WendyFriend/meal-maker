import {
    QUICK_ADD_LAYOUTS,
    useQuickAddLayout,
} from './settings/quickAddLayout';
import './Settings.css';

export default function Settings() {
    const [quickAddLayout, setQuickAddLayout] = useQuickAddLayout();
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
                <legend>Quick Add options</legend>
                {QUICK_ADD_LAYOUTS.map((layout) => (
                    <label
                        key={layout}
                        className={`settings-option${quickAddLayout === layout ? ' settings-option-selected' : ''}`}
                    >
                        <input
                            type="radio"
                            name="quick-add-layout"
                            value={layout}
                            checked={quickAddLayout === layout}
                            onChange={() => setQuickAddLayout(layout)}
                        />
                        <span className="settings-option-text">
                            <span className="settings-option-label">
                                {layout === 'tiles' ? 'Tiles' : 'Rows'}
                            </span>
                            <span className="settings-option-description">
                                {layout === 'tiles'
                                    ? 'Image-forward buttons arranged in a compact grid.'
                                    : 'Larger full-width options with images and labels.'}
                            </span>
                        </span>
                    </label>
                ))}
            </fieldset>
        </section>
    );
}
