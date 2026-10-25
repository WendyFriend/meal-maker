import { PLAN_LABELS } from '../../shared/plans';
import { usePlan } from './PlanContext';
import './plan.css';

/* Header pill showing the current plan; opens the Plans page. */
export default function PlanBadge({ onClick }: { onClick: () => void }) {
    const { tier, trialDaysLeft, isLoading } = usePlan();

    if (isLoading) return null;

    return (
        <button
            type="button"
            className={`plan-badge plan-badge-${tier}`}
            onClick={onClick}
            aria-label={`Current plan: ${PLAN_LABELS[tier]}. View plans`}
        >
            {tier === 'free' ? (
                <>
                    Free
                    <span className="plan-badge-cta">Upgrade</span>
                </>
            ) : tier === 'trial' ? (
                <>
                    Trial
                    <span className="plan-badge-cta">
                        {trialDaysLeft === 1
                            ? '1 day left'
                            : `${trialDaysLeft} days left`}
                    </span>
                </>
            ) : (
                <>Pro</>
            )}
        </button>
    );
}
