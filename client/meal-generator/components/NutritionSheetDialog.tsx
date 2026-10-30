import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useModalDialog } from '../../hooks/useModalDialog';
import './IngredientNutritionSheet.css';

export default function NutritionSheetDialog({
    children,
    onClose,
    labelledBy,
    label,
}: {
    children: ReactNode;
    onClose: () => void;
    labelledBy?: string;
    label?: string;
}) {
    const panelRef = useModalDialog();
    return createPortal(
        <dialog
            ref={panelRef}
            aria-labelledby={labelledBy}
            aria-label={label}
            tabIndex={-1}
            className="ingredient-nutrition-sheet"
            onCancel={(event) => {
                event.preventDefault();
                onClose();
            }}
            onClick={(event) => {
                if (event.target !== event.currentTarget) return;
                const bounds = event.currentTarget.getBoundingClientRect();
                if (
                    event.clientX < bounds.left ||
                    event.clientX > bounds.right ||
                    event.clientY < bounds.top ||
                    event.clientY > bounds.bottom
                )
                    onClose();
            }}
        >
            {children}
        </dialog>,
        document.body,
    );
}
