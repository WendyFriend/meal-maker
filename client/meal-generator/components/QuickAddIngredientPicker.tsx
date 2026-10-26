import {
    useCallback,
    useId,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
    type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import type { UserIngredient } from '../../../shared/types/types';
import { normalizeIngredientName } from '../../utils/Ingredient';
import { positionPopover } from '../../utils/positionPopover';
import {
    groupQuickAddIngredients,
    quickAddCategories,
    type QuickAddCategory,
    type QuickAddCategoryId,
} from './quickAddIngredients';
import './QuickAddIngredientPicker.css';

const categoryIconPaths: Record<QuickAddCategoryId, string> = {
    vegetables:
        'M16 28V14M16 21C7 22 5 17 5 12c7-1 11 2 11 9ZM16 15c-1-8 3-12 10-12 1 7-2 12-10 12Z',
    proteins:
        'M11 21c-6-3-6-9-2-13s10-4 13 0 1 10-5 12l-5 6-3-3 2-2ZM10 25l-3 3a3 3 0 0 1-4-4l4-3M11 11c2-2 5-3 7-1',
    'nuts-seeds': 'M7 26C3 15 10 6 26 3c2 15-5 25-19 23Z',
    grains: 'm10 29 12-25M15 19C7 20 6 16 6 13c6 0 9 2 9 6ZM19 12c-7-1-8-4-7-8 5 1 7 4 7 8ZM16 19c1-6 5-8 10-6-1 5-5 7-10 6Z',
};

function CategoryIcon({ category }: { category: QuickAddCategoryId }) {
    return (
        <svg
            viewBox="0 0 32 32"
            data-category={category}
            aria-hidden="true"
            focusable="false"
        >
            <path d={categoryIconPaths[category]} />
            {category === 'nuts-seeds' && (
                <path className="quick-add-icon-detail" d="M8 25 23 7" />
            )}
            {category === 'proteins' && (
                <path
                    className="quick-add-icon-detail"
                    d="M11 11c2-2 5-3 7-1"
                />
            )}
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

function PickerOverlay({
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

        function position() {
            positionPopover(dialog, trigger, {
                width: 380,
                maxHeight: 440,
                gap: 8,
            });
        }

        dialog.show();
        position();
        dialog.focus({ preventScroll: true });

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
        window.addEventListener('resize', position);
        window.addEventListener('scroll', position, true);
        const observer =
            typeof ResizeObserver === 'undefined'
                ? null
                : new ResizeObserver(position);
        observer?.observe(dialog);
        const ingredientInput = trigger.closest('.ingredient-input');
        if (ingredientInput) observer?.observe(ingredientInput);

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('pointerdown', closeOnOutsidePointer);
            window.removeEventListener('resize', position);
            window.removeEventListener('scroll', position, true);
            observer?.disconnect();
            dialog.close();
            if (trigger.isConnected) trigger.focus({ preventScroll: true });
        };
    }, [trigger, categoriesRef, onClose]);

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
    const [active, setActive] = useState<{
        category: QuickAddCategory;
        trigger: HTMLButtonElement;
    } | null>(null);
    const categoriesRef = useRef<HTMLDivElement>(null);
    const id = useId();
    const groups = useMemo(
        () => groupQuickAddIngredients(savedIngredients),
        [savedIngredients],
    );
    const selected = new Set(selectedIngredients.map(normalizeIngredientName));
    const close = useCallback(() => setActive(null), []);

    return (
        <section
            className="ingredient-category-picker"
            aria-labelledby={`${id}-label`}
        >
            <h4 id={`${id}-label`} className="quick-add-label">
                Quick add
            </h4>
            <div className="quick-add-categories" ref={categoriesRef}>
                {quickAddCategories.map((category) => (
                    <button
                        type="button"
                        key={category.id}
                        className="quick-add-category"
                        aria-haspopup="dialog"
                        aria-expanded={active?.category.id === category.id}
                        aria-controls={
                            active?.category.id === category.id ? id : undefined
                        }
                        onClick={(event) => {
                            const trigger = event.currentTarget;
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
                        <button
                            type="button"
                            className="quick-add-close"
                            aria-label="Close ingredient picker"
                            onClick={close}
                        >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="m6 6 12 12M18 6 6 18" />
                            </svg>
                        </button>
                    </header>
                    <div
                        className="quick-add-picker-options"
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
                                    key={ingredient.ingredientId}
                                    className="quick-add-option"
                                    aria-pressed={isSelected}
                                    onClick={() =>
                                        onToggleIngredient(ingredient.name)
                                    }
                                >
                                    <svg viewBox="0 0 20 20" aria-hidden="true">
                                        <path
                                            d={
                                                isSelected
                                                    ? 'm4 10 4 4 8-8'
                                                    : 'M10 4v12M4 10h12'
                                            }
                                        />
                                    </svg>
                                    <span>{ingredient.name.trim()}</span>
                                </button>
                            );
                        })}
                        {groups[active.category.id].length === 0 && (
                            <p className="quick-add-empty">
                                No saved ingredients in this category yet. Use
                                search to add an ingredient, or save one in My
                                Ingredients.
                            </p>
                        )}
                    </div>
                </PickerOverlay>
            )}
        </section>
    );
}
