import {
    useCallback,
    useEffect,
    useId,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
    type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import SlidingSheet from '../../components/SlidingSheet';
import { useMobilePicker } from '../../hooks/useMobilePicker';
import type { UserIngredient } from '../../../shared/types/types';
import { normalizeIngredientName } from '../../utils/Ingredient';
import {
    groupQuickAddIngredients,
    quickAddCategories,
    type QuickAddCategory,
    type QuickAddCategoryId,
} from './quickAddIngredients';
import spinachPhoto from '../../assets/ingredients/veggies-spinach.webp';
import chickpeasPhoto from '../../assets/ingredients/protein-chickpeas.webp';
import oatsPhoto from '../../assets/ingredients/grains-oats.webp';
import walnutsPhoto from '../../assets/ingredients/nuts-walnuts.png';
import IngredientThumbnail from './IngredientThumbnail';
import { useQuickAddLayout } from '../../settings/quickAddLayout';
import './QuickAddIngredientPicker.css';

const categoryPhotos: Partial<Record<QuickAddCategoryId, string>> = {
    vegetables: spinachPhoto,
    proteins: chickpeasPhoto,
    grains: oatsPhoto,
    'nuts-seeds': walnutsPhoto,
};

const savedIconPath =
    'M9.153 5.408C10.42 3.136 11.053 2 12 2s1.58 1.136 2.847 3.408l.327.588c.36.646.54.969.821 1.182.28.213.63.292 1.329.45l.636.144c2.46.557 3.69.835 3.983 1.776.292.94-.546 1.921-2.223 3.882l-.434.507c-.476.557-.715.836-.822 1.18-.107.345-.071.717.001 1.46l.066.677c.253 2.617.38 3.925-.386 4.506-.766.582-1.918.052-4.221-1.009l-.595-.274c-.655-.301-.982-.452-1.329-.452s-.674.15-1.329.452l-.595.274c-2.303 1.061-3.455 1.591-4.221 1.01-.766-.582-.639-1.89-.386-4.507l.066-.677c.072-.743.108-1.115.001-1.46-.107-.344-.346-.623-.822-1.18l-.434-.507C2.603 11.469 1.765 10.489 2.057 9.548c.293-.941 1.523-1.22 3.983-1.776l.636-.144c.699-.158 1.048-.237 1.329-.45.28-.213.46-.536.82-1.182l.328-.588Z';

function CategoryIcon({ category }: { category: QuickAddCategoryId }) {
    const photo = categoryPhotos[category];
    if (photo)
        return (
            <img
                src={photo}
                data-category={category}
                alt=""
                aria-hidden="true"
            />
        );

    return (
        <svg
            viewBox="0 0 24 24"
            data-category={category}
            aria-hidden="true"
            focusable="false"
        >
            <path d={savedIconPath} />
        </svg>
    );
}

type OverlayProps = {
    id: string;
    trigger: HTMLButtonElement;
    categoriesRef: RefObject<HTMLDivElement | null>;
    onClose: () => void;
    children: ReactNode;
};

function PickerPopover({
    id,
    trigger,
    categoriesRef,
    onClose,
    children,
}: OverlayProps) {
    const dialogRef = useRef<HTMLDialogElement>(null);

    useLayoutEffect(() => {
        const dialogNode = dialogRef.current;
        if (!dialogNode) return;
        const dialog = dialogNode;

        dialog.show();

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                onClose();
                return;
            }
        }

        function closeOnOutsidePointer(event: PointerEvent) {
            const target = event.target as Node;
            if (
                !dialog.contains(target) &&
                !categoriesRef.current?.contains(target)
            )
                onClose();
        }

        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('pointerdown', closeOnOutsidePointer);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('pointerdown', closeOnOutsidePointer);
            dialog.close();
            if (trigger.isConnected) trigger.focus({ preventScroll: true });
            // An outside pointer's default action can focus the body after cleanup.
            // Restore then, while preserving focus on another clicked control.
            window.requestAnimationFrame(() => {
                if (
                    trigger.isConnected &&
                    document.activeElement === document.body
                )
                    trigger.focus({ preventScroll: true });
            });
        };
    }, [trigger, categoriesRef, onClose]);

    useEffect(() => {
        dialogRef.current?.focus({ preventScroll: true });
    }, [trigger]);

    return createPortal(
        <dialog
            ref={dialogRef}
            id={id}
            tabIndex={-1}
            aria-labelledby={`${id}-title`}
            className="quick-add-picker"
            onCancel={(event) => {
                event.preventDefault();
                onClose();
            }}
        >
            {children}
        </dialog>,
        document.body,
    );
}

function PickerOverlay({ children, ...props }: OverlayProps) {
    const mobile = useMobilePicker();
    return mobile ? (
        <SlidingSheet
            id={props.id}
            labelledBy={`${props.id}-title`}
            className="quick-add-sheet"
            onClose={props.onClose}
        >
            {children}
        </SlidingSheet>
    ) : (
        <PickerPopover {...props}>{children}</PickerPopover>
    );
}

function PickerCloseButton({ onClose }: { onClose: () => void }) {
    const mobile = useMobilePicker();
    if (mobile) return null;
    return (
        <button
            type="button"
            className="quick-add-close"
            aria-label="Close ingredient picker"
            onClick={onClose}
        >
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m6 6 12 12M18 6 6 18" />
            </svg>
        </button>
    );
}

type QuickAddIngredientPickerProps = {
    savedIngredients: UserIngredient[];
    selectedIngredients: string[];
    onToggleIngredient: (name: string) => void;
};

export default function QuickAddIngredientPicker({
    savedIngredients,
    selectedIngredients,
    onToggleIngredient,
}: QuickAddIngredientPickerProps) {
    const [quickAddLayout] = useQuickAddLayout();
    const [active, setActive] = useState<{
        category: QuickAddCategory;
        trigger: HTMLButtonElement;
    } | null>(null);
    const [hasMoreCategories, setHasMoreCategories] = useState(false);
    const categoriesRef = useRef<HTMLDivElement>(null);
    const id = useId();
    const groups = useMemo(
        () => groupQuickAddIngredients(savedIngredients),
        [savedIngredients],
    );
    const selected = new Set(selectedIngredients.map(normalizeIngredientName));
    const close = useCallback(() => setActive(null), []);

    useLayoutEffect(() => {
        const categories = categoriesRef.current;
        if (!categories) return;

        const updateOverflowHint = () =>
            setHasMoreCategories(
                categories.scrollLeft + categories.clientWidth <
                    categories.scrollWidth - 2,
            );
        const frame = window.requestAnimationFrame(updateOverflowHint);
        categories.addEventListener('scroll', updateOverflowHint, {
            passive: true,
        });
        window.addEventListener('resize', updateOverflowHint);
        return () => {
            window.cancelAnimationFrame(frame);
            categories.removeEventListener('scroll', updateOverflowHint);
            window.removeEventListener('resize', updateOverflowHint);
        };
    }, []);

    return (
        <section
            className={`ingredient-category-picker${hasMoreCategories ? ' ingredient-category-picker-more' : ''}`}
            aria-label="Quick add ingredients"
        >
            <div className="quick-add-categories" ref={categoriesRef}>
                {quickAddCategories.map((category) => (
                    <button
                        type="button"
                        key={category.id}
                        className="quick-add-category"
                        data-category={category.id}
                        aria-haspopup="dialog"
                        aria-expanded={active?.category.id === category.id}
                        aria-controls={
                            active?.category.id === category.id ? id : undefined
                        }
                        onClick={(event) => {
                            const trigger = event.currentTarget;
                            trigger.focus({ preventScroll: true });
                            setActive((current) =>
                                current?.category.id === category.id
                                    ? null
                                    : { category, trigger },
                            );
                        }}
                    >
                        <CategoryIcon category={category.id} />
                        {category.name}
                    </button>
                ))}
            </div>
            {active && (
                <PickerOverlay
                    key={active.category.id}
                    id={id}
                    trigger={active.trigger}
                    categoriesRef={categoriesRef}
                    onClose={close}
                >
                    <header className="quick-add-picker-header">
                        <h3 id={`${id}-title`}>{active.category.name}</h3>
                        <PickerCloseButton onClose={close} />
                    </header>
                    <div
                        className={`quick-add-picker-options quick-add-picker-options-${quickAddLayout}`}
                        data-category={active.category.id}
                        role="group"
                        aria-label={`${active.category.name} ingredients`}
                    >
                        {groups[active.category.id].map((ingredient) => {
                            const isSelected = selected.has(
                                normalizeIngredientName(ingredient.name),
                            );
                            return (
                                <button
                                    type="button"
                                    key={ingredient.id}
                                    className="quick-add-option"
                                    aria-pressed={isSelected}
                                    onClick={() =>
                                        onToggleIngredient(ingredient.name)
                                    }
                                >
                                    <IngredientThumbnail
                                        name={ingredient.name}
                                        fdcId={ingredient.fdcId}
                                    />
                                    <span>{ingredient.name.trim()}</span>
                                    <svg
                                        className="quick-add-option-state"
                                        viewBox="0 0 20 20"
                                        aria-hidden="true"
                                    >
                                        <path
                                            d={
                                                isSelected
                                                    ? 'm4 10 4 4 8-8'
                                                    : 'M10 4v12M4 10h12'
                                            }
                                        />
                                    </svg>
                                </button>
                            );
                        })}
                        {groups[active.category.id].length === 0 && (
                            <div className="quick-add-empty">
                                <svg
                                    className="quick-add-empty-icon"
                                    viewBox="0 0 24 24"
                                    aria-hidden="true"
                                    focusable="false"
                                >
                                    <path d={savedIconPath} />
                                </svg>
                                <p>
                                    {active.category.id === 'saved'
                                        ? 'No saved ingredients yet. Save one in My Ingredients to find it here.'
                                        : 'No saved ingredients in this category yet. Use search to add an ingredient, or save one in My Ingredients.'}
                                </p>
                            </div>
                        )}
                    </div>
                </PickerOverlay>
            )}
        </section>
    );
}
