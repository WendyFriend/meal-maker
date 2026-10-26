import './BottomSheet.css';

type BottomSheetProps = {
    isOpen: boolean;
    onClose: () => void;
    children: React.ReactNode;
    className?: string;
};

function BottomSheet({
    isOpen,
    onClose,
    children,
    className = '',
}: BottomSheetProps) {
    return (
        <div
            className={`bottom-sheet-backdrop ${isOpen ? 'open' : ''}`}
            inert={!isOpen}
            onClick={onClose}
        >
            <div
                className={`bottom-sheet ${className}`}
                onClick={(event) => event.stopPropagation()}
            >
                {children}
            </div>
        </div>
    );
}

export default BottomSheet;
