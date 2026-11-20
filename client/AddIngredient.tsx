import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type {
    IngredientInfo,
    IngredientNutrition,
} from '../shared/types/types';
import IngredientPage from './IngredientPage';
import checkmarkAnimation from './assets/animations/checkmark.svg';
import './AddIngredient.css';

/** A photo taken from Add Ingredient; a label photo is read into the form. */
export type IngredientPhoto = { src: string; kind: 'food' | 'label' };

const emptyIngredient: IngredientNutrition = {
    name: '',
    caloriesPer100g: 0,
    proteinPer100g: 0,
    carbohydratePer100g: 0,
    fatPer100g: 0,
};

export default function AddIngredient({
    initialIngredient = emptyIngredient,
    referencePhoto,
    onBack,
    onSave,
    findExistingIngredient,
    onEditorStateChange,
}: {
    initialIngredient?: IngredientInfo;
    referencePhoto?: IngredientPhoto;
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
            {referencePhoto && (
                <details className="add-ingredient-reference" open>
                    <summary>Photo reference</summary>
                    <img
                        src={referencePhoto.src}
                        alt="Captured ingredient reference"
                    />
                </details>
            )}
            <IngredientPage
                creating
                ingredient={initialIngredient}
                labelPhoto={
                    referencePhoto?.kind === 'label'
                        ? referencePhoto.src
                        : undefined
                }
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
