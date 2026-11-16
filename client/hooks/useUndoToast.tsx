import { useCallback, useRef, useState } from 'react';
import ActionToast from '../components/ActionToast';
import { successToastColors } from '../components/actionToastColors';

export const UNDO_TOAST_MS = 5000;

type UndoToast = {
    key: number;
    message: string;
    onUndo: () => void;
    onExpire?: () => void;
};

/**
 * The shared "… removed · Undo" toast at the bottom of the screen. Showing a
 * new one replaces the last, so only the latest change can be undone.
 */
export function useUndoToast() {
    const [toast, setToast] = useState<UndoToast>();
    const nextKey = useRef(0);

    const show = useCallback(
        (message: string, onUndo: () => void, onExpire?: () => void) =>
            setToast({ key: ++nextKey.current, message, onUndo, onExpire }),
        [],
    );
    const dismiss = useCallback(() => setToast(undefined), []);

    const undoToast = toast ? (
        <ActionToast
            key={toast.key}
            message={toast.message}
            placement="floating"
            icon={null}
            colors={successToastColors}
            durationMs={UNDO_TOAST_MS}
            onClose={() => {
                setToast(undefined);
                toast.onExpire?.();
            }}
            action={{
                label: 'Undo',
                onClick: () => {
                    setToast(undefined);
                    toast.onUndo();
                },
            }}
        />
    ) : null;

    return { show, dismiss, undoToast };
}
