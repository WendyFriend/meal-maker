import { useCallback, useEffect, useRef, useState } from 'react';
import type { NutritionLabelScan } from '../../shared/types/types';
import { scanNutritionLabel } from '../services/nutritionPhotoService';

/** A successful scan, for its confirmation. */
export type LabelScanResult = { id: number; warnings: string[] };

/**
 * Reads a nutrition label photo and hands its per-100g values to `onFill`
 * for review; `onError` gets a message to show. A newer scan, `reset` or
 * unmounting ignores a late reply.
 */
export function useLabelScan({
    onFill,
    onError,
}: {
    onFill: (nutrition: NutritionLabelScan['nutrition']) => void;
    onError: (message: string) => void;
}) {
    const [reading, setReading] = useState(false);
    const [result, setResult] = useState<LabelScanResult>();
    const request = useRef(0);
    const callbacks = useRef({ onFill, onError });
    useEffect(() => {
        callbacks.current = { onFill, onError };
    });
    // StrictMode remounts, so track mounting rather than invalidating.
    const mounted = useRef(false);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    const read = useCallback(async (photo: string, name?: string) => {
        const current = ++request.current;
        setReading(true);
        setResult(undefined);
        try {
            const { nutrition, warnings } = await scanNutritionLabel(
                photo,
                name,
            );
            if (!mounted.current || current !== request.current) return;
            callbacks.current.onFill(nutrition);
            setResult({ id: current, warnings: warnings ?? [] });
        } catch (error) {
            if (!mounted.current || current !== request.current) return;
            callbacks.current.onError(
                error instanceof Error && error.message
                    ? error.message
                    : 'Could not read the label. Please try again.',
            );
        } finally {
            if (mounted.current && current === request.current)
                setReading(false);
        }
    }, []);

    /** Ignores a scan in progress. The last confirmation stays. */
    const reset = useCallback(() => {
        request.current++;
        setReading(false);
    }, []);

    const dismissResult = useCallback(() => setResult(undefined), []);

    return { reading, result, read, reset, dismissResult };
}
