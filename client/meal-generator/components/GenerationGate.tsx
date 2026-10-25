import type { ReactNode } from 'react';
import './GenerationGate.css';
import { usePlan } from '../../plan/PlanContext';
import UpgradeNotice from '../../plan/UpgradeNotice';

/*
 * Wraps the Create button with the plan's daily AI meal allowance: how many
 * are left (not shown on Pro, where the cap is fair use), or, once they are
 * used up, a notice in place of the button. The rest of the form stays usable.
 */
function GenerationGate({ children }: { children: ReactNode }) {
    const { tier, limits, generationsLeft, canGenerate } = usePlan();

    if (!canGenerate) {
        return (
            <div className="generation-gate-limit">
                <UpgradeNotice
                    feature="Daily AI meal limit reached"
                    description={`You've used all ${limits.generationsPerDay} AI meals for today. They reset tomorrow, or upgrade for more.`}
                />
            </div>
        );
    }

    return (
        <>
            {tier !== 'pro' && (
                <p
                    className={`generation-quota${
                        generationsLeft <= 1 ? ' generation-quota-low' : ''
                    }`}
                >
                    <strong>{generationsLeft}</strong> of{' '}
                    {limits.generationsPerDay} AI meals left today
                </p>
            )}

            {children}
        </>
    );
}

export default GenerationGate;
