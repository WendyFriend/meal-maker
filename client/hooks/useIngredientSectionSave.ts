import { useRef, useState } from 'react';

/** Shared save state and confirmation for editable meal ingredient sections. */
export function useIngredientSectionSave() {
    const [saving, setSaving] = useState(false);
    const [successId, setSuccessId] = useState<number | null>(null);
    const pending = useRef(false);
    const nextId = useRef(0);

    async function save(task: () => Promise<void>) {
        if (pending.current) return;
        pending.current = true;
        setSuccessId(null);
        setSaving(true);
        try {
            await task();
            setSuccessId(++nextId.current);
        } finally {
            pending.current = false;
            setSaving(false);
        }
    }

    return {
        saving,
        successId,
        save,
        dismiss: (id: number) =>
            setSuccessId((current) => (current === id ? null : current)),
    };
}

export type IngredientSectionFeedback = ReturnType<
    typeof useIngredientSectionSave
>;
