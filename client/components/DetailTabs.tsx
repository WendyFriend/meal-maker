import { useRef, type CSSProperties, type ReactNode } from 'react';
import './DetailTabs.css';

export type DetailTab<T extends string> = { id: T; label: string };

/** Ids shared by a tab and its panel. */
function tabIds(idPrefix: string, id: string) {
    return { tab: `${idPrefix}-${id}-tab`, panel: `${idPrefix}-${id}-panel` };
}

/**
 * The underlined section tabs on Recipe Detail, Create Recipe and Add Meal,
 * with arrow, Home and End key navigation.
 */
export function DetailTabs<T extends string>({
    tabs,
    active,
    onChange,
    idPrefix,
    ariaLabel,
    className = '',
}: {
    tabs: readonly DetailTab<T>[];
    active: T;
    onChange: (id: T) => void;
    idPrefix: string;
    ariaLabel: string;
    className?: string;
}) {
    const buttons = useRef(new Map<T, HTMLButtonElement>());
    return (
        <div
            className={`detail-tabs ${className}`.trim()}
            role="tablist"
            aria-label={ariaLabel}
            style={{ '--detail-tab-count': tabs.length } as CSSProperties}
            onKeyDown={(event) => {
                const index = tabs.findIndex((tab) => tab.id === active);
                const step =
                    event.key === 'ArrowRight'
                        ? 1
                        : event.key === 'ArrowLeft'
                          ? -1
                          : 0;
                const next = step
                    ? tabs[(index + step + tabs.length) % tabs.length]
                    : event.key === 'Home'
                      ? tabs[0]
                      : event.key === 'End'
                        ? tabs[tabs.length - 1]
                        : undefined;
                if (!next) return;
                event.preventDefault();
                onChange(next.id);
                buttons.current.get(next.id)?.focus();
            }}
        >
            {tabs.map(({ id, label }) => {
                const ids = tabIds(idPrefix, id);
                return (
                    <button
                        key={id}
                        ref={(node) => {
                            if (node) buttons.current.set(id, node);
                            else buttons.current.delete(id);
                        }}
                        type="button"
                        role="tab"
                        id={ids.tab}
                        aria-controls={ids.panel}
                        aria-selected={active === id}
                        tabIndex={active === id ? 0 : -1}
                        onClick={() => onChange(id)}
                    >
                        {label}
                    </button>
                );
            })}
        </div>
    );
}

/**
 * The panel for one tab. With `tabbed={false}` every panel shows, without
 * tab semantics (e.g. Meal Maker's single-page layout).
 */
export function DetailTabPanel({
    id,
    idPrefix,
    active,
    tabbed = true,
    className = '',
    children,
}: {
    id: string;
    idPrefix: string;
    active: boolean;
    tabbed?: boolean;
    className?: string;
    children: ReactNode;
}) {
    const ids = tabIds(idPrefix, id);
    return (
        <div
            className={`detail-tab-panel ${className}`.trim()}
            id={ids.panel}
            role={tabbed ? 'tabpanel' : undefined}
            tabIndex={tabbed ? 0 : undefined}
            aria-labelledby={tabbed ? ids.tab : undefined}
            hidden={tabbed && !active}
        >
            {children}
        </div>
    );
}
