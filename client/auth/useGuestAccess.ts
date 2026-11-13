import { useCallback, useEffect, useState } from 'react';
import type {
    GenerateMealResponse,
    IngredientInfo,
    MealPreference,
} from '../../shared/types/types';

export type AccountRequiredAction =
    'sign-in' | 'sign-up' | 'save-meal' | 'my-day' | 'save-ingredient';

export type GuestMealDraft = {
    ingredients: string[];
    ingredientNutrition: IngredientInfo[];
    caloriesGoal?: number;
    proteinGramsGoal?: number;
    mealPreferences?: MealPreference[];
    meal?: GenerateMealResponse;
    originalMeal?: GenerateMealResponse;
};

const STORAGE_KEY = 'meal-maker-guest-draft';
const EMPTY_DRAFT: GuestMealDraft = {
    ingredients: [],
    ingredientNutrition: [],
};

type PendingAuthDraft = GuestMealDraft & { pendingAuth: true };

function clearStoredDraft() {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        // The in-memory workspace still works when storage is unavailable.
    }
}

function loadPendingDraft(): GuestMealDraft {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return EMPTY_DRAFT;

        const draft = JSON.parse(stored) as Partial<PendingAuthDraft>;
        if (draft.pendingAuth !== true) {
            clearStoredDraft();
            return EMPTY_DRAFT;
        }

        return {
            ingredients: draft.ingredients ?? [],
            ingredientNutrition: draft.ingredientNutrition ?? [],
            caloriesGoal: draft.caloriesGoal,
            proteinGramsGoal: draft.proteinGramsGoal,
            mealPreferences: draft.mealPreferences,
            meal: draft.meal,
            originalMeal: draft.originalMeal,
        };
    } catch {
        clearStoredDraft();
        return EMPTY_DRAFT;
    }
}

function storePendingDraft(draft: GuestMealDraft) {
    try {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ ...draft, pendingAuth: true }),
        );
    } catch {
        // The current in-memory meal remains available when storage is blocked.
    }
}

export function useGuestAccess({
    authenticated,
    authLoading,
}: {
    authenticated: boolean;
    authLoading: boolean;
}) {
    const [initialDraft] = useState(loadPendingDraft);
    const [accountAction, setAccountAction] = useState<AccountRequiredAction>();
    const [landingActive, setLandingActive] = useState(!authenticated);

    useEffect(() => {
        if (!authLoading && authenticated) clearStoredDraft();
    }, [authenticated, authLoading]);

    useEffect(() => {
        if (authenticated) return;
        const scroller = document.querySelector<HTMLElement>(
            '.page-transition-meal-maker',
        );
        const landing = scroller?.querySelector<HTMLElement>('.guest-landing');
        if (!scroller || !landing) return;
        const pageScroller = scroller;
        const guestLanding = landing;

        function syncHeaderWithLanding() {
            const threshold = Math.max(1, guestLanding.offsetHeight - 80);
            setLandingActive(pageScroller.scrollTop < threshold);
        }

        pageScroller.addEventListener('scroll', syncHeaderWithLanding, {
            passive: true,
        });
        return () =>
            pageScroller.removeEventListener('scroll', syncHeaderWithLanding);
    }, [authenticated]);

    const requestAccount = useCallback(
        (action: AccountRequiredAction, draft: GuestMealDraft) => {
            storePendingDraft(draft);
            setAccountAction(action);
        },
        [],
    );

    const enterMealMaker = useCallback((scrollToForm: () => void) => {
        setLandingActive(false);
        window.requestAnimationFrame(scrollToForm);
    }, []);

    const reset = useCallback(() => {
        setAccountAction(undefined);
        setLandingActive(true);
        clearStoredDraft();
    }, []);

    const showLanding = useCallback(() => {
        window.requestAnimationFrame(() => {
            setLandingActive(true);
            const scroller = document.querySelector<HTMLElement>(
                '.page-transition-meal-maker',
            );
            if (scroller) scroller.scrollTop = 0;
        });
    }, []);

    const closeAccountPrompt = useCallback(
        () => setAccountAction(undefined),
        [],
    );

    return {
        initialDraft,
        accountAction,
        closeAccountPrompt,
        landingActive,
        requestAccount,
        enterMealMaker,
        reset,
        showLanding,
    };
}
