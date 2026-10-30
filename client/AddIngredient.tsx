import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type {
    IngredientInfo,
    IngredientNutrition,
} from '../shared/types/types';
import IngredientPage from './IngredientPage';
import checkmarkAnimation from './assets/animations/checkmark.svg';
import './AddIngredient.css';

const emptyIngredient: IngredientNutrition = {
    name: '',
    caloriesPer100g: 0,
    proteinPer100g: 0,
    carbohydratePer100g: 0,
    fatPer100g: 0,
};

export default function AddIngredient({
    onBack,
    onSave,
    findExistingIngredient,
    onEditorStateChange,
}: {
    onBack: () => void;
    onSave: (ingredient: IngredientInfo) => Promise<void>;
    findExistingIngredient: (name: string) => string | undefined;
    onEditorStateChange: (state: { editing: boolean; saving: boolean }) => void;
}) {
    const [saved, setSaved] = useState(false);
    useEffect(() => {
        if (!saved) return;
        const timer = window.setTimeout(onBack, 950);
        return () => window.clearTimeout(timer);
    }, [saved, onBack]);
    return (
        <>
            <IngredientPage
                creating
                ingredient={emptyIngredient}
                onCancel={onBack}
                onEditorStateChange={onEditorStateChange}
                findExistingIngredient={findExistingIngredient}
                onSave={async (ingredient) => {
                    await onSave(ingredient);
                    setSaved(true);
                }}
            />
            {saved &&
                createPortal(
                    <div
                        className="save-success"
                        role="status"
                        aria-label="Ingredient saved"
                    >
                        <img
                            src={checkmarkAnimation}
                            alt=""
                            className="save-success-animation"
                        />
                    </div>,
                    document.body,
                )}
        </>
    );
}
