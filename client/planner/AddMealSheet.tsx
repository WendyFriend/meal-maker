import { useState } from 'react';
import type { DailyTargets, MealSlotConfig } from '../../shared/types/profile';
import type { MealPlanEntry, Recipe } from '../../shared/types/recipe';
import type { UserIngredient } from '../../shared/types/types';
import type { NutritionTotals, SlotBudget } from './budget';
import RecommendTab from './RecommendTab';
import SavedMealsTab from './SavedMealsTab';
import Sheet from './Sheet';
import './AddMealSheet.css';

type AddMealSheetProps = {
    date: string;
    // "Today", "Tomorrow" or "Mon 27 Oct"; shown in the title.
    dateLabel: string;
    slot: MealSlotConfig;
    budget: SlotBudget;
    targets: DailyTargets;
    plannedSoFar: NutritionTotals;
    focusNutrients: string[];
    savedIngredients: UserIngredient[];
    recipes: Recipe[];
    onAdded: (entry: MealPlanEntry, recipe: Recipe) => void;
    onClose: () => void;
};

type Tab = 'recommend' | 'saved';

const TABS: { id: Tab; label: string }[] = [
    { id: 'recommend', label: 'Recommend' },
    { id: 'saved', label: 'Saved meals' },
];

/* Add a meal to one period: get a recommendation sized to what's left of the
   day, or pick something already saved. */
export default function AddMealSheet({
    date,
    dateLabel,
    slot,
    budget,
    targets,
    plannedSoFar,
    focusNutrients,
    savedIngredients,
    recipes,
    onAdded,
    onClose,
}: AddMealSheetProps) {
    const [tab, setTab] = useState<Tab>('recommend');

    function handleTabKeyDown(event: React.KeyboardEvent) {
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;

        event.preventDefault();
        const next = tab === 'recommend' ? 'saved' : 'recommend';

        setTab(next);
        document.getElementById(`add-sheet-tab-${next}`)?.focus();
    }

    return (
        <Sheet
            title={`Add to ${slot.label}`}
            subtitle={`${dateLabel} · budget ≈ ${budget.calories} kcal`}
            onClose={onClose}
        >
            <div
                className="add-sheet-tabs"
                role="tablist"
                aria-label="How to add a meal"
                onKeyDown={handleTabKeyDown}
            >
                {TABS.map(({ id, label }) => (
                    <button
                        key={id}
                        id={`add-sheet-tab-${id}`}
                        type="button"
                        role="tab"
                        aria-selected={tab === id}
                        aria-controls={`add-sheet-panel-${id}`}
                        tabIndex={tab === id ? 0 : -1}
                        className="add-sheet-tab"
                        onClick={() => setTab(id)}
                    >
                        {label}
                    </button>
                ))}
            </div>

            <div
                id="add-sheet-panel-recommend"
                role="tabpanel"
                aria-labelledby="add-sheet-tab-recommend"
                className="add-sheet-tabpanel"
                hidden={tab !== 'recommend'}
            >
                <RecommendTab
                    date={date}
                    slot={slot}
                    budget={budget}
                    targets={targets}
                    plannedSoFar={plannedSoFar}
                    focusNutrients={focusNutrients}
                    savedIngredients={savedIngredients}
                    onAdded={onAdded}
                />
            </div>
            <div
                id="add-sheet-panel-saved"
                role="tabpanel"
                aria-labelledby="add-sheet-tab-saved"
                className="add-sheet-tabpanel"
                hidden={tab !== 'saved'}
            >
                <SavedMealsTab
                    date={date}
                    slot={slot}
                    budget={budget}
                    recipes={recipes}
                    onAdded={onAdded}
                    onRecommend={() => setTab('recommend')}
                />
            </div>
        </Sheet>
    );
}
