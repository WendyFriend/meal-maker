import {
    useRef,
    type AnimationEvent,
    type CSSProperties,
    type PointerEvent,
    type ReactNode,
    type Ref,
} from 'react';
import { SelectionIndicator } from './CollectionSelection';

/**
 * One row of My Ingredients or My Recipes: a picture, the name and an
 * optional detail line, then a chevron (or the selection check). Long press
 * selects, and right-click or the menu key opens the row's menu. `action`
 * (e.g. Add to My Diary) replaces the chevron beside the row. While selecting,
 * the check takes the chevron's or action's place, so nothing reflows.
 */
export default function SavedCollectionRow({
    rowRef,
    className = '',
    style,
    onAnimationEnd,
    id,
    name,
    detail,
    media,
    action,
    selecting,
    selected,
    disabled,
    onPressStart,
    onPressMove,
    onPressEnd,
    onActivate,
    onKeyActivate,
    onMenu,
}: {
    rowRef?: Ref<HTMLDivElement>;
    className?: string;
    style?: CSSProperties;
    onAnimationEnd?: (event: AnimationEvent<HTMLDivElement>) => void;
    id?: string;
    name: string;
    detail?: ReactNode;
    media: ReactNode;
    action?: ReactNode;
    selecting: boolean;
    selected: boolean;
    disabled?: boolean;
    onPressStart: (event: PointerEvent<HTMLButtonElement>) => void;
    onPressMove: (event: PointerEvent<HTMLButtonElement>) => void;
    onPressEnd: () => void;
    onActivate: () => void;
    /** Enter or Space, so a keyboard press is never mistaken for a hold. */
    onKeyActivate: () => void;
    onMenu: (trigger: HTMLButtonElement, x: number, y: number) => void;
}) {
    const lastPointerType = useRef<string | null>(null);
    const hasAction = Boolean(action);

    return (
        <div
            ref={rowRef}
            className={`saved-collection-row-wrapper${hasAction ? ' saved-collection-row-wrapper-with-action' : ''}${selected ? ' saved-collection-row-wrapper-selected' : ''} ${className}`.trimEnd()}
            style={style}
            onAnimationEnd={onAnimationEnd}
            onPointerDownCapture={(event) => {
                lastPointerType.current = event.pointerType;
            }}
            onContextMenu={(event) => {
                event.preventDefault();
                // Touch long press selects instead.
                if (lastPointerType.current === 'touch') return;
                const trigger =
                    event.currentTarget.querySelector<HTMLButtonElement>(
                        '.saved-collection-row',
                    );
                if (trigger) onMenu(trigger, event.clientX, event.clientY);
            }}
        >
            <button
                type="button"
                className="saved-collection-row"
                id={id}
                aria-pressed={selecting ? selected : undefined}
                aria-label={
                    selecting
                        ? `${selected ? 'Deselect' : 'Select'} ${name}`
                        : undefined
                }
                disabled={disabled}
                onPointerDown={onPressStart}
                onPointerMove={onPressMove}
                onPointerUp={onPressEnd}
                onPointerCancel={onPressEnd}
                onPointerLeave={onPressEnd}
                onKeyDown={(event) => {
                    if (
                        event.key === 'ContextMenu' ||
                        (event.shiftKey && event.key === 'F10')
                    ) {
                        event.preventDefault();
                        const rect =
                            event.currentTarget.getBoundingClientRect();
                        onMenu(
                            event.currentTarget,
                            rect.left + 20,
                            rect.bottom - 8,
                        );
                        return;
                    }
                    if (event.key === 'Enter' || event.key === ' ')
                        onKeyActivate();
                }}
                onClick={onActivate}
            >
                {media}
                <span className="saved-collection-row-info">
                    <strong>{name}</strong>
                    {detail}
                </span>
                {!hasAction &&
                    (selecting ? (
                        <SelectionIndicator selected={selected} />
                    ) : (
                        <svg
                            className="saved-collection-row-chevron"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                        >
                            <path d="m9 6 6 6-6 6" />
                        </svg>
                    ))}
            </button>
            {hasAction &&
                (selecting ? (
                    // The row button stays the keyboard target; a tap on the
                    // check toggles the row too.
                    <div
                        className="saved-collection-row-action"
                        aria-hidden="true"
                        onClick={disabled ? undefined : onActivate}
                    >
                        <SelectionIndicator selected={selected} />
                    </div>
                ) : (
                    <div className="saved-collection-row-action">{action}</div>
                ))}
        </div>
    );
}
