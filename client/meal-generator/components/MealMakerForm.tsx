import { useState, type Ref } from 'react';
import type {
    IngredientInfo,
    MealPreference,
    UserIngredient,
} from '../../../shared/types/types';
import emptyStateIllustration from '../../assets/meal-maker-empty-state.png';
import LoadingSpinner from '../../components/LoadingSpinner';
import IngredientInput from './IngredientInput';
import MealMakerPreferencesSheet from './MealMakerPreferencesSheet';
import SelectedIngredients from './SelectedIngredients';
import './MealMakerForm.css';

type MealMakerFormProps = {
    ref?: Ref<HTMLDivElement>;
    ingredients: string[];
    savedIngredients: UserIngredient[];
    onIngredientsChange: (ingredients: string[]) => void;
    onIngredientNutritionSelected: (
        name: string,
        nutrition: IngredientInfo,
    ) => void;
    onRemoveIngredient: (ingredient: string) => void;
    onIngredientClick: (index: number) => void;
    calories: number | undefined;
    onCaloriesChange: (calories: number | undefined) => void;
    proteinGrams: number | undefined;
    onProteinGramsChange: (proteinGrams: number | undefined) => void;
    preferences: MealPreference[];
    onPreferencesChange: (preferences: MealPreference[]) => void;
    generating: boolean;
    onCreate: () => void;
};

export default function MealMakerForm({
    ref,
    ingredients,
    savedIngredients,
    onIngredientsChange,
    onIngredientNutritionSelected,
    onRemoveIngredient,
    onIngredientClick,
    calories,
    onCaloriesChange,
    proteinGrams,
    onProteinGramsChange,
    preferences,
    onPreferencesChange,
    generating,
    onCreate,
}: MealMakerFormProps) {
    const [preferencesOpen, setPreferencesOpen] = useState(false);
    const goalSummary = [
        calories === undefined
            ? undefined
            : `${calories.toLocaleString()} kcal`,
        proteinGrams === undefined ? undefined : `${proteinGrams} g protein`,
    ]
        .filter(Boolean)
        .join(' · ');

    return (
        <div className="meal-maker-form" ref={ref} tabIndex={-1}>
            <h1 className="meal-maker-form-title">
                What do you feel
                <br className="meal-maker-form-title-break" /> like today?
            </h1>
            <div className="meal-maker-fields">
                <section className="meal-maker-ingredients">
                    <IngredientInput
                        ingredients={ingredients}
                        savedIngredients={savedIngredients}
                        onChange={onIngredientsChange}
                        onIngredientNutritionSelected={
                            onIngredientNutritionSelected
                        }
                    />
                    {ingredients.length > 0 ? (
                        <SelectedIngredients
                            ingredients={ingredients}
                            removeIngredient={onRemoveIngredient}
                            onIngredientClick={onIngredientClick}
                            onClear={() => onIngredientsChange([])}
                        />
                    ) : (
                        <div className="meal-maker-empty-state">
                            <img
                                src={emptyStateIllustration}
                                alt=""
                                width="600"
                                height="339"
                            />
                            <p>Add ingredients to get started</p>
                        </div>
                    )}
                </section>
            </div>
            <section className="meal-maker-preferences">
                <button
                    className="meal-maker-preferences-toggle"
                    type="button"
                    aria-expanded={preferencesOpen}
                    aria-controls={
                        preferencesOpen
                            ? 'meal-maker-preferences-dialog'
                            : undefined
                    }
                    onClick={() => setPreferencesOpen((open) => !open)}
                >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M4 6h16M4 12h16M4 18h16" />
                        <circle cx="9" cy="6" r="2" />
                        <circle cx="15" cy="12" r="2" />
                        <circle cx="8" cy="18" r="2" />
                    </svg>
                    <span className="meal-maker-preferences-copy">
                        <strong>
                            More preferences <span>(optional)</span>
                        </strong>
                        {goalSummary && <small>{goalSummary}</small>}
                    </span>
                    <svg
                        className="meal-maker-chevron"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                    >
                        <path d="m6 9 6 6 6-6" />
                    </svg>
                </button>
            </section>
            {preferencesOpen && (
                <MealMakerPreferencesSheet
                    calories={calories}
                    proteinGrams={proteinGrams}
                    preferences={preferences}
                    onCaloriesChange={onCaloriesChange}
                    onProteinChange={onProteinGramsChange}
                    onPreferencesChange={onPreferencesChange}
                    onClose={() => setPreferencesOpen(false)}
                />
            )}
            <div className="meal-maker-create-action">
                <button
                    type="button"
                    className="create-button meal-maker-create-button"
                    onClick={onCreate}
                    disabled={generating || ingredients.length === 0}
                >
                    {generating ? (
                        <>
                            <LoadingSpinner size="small" tone="inherit" />
                            Creating your meal…
                        </>
                    ) : (
                        <>
                            See recipes <span aria-hidden="true">→</span>
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
