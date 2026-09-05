import './BottomSheet.css';

type BottomSheetProps = {
    isOpen: boolean;
    onClose: () => void;
    children: React.ReactNode;
};

function BottomSheet({ isOpen, onClose, children }: BottomSheetProps) {
    return (
        <div
            className={`bottom-sheet-backdrop ${isOpen ? 'open' : ''}`}
            onClick={onClose}
        >
            <div
                className="bottom-sheet"
                onClick={(event) => event.stopPropagation()}
            >
                {children}
            </div>
        </div>
    );
}

export default BottomSheet;
