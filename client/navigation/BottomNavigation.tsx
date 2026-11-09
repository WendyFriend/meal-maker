import type { Ref } from 'react';
import type { Page } from './pages';
import './BottomNavigation.css';

const tabs: { page: Page; label: string }[] = [
    { page: 'meal-maker', label: 'Discover' },
    { page: 'my-journal', label: 'My Plan' },
    { page: 'my-recipes', label: 'Recipes' },
    { page: 'my-ingredients', label: 'Ingredients' },
];

function TabIcon({ page, active }: { page: Page | 'more'; active: boolean }) {
    if (page === 'meal-maker')
        return (
            <svg viewBox="0 0 24 24" aria-hidden="true">
                {active ? (
                    <>
                        <path
                            className="bottom-navigation-icon-fill"
                            d="M12 2.8 2.8 10v10.2c0 .7.5 1.2 1.2 1.2h16c.7 0 1.2-.5 1.2-1.2V10L12 2.8Z"
                        />
                        <path
                            className="bottom-navigation-icon-cutout"
                            d="M9.5 21.4v-7h5v7"
                        />
                    </>
                ) : (
                    <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10Z" />
                )}
            </svg>
        );
    if (page === 'my-journal')
        return (
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect
                    className={
                        active ? 'bottom-navigation-icon-fill' : undefined
                    }
                    x="3"
                    y="5"
                    width="18"
                    height="16"
                    rx="2"
                />
                <path d="M7 3v4m10-4v4" />
                {active ? (
                    <path
                        className="bottom-navigation-icon-detail"
                        d="M3 10h18m-12 5 2.2 2.2L16 12.5"
                    />
                ) : (
                    <path d="M3 10h18" />
                )}
            </svg>
        );
    if (page === 'my-recipes')
        return (
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                    className={
                        active ? 'bottom-navigation-icon-fill' : undefined
                    }
                    d="M12 5c-2.5-1.8-5.7-2-9-1v16c3.3-1 6.5-.8 9 1 2.5-1.8 5.7-2 9-1V4c-3.3-1-6.5-.8-9 1Z"
                />
                <path
                    className={
                        active ? 'bottom-navigation-icon-detail' : undefined
                    }
                    d="M12 5v16"
                />
            </svg>
        );
    if (page === 'my-ingredients')
        return (
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                    className={
                        active ? 'bottom-navigation-icon-fill' : undefined
                    }
                    d="M20.5 3.5C12 3.5 5 6 4.5 14.5c-.2 3.3 2.1 5.8 5.3 5.8 8.5 0 11-7.2 10.7-16.8Z"
                />
                <path
                    className={
                        active ? 'bottom-navigation-icon-detail' : undefined
                    }
                    d="M3 22c4.3-6 7.8-9.4 14-13"
                />
            </svg>
        );
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="5" cy="12" r="1.7" />
            <circle cx="12" cy="12" r="1.7" />
            <circle cx="19" cy="12" r="1.7" />
        </svg>
    );
}

export default function BottomNavigation({
    currentPage,
    menuOpen,
    moreButtonRef,
    onNavigate,
    onMore,
}: {
    currentPage: Page;
    menuOpen: boolean;
    moreButtonRef: Ref<HTMLButtonElement>;
    onNavigate: (page: Page) => void;
    onMore: () => void;
}) {
    return (
        <nav className="bottom-navigation" aria-label="Main tabs">
            {tabs.map(({ page, label }) => {
                const active = currentPage === page;
                return (
                    <button
                        key={page}
                        type="button"
                        className={`bottom-navigation-tab${active ? ' bottom-navigation-tab-active' : ''}`}
                        aria-current={active ? 'page' : undefined}
                        onClick={() => onNavigate(page)}
                    >
                        <span className="bottom-navigation-icon">
                            <TabIcon page={page} active={active} />
                        </span>
                        <span className="bottom-navigation-label">{label}</span>
                    </button>
                );
            })}
            <button
                ref={moreButtonRef}
                type="button"
                className={`bottom-navigation-tab${menuOpen || currentPage === 'settings' ? ' bottom-navigation-tab-active' : ''}`}
                aria-label="More"
                aria-current={currentPage === 'settings' ? 'page' : undefined}
                aria-expanded={menuOpen}
                aria-controls="sidebar"
                onClick={onMore}
            >
                <span className="bottom-navigation-icon">
                    <TabIcon
                        page="more"
                        active={menuOpen || currentPage === 'settings'}
                    />
                </span>
                <span className="bottom-navigation-label">More</span>
            </button>
        </nav>
    );
}
