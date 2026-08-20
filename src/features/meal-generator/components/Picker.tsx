import './Picker.css';
type PickerProps = {
    value: React.ReactNode;
    onClick: () => void;
};

function Picker({ value, onClick }: PickerProps) {
    return (
        <button type="button" className="picker" onClick={onClick}>
            <span>{value}</span>
            <span className="picker-icon">⌄</span>
        </button>
    );
}

export default Picker;
