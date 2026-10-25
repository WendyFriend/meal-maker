import { usePlan } from './PlanContext';
import './plan.css';

type UpgradeNoticeProps = {
    // What's locked, e.g. "Vitamins & minerals".
    feature: string;
    // One line on what upgrading gives.
    description?: string;
    compact?: boolean;
};

/* Inline lock card for a feature the current plan doesn't include. */
export default function UpgradeNotice({
    feature,
    description,
    compact = false,
}: UpgradeNoticeProps) {
    const { openPlans, profile } = usePlan();
    const action = profile.trialUsed ? 'Upgrade to Pro' : 'Start free trial';

    return (
        <div
            className={`upgrade-notice${compact ? ' upgrade-notice-compact' : ''}`}
        >
            <span className="upgrade-notice-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                    <rect x="5" y="11" width="14" height="9" rx="2" />
                    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                </svg>
            </span>
            <div className="upgrade-notice-text">
                <strong>{feature}</strong>
                {description && <span>{description}</span>}
            </div>
            <button
                type="button"
                className="upgrade-notice-button"
                onClick={() => openPlans(feature)}
            >
                {action}
            </button>
        </div>
    );
}
