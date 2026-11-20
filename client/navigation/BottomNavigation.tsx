import type { Page } from './pages';
import './BottomNavigation.css';

const tabs: { page: Page; label: string }[] = [
    { page: 'meal-maker', label: 'Discover' },
    { page: 'my-journal', label: 'Diary' },
    { page: 'my-recipes', label: 'Recipes' },
    { page: 'my-ingredients', label: 'Ingredients' },
    { page: 'profile', label: 'Profile' },
];

function TabIcon({ page, active }: { page: Page; active: boolean }) {
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
        // A chubby carrot: round top, soft tip, ridges and two leaves.
        return (
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                    className={
                        active ? 'bottom-navigation-icon-fill' : undefined
                    }
                    d="M10.7 7.1a4.4 4.4 0 0 1 6.2 6.2c-3.3 3.3-8.3 6.6-12 7.6a1.3 1.3 0 0 1-1.8-1.8c1-3.7 4.3-8.7 7.6-12Z"
                />
                <path
                    className={
                        active ? 'bottom-navigation-icon-detail' : undefined
                    }
                    d="m7.9 10.7 1.5 1.5m-3.7 2.1 1.3 1.3m5.6 0.1-1.4-1.4"
                />
                <path
                    className={
                        active ? 'bottom-navigation-icon-fill' : undefined
                    }
                    d="M16.2 6.6C14.9 4.9 15.2 2.6 17 1.8c1.3 1.5 1.3 3.7 0 5.1m.6 1c1.6-1.5 4-1.6 5.2-.3-1.2 1.6-3.5 2-5.2.9"
                />
            </svg>
        );
    // Profile: a person, head and shoulders.
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle
                className={active ? 'bottom-navigation-icon-fill' : undefined}
                cx="12"
                cy="8"
                r="4"
            />
            <path
                className={active ? 'bottom-navigation-icon-fill' : undefined}
                d="M4 20.5c.6-4 3.9-6.5 8-6.5s7.4 2.5 8 6.5Z"
            />
        </svg>
    );
}

export default function BottomNavigation({
    currentPage,
    onNavigate,
}: {
    currentPage: Page;
    onNavigate: (page: Page) => void;
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
        </nav>
    );
}
