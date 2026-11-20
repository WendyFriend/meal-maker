import {
    useEffect,
    useRef,
    useState,
    type Dispatch,
    type SetStateAction,
} from 'react';
import ActionToast from '../../components/ActionToast';
import { successToastColors } from '../../components/actionToastColors';
import IngredientCamera from '../../components/IngredientCamera';
import LoadingSpinner from '../../components/LoadingSpinner';
import { ingredientDraftFromFoodSearch } from '../../services/foodSearchService';
import {
    scanIngredientsPhoto,
    shrinkPhoto,
} from '../../services/nutritionPhotoService';
import type { MealPhoto } from '../mealPhotos';
import { normalizeIngredientName } from '../../utils/Ingredient';
import type { IngredientInfo } from '../../../shared/types/types';

type Toast = {
    message: string;
    detail?: string;
    added?: string[];
    failed?: boolean;
};

function joinNames(names: string[]) {
    const text = names.join(', ');
    return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Meal Maker's Photo: the camera, then Nutrition Lab finds the foods in the
 * picture and adds each one as a chip, with its matched nutrition.
 */
export default function IngredientPhotoScan({
    ingredients,
    onChange,
    onIngredientNutritionSelected,
    onScanningChange,
    onPhotosChange,
    onClose,
}: {
    ingredients: string[];
    onChange: (ingredients: string[]) => void;
    onIngredientNutritionSelected?: (
        name: string,
        nutrition: IngredientInfo,
    ) => void;
    onScanningChange: (scanning: boolean) => void;
    /** Shows the photo with the chips it added (a spinner while read). */
    onPhotosChange?: Dispatch<SetStateAction<MealPhoto[]>>;
    /** Called once the camera and any status are gone. */
    onClose: () => void;
}) {
    const [step, setStep] = useState<'camera' | 'scanning' | 'done'>('camera');
    const [toast, setToast] = useState<Toast>();
    // Chips can change while the photo is read; always add to the latest.
    const latest = useRef(ingredients);
    useEffect(() => {
        latest.current = ingredients;
    }, [ingredients]);

    async function scan(photo: string) {
        setStep('scanning');
        onScanningChange(true);
        const id = `${Date.now()}-${Math.random()}`;
        const request = scanIngredientsPhoto(photo);
        // Large enough for its own page, light enough to keep around.
        const src = await shrinkPhoto(photo, 1200);
        onPhotosChange?.((photos) => [
            ...photos,
            { id, src, ingredients: [], scanning: true },
        ]);
        let kept: string[] = [];
        try {
            const found = await request;
            const chosen = new Set(latest.current.map(normalizeIngredientName));
            const added = found.filter(({ name }) => {
                const key = normalizeIngredientName(name);
                if (chosen.has(key)) return false;
                chosen.add(key);
                return true;
            });
            if (!added.length) {
                setToast({ message: 'Already in your ingredients.' });
            } else {
                onChange([...latest.current, ...added.map(({ name }) => name)]);
                for (const { name, food } of added)
                    if (food)
                        onIngredientNutritionSelected?.(
                            name,
                            ingredientDraftFromFoodSearch(food),
                        );
                const names = added.map(({ name }) => name);
                kept = names;
                setToast({
                    message:
                        names.length === 1
                            ? 'Ingredient added.'
                            : `${names.length} ingredients added.`,
                    detail: joinNames(names),
                    added: names,
                });
            }
        } catch (error) {
            setToast({
                message:
                    error instanceof Error && error.message
                        ? error.message
                        : 'Could not scan the photo. Please try again.',
                failed: true,
            });
        }
        onPhotosChange?.((photos) =>
            kept.length
                ? photos.map((shown) =>
                      shown.id === id
                          ? { ...shown, ingredients: kept, scanning: false }
                          : shown,
                  )
                : photos.filter((shown) => shown.id !== id),
        );
        setStep('done');
        onScanningChange(false);
    }

    function undo(added: string[]) {
        const removed = new Set(added);
        onChange(latest.current.filter((name) => !removed.has(name)));
        onClose();
    }

    if (step === 'camera')
        return (
            <IngredientCamera
                mode="food"
                backLabel="Back to Meal Maker"
                continueLabel="Use photo"
                note="We’ll add the foods we find as ingredients."
                onClose={onClose}
                onContinue={(photo) => void scan(photo)}
            />
        );
    if (step === 'scanning')
        return (
            <div role="status">
                <ActionToast
                    placement="floating"
                    message="Finding ingredients…"
                    icon={<LoadingSpinner size="small" tone="inherit" />}
                    colors={successToastColors}
                />
            </div>
        );
    if (!toast) return null;
    const { added } = toast;
    return (
        <div role="status">
            <ActionToast
                placement="floating"
                message={toast.message}
                detail={toast.detail}
                // No ✓ on a failure.
                icon={toast.failed ? null : undefined}
                colors={successToastColors}
                durationMs={added ? 5000 : 3200}
                action={
                    added
                        ? { label: 'Undo', onClick: () => undo(added) }
                        : undefined
                }
                onClose={onClose}
            />
        </div>
    );
}
