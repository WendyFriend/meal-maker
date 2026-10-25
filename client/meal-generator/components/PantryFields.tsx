import { useId } from 'react';
import { pantryUnits, type PantryInputs } from '../../utils/pantry';
import './PantryFields.css';

type PantryFieldsProps = {
    values: PantryInputs;
    onChange: (values: PantryInputs) => void;
};

/* Optional "On hand" inputs shared by Add Ingredient and the edit dialog. */
export function PantryFields({ values, onChange }: PantryFieldsProps) {
    const id = useId();

    return (
        <div className="pantry-fields">
            <div className="pantry-field pantry-field-quantity">
                <label htmlFor={`${id}-quantity`}>Quantity</label>
                <div className="pantry-quantity-row">
                    <div className="input-underline">
                        <input
                            id={`${id}-quantity`}
                            type="number"
                            className="line-input"
                            min="0"
                            step="any"
                            inputMode="decimal"
                            value={values.quantity}
                            placeholder="0"
                            onChange={(event) =>
                                onChange({
                                    ...values,
                                    quantity: event.target.value,
                                })
                            }
                        />
                    </div>
                    <select
                        className="pantry-unit"
                        aria-label="Unit"
                        value={values.unit}
                        onChange={(event) =>
                            onChange({ ...values, unit: event.target.value })
                        }
                    >
                        {pantryUnits.map((unit) => (
                            <option key={unit} value={unit}>
                                {unit}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="pantry-field pantry-field-expiry">
                <label htmlFor={`${id}-expires`}>Expires on</label>
                <div className="pantry-expiry-row">
                    <div className="input-underline">
                        <input
                            id={`${id}-expires`}
                            type="date"
                            className="line-input"
                            value={values.expiresOn}
                            onChange={(event) =>
                                onChange({
                                    ...values,
                                    expiresOn: event.target.value,
                                })
                            }
                        />
                    </div>
                    {values.expiresOn && (
                        <button
                            type="button"
                            className="pantry-clear"
                            onClick={() =>
                                onChange({ ...values, expiresOn: '' })
                            }
                        >
                            Clear
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
