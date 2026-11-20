import type { RefObject } from 'react';
import {
    ActionSheetIcon,
    type ActionSheetSymbol,
} from '../../components/ActionSheet';
import Popover from '../../components/Popover';
import './NutritionFixMenu.css';

export type NutritionFix = 'food' | 'label' | 'photo' | 'values';

const fixes: { id: NutritionFix; label: string; symbol: ActionSheetSymbol }[] =
    [
        { id: 'food', label: 'Search from database', symbol: 'search' },
        { id: 'label', label: 'Scan nutrition label', symbol: 'scan' },
        { id: 'photo', label: 'Take a photo', symbol: 'camera' },
        { id: 'values', label: 'Correct the numbers', symbol: 'edit' },
    ];

const variants = {
    // A small ? after the ingredient name, for a wrong food match.
    icon: {
        className: 'nutrition-fix-icon',
        label: 'Doesn’t look right?',
        caption: 'Doesn’t look right?',
    },
    // A text link under Vitamins & minerals, for wrong numbers.
    link: {
        className: 'nutrition-fix-link',
        label: undefined,
        caption: undefined,
    },
} as const;

/** The fixes as a list of choices, in the menu or a failed scan's panel. */
export function NutritionFixOptions({
    only,
    disabled = false,
    onChoose,
}: {
    /** A subset of the fixes, in their usual order. */
    only?: readonly NutritionFix[];
    disabled?: boolean;
    onChoose: (fix: NutritionFix) => void;
}) {
    return (
        <ul className="nutrition-fix-options">
            {fixes
                .filter(({ id }) => !only || only.includes(id))
                .map(({ id, label, symbol }) => (
                    <li key={id}>
                        <button
                            type="button"
                            disabled={disabled}
                            onClick={() => onChoose(id)}
                        >
                            <ActionSheetIcon symbol={symbol} />
                            {label}
                        </button>
                    </li>
                ))}
        </ul>
    );
}

function QuestionIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M9.6 9.3a2.5 2.5 0 0 1 4.9.7c0 1.7-2.5 2.2-2.5 3.8" />
            <circle cx="12" cy="17" r=".9" className="nutrition-fix-dot" />
        </svg>
    );
}

/**
 * The "Doesn't look right?" menu: fix the food match, scan a label, take a
 * photo, or correct the numbers. Tapping elsewhere closes it.
 */
export default function NutritionFixMenu({
    variant,
    hidden = false,
    disabled = false,
    triggerRef,
    onChoose,
}: {
    variant: keyof typeof variants;
    /** Keeps the trigger's space without showing it, so nothing moves. */
    hidden?: boolean;
    disabled?: boolean;
    triggerRef?: RefObject<HTMLButtonElement | null>;
    onChoose: (fix: NutritionFix) => void;
}) {
    const { className, label, caption } = variants[variant];
    const trigger =
        variant === 'icon' ? <QuestionIcon /> : 'The numbers don’t look right?';
    if (hidden)
        return (
            <span
                className={`${className} nutrition-fix-placeholder`}
                aria-hidden="true"
            >
                {trigger}
            </span>
        );
    return (
        <Popover
            trigger={trigger}
            triggerClassName={className}
            triggerLabel={label}
            triggerTitle={label}
            triggerRef={triggerRef}
            label="Fix this ingredient"
            panelClassName="nutrition-fix-menu"
            width={264}
            maxHeight={360}
        >
            {(close) => (
                <>
                    {caption && (
                        <p className="nutrition-fix-menu-caption">{caption}</p>
                    )}
                    <NutritionFixOptions
                        disabled={disabled}
                        onChoose={(fix) => {
                            close();
                            onChoose(fix);
                        }}
                    />
                </>
            )}
        </Popover>
    );
}
