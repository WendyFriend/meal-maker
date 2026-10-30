import { useLayoutEffect, useRef } from 'react';
import Brand from '../components/Brand';
import { APP_VERSION } from '../version';
import { navigationItems, type Page } from './pages';
import '../Sidebar.css';

function NavigationLinks({
    currentPage,
    itemClassName,
    onNavigate,
}: {
    currentPage: Page;
    itemClassName: string;
    onNavigate: (page: Page) => void;
}) {
    return navigationItems.map(({ id, label }) => {
        const active = currentPage === id;
        return (
            <button
                key={id}
                type="button"
                className={`${itemClassName}${active ? ` ${itemClassName}-active` : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={() => onNavigate(id)}
            >
                {label}
            </button>
        );
    });
}

export default function NavigationPanel({
    currentPage,
    open,
    onClose,
    onHome,
    onNavigate,
    onSignOut,
}: {
    currentPage: Page;
    open: boolean;
    onClose: () => void;
    onHome: () => void;
    onNavigate: (page: Page) => void;
    onSignOut: () => void;
}) {
    const sidebarHomeRef = useRef<HTMLButtonElement>(null);
    useLayoutEffect(() => {
        if (open) sidebarHomeRef.current?.focus();
    }, [open]);
    return (
        <>
            {/* Side Bar */}
            <div
                className={`sidebar-backdrop ${open ? 'open' : ''}`}
                onClick={onClose}
                aria-hidden="true"
            />

            <aside
                id="sidebar"
                className={`sidebar ${open ? 'open' : ''}`}
                aria-label="Navigation"
                aria-hidden={!open}
                inert={!open}
                onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                        event.preventDefault();
                        onClose();
                    }
                }}
            >
                <button
                    ref={sidebarHomeRef}
                    type="button"
                    className="sidebar-home"
                    aria-label="Meal Maker"
                    onClick={() => {
                        onClose();
                        onHome();
                    }}
                >
                    <Brand className="sidebar-brand" />
                </button>

                <nav className="sidebar-nav" aria-label="Primary">
                    <NavigationLinks
                        currentPage={currentPage}
                        itemClassName="sidebar-item"
                        onNavigate={(page) => {
                            onClose();
                            onNavigate(page);
                        }}
                    />
                </nav>

                <button
                    type="button"
                    className={`sidebar-item sidebar-settings${currentPage === 'settings' ? ' sidebar-item-active' : ''}`}
                    aria-current={
                        currentPage === 'settings' ? 'page' : undefined
                    }
                    onClick={() => {
                        onClose();
                        onNavigate('settings');
                    }}
                >
                    Settings
                </button>

                <button
                    type="button"
                    className="sidebar-item"
                    onClick={onSignOut}
                >
                    Log out
                </button>

                <div className="app-version">v{APP_VERSION}</div>
            </aside>
        </>
    );
}
