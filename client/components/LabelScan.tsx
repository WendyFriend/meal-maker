import type { LabelScanResult } from '../hooks/useLabelScan';
import type { ReactNode } from 'react';
import { ActionSheetIcon } from './ActionSheet';
import ActionToast from './ActionToast';
import { successToastColors } from './actionToastColors';
import IngredientCamera from './IngredientCamera';
import LoadingSpinner from './LoadingSpinner';
import './LabelScan.css';

/** Opens the label camera from a nutrition form. */
export function LabelScanButton({
    disabled = false,
    hidden = false,
    onClick,
}: {
    disabled?: boolean;
    /** Keeps its space, so nothing below moves. */
    hidden?: boolean;
    onClick: () => void;
}) {
    return (
        <div
            className="label-scan"
            inert={hidden}
            aria-hidden={hidden || undefined}
            data-hidden={hidden || undefined}
        >
            <button
                type="button"
                className="label-scan-button"
                disabled={disabled}
                onClick={onClick}
            >
                <ActionSheetIcon symbol="scan" />
                Scan nutrition label
            </button>
        </div>
    );
}

/** The camera, set up for photographing a nutrition label to fill a form. */
export function LabelScanCamera({
    backLabel,
    onClose,
    onPhoto,
}: {
    backLabel: string;
    onClose: () => void;
    onPhoto: (photo: string) => void;
}) {
    return (
        <IngredientCamera
            mode="label"
            backLabel={backLabel}
            continueLabel="Use photo"
            note="We’ll fill in the values from the label for you to check."
            onClose={onClose}
            onContinue={onPhoto}
        />
    );
}

/** Covers the numbers while a label is read. */
export function LabelScanReading() {
    return (
        <div className="label-scan-reading" role="status" aria-live="polite">
            <LoadingSpinner size="large" />
            <span>Reading label…</span>
        </div>
    );
}

/** Covers the numbers when a label couldn't be read, with ways forward. */
export function LabelScanFailed({
    message,
    children,
}: {
    message: string;
    children: ReactNode;
}) {
    return (
        <div className="label-scan-failed">
            <p role="alert">{message}</p>
            {children}
        </div>
    );
}

/** Confirms a label scan, with Nutrition Lab's first warning to check. */
export function LabelScanToast({
    result,
    placement,
    onClose,
}: {
    result: LabelScanResult;
    placement?: 'inline' | 'floating';
    onClose: () => void;
}) {
    return (
        <ActionToast
            placement={placement}
            message="Label Scanned."
            detail={result.warnings[0]}
            colors={successToastColors}
            durationMs={result.warnings.length ? 6000 : 2400}
            onClose={onClose}
        />
    );
}
