import { useEffect, type RefObject } from 'react';
import { usePlan } from '../../plan/PlanContext';

export type PlanValue = ReturnType<typeof usePlan>;

/*
 * Publishes the current plan to a ref. The component that renders the plan
 * provider can't call usePlan() itself, but its event handlers (creating a
 * meal) need to check the allowance and record the generation. Render this
 * anywhere inside the provider.
 */
function PlanBridge({ planRef }: { planRef: RefObject<PlanValue | null> }) {
    const plan = usePlan();

    useEffect(() => {
        planRef.current = plan;
    });

    return null;
}

export default PlanBridge;
