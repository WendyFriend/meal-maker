import { useState } from 'react';

type TotalCaloriesProps = {
    value: number;
    enabled: boolean;
    onEnabledChange: (enabled: boolean) => void;
    onValueChange: (value: number) => void;
};

function TotalCalories({
    enabled,
    value,
    onEnabledChange,
    onValueChange,
}: TotalCaloriesProps) {
    const [input, setInput] = useState<string>(String(value));

    function handleToggle(event: React.ChangeEvent<HTMLInputElement>) {
        console.log('handleToggle');
        onEnabledChange(event.target.checked);
    }

    function handleValueChange() {
        console.log('handleValueChange');
        const numericValue = Number(input);

        if (numericValue > 0) {
            onValueChange(numericValue);
        } else {
            // if the user enters an invalid value, restore the last valid value
            setInput(String(value));
        }
    }

    function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
        const numericValue = event.target.value.replace(/[^0-9]/g, '');
        setInput(numericValue);
    }

    return (
        <div className="total-calories">
            <div className="total-calories-control">
                <input
                    className="total-calories-checkbox"
                    type="checkbox"
                    checked={enabled}
                    onChange={handleToggle}
                />

                <input
                    className="total-calories-input"
                    type="text"
                    value={input}
                    onChange={handleInputChange}
                    onBlur={handleValueChange}
                    disabled={!enabled}
                />

                <span>kcal</span>
            </div>
        </div>
    );
}

export default TotalCalories;
