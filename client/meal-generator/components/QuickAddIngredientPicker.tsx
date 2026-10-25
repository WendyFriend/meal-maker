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
import { useMobilePicker } from '../../hooks/useMobilePicker';
import type {
    DietaryPreference,
    UserIngredient,
} from '../../../shared/types/types';
import { getDietConflicts } from '../../utils/diet';
import { normalizeIngredientName } from '../../utils/Ingredient';
import { positionPopover } from '../../utils/positionPopover';
import {
    getQuickAddOptions,
    quickAddCategories,
    type QuickAddCategory,
    type QuickAddCategoryId,
} from './quickAddIngredients';
import './BottomSheet.css';
import './QuickAddIngredientPicker.css';

const categoryIconPaths: Record<QuickAddCategoryId, string> = {
    vegetables:
        'M16 28V14M16 21C7 22 5 17 5 12c7-1 11 2 11 9ZM16 15c-1-8 3-12 10-12 1 7-2 12-10 12Z',
    proteins:
        'M11 21c-6-3-6-9-2-13s10-4 13 0 1 10-5 12l-5 6-3-3 2-2ZM10 25l-3 3a3 3 0 0 1-4-4l4-3M11 11c2-2 5-3 7-1',
    grains: 'm10 29 12-25M15 19C7 20 6 16 6 13c6 0 9 2 9 6ZM19 12c-7-1-8-4-7-8 5 1 7 4 7 8ZM16 19c1-6 5-8 10-6-1 5-5 7-10 6Z',
    'nuts-seeds': 'M7 26C3 15 10 6 26 3c2 15-5 25-19 23Z',
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
    mobile: boolean;
    trigger: HTMLButtonElement;
    categoriesRef: RefObject<HTMLDivElement | null>;
    onClose: () => void;
    children: ReactNode;
};

function PickerOverlay({
    id,
    mobile,
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
            if (mobile) return;
            positionPopover(dialog, trigger, {
                width: 380,
                maxHeight: 440,
                gap: 8,
            });
        }

        if (mobile) dialog.showModal();
        else dialog.show();
        position();
        dialog.focus({ preventScroll: true });

        const inertElements: { element: HTMLElement; wasInert: boolean }[] = [];
        const scrollLocks: {
            element: HTMLElement;
            overflow: string;
            gutter: string;
        }[] = [];
        if (mobile) {
            // Focus is already inside the portal before the background is made
            // inert. Native showModal also supplies browser-level inertness.
            for (const element of Array.from(document.body.children)) {
                if (!(element instanceof HTMLElement) || element === dialog)
                    continue;
                inertElements.push({
                    element,
                    wasInert: element.hasAttribute('inert'),
                });
                element.setAttribute('inert', '');
            }
            // This app scrolls .page-transition, rather than only the body.
            const scrollers = new Set<HTMLElement>([
                document.documentElement,
                document.body,
            ]);
            let ancestor: HTMLElement | null = trigger.parentElement;
            while (ancestor) {
                if (/(auto|scroll)/.test(getComputedStyle(ancestor).overflowY))
                    scrollers.add(ancestor);
                ancestor = ancestor.parentElement;
            }
            for (const element of scrollers) {
                scrollLocks.push({
                    element,
                    overflow: element.style.overflow,
                    gutter: element.style.scrollbarGutter,
                });
                if (element.offsetWidth > element.clientWidth)
                    element.style.scrollbarGutter = 'stable';
                element.style.overflow = 'hidden';
            }
        }

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                onClose();
                return;
            }
            if (!mobile || event.key !== 'Tab') return;
            const buttons = Array.from(
                dialog.querySelectorAll<HTMLButtonElement>(
                    'button:not(:disabled)',
                ),
            );
            const first = buttons[0];
            const last = buttons[buttons.length - 1];
            if (
                event.shiftKey &&
                (document.activeElement === first ||
                    document.activeElement === dialog)
            ) {
                event.preventDefault();
                last?.focus();
            } else if (
                !event.shiftKey &&
                (document.activeElement === last ||
                    document.activeElement === dialog)
            ) {
                event.preventDefault();
                first?.focus();
            }
        }

        function closeOnOutsidePointer(event: PointerEvent) {
            const target = event.target as Node;
            if (
                !mobile &&
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
            for (const { element, wasInert } of inertElements)
                element.toggleAttribute('inert', wasInert);
            for (const { element, overflow, gutter } of scrollLocks) {
                element.style.overflow = overflow;
                element.style.scrollbarGutter = gutter;
            }
            dialog.close();
            if (trigger.isConnected) trigger.focus({ preventScroll: true });
        };
    }, [mobile, trigger, categoriesRef, onClose]);

    return createPortal(
        <dialog
            ref={dialogRef}
            id={id}
            tabIndex={-1}
            aria-labelledby={`${id}-title`}
            aria-modal={mobile ? true : undefined}
            className={`quick-add-picker ${mobile ? 'quick-add-picker-mobile bottom-sheet' : 'quick-add-picker-desktop'}`}
            onCancel={(event) => {
                event.preventDefault();
                onClose();
            }}
            onClick={(event) => {
                if (!mobile || event.target !== event.currentTarget) return;
                const bounds = event.currentTarget.getBoundingClientRect();
                if (
                    event.clientX < bounds.left ||
                    event.clientX > bounds.right ||
                    event.clientY < bounds.top ||
                    event.clientY > bounds.bottom
                )
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
    // Hide options that don't fit these diets (unless already selected).
    dietary?: DietaryPreference[];
    onToggleIngredient: (name: string) => void;
};

export default function QuickAddIngredientPicker({
    savedIngredients,
    selectedIngredients,
    dietary = [],
    onToggleIngredient,
}: QuickAddIngredientPickerProps) {
    const [active, setActive] = useState<{
        category: QuickAddCategory;
        trigger: HTMLButtonElement;
    } | null>(null);
    const mobile = useMobilePicker();
    const categoriesRef = useRef<HTMLDivElement>(null);
    const id = useId();
    const selected = new Set(selectedIngredients.map(normalizeIngredientName));
    const options = useMemo(
        () =>
            active
                ? getQuickAddOptions(savedIngredients, active.category.id)
                : [],
        [savedIngredients, active],
    ).filter(
        (option) =>
            selected.has(normalizeIngredientName(option.name)) ||
            getDietConflicts(option.name, dietary).length === 0,
    );
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
                    mobile={mobile}
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
                        {options.map((option) => {
                            const isSelected = selected.has(
                                normalizeIngredientName(option.name),
                            );
                            return (
                                <button
                                    type="button"
                                    key={option.key}
                                    className="quick-add-option"
                                    aria-pressed={isSelected}
                                    onClick={() =>
                                        onToggleIngredient(option.name)
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
                                    <span>{option.name}</span>
                                    {option.saved && (
                                        <small
                                            className="quick-add-saved"
                                            aria-hidden="true"
                                            title="Saved in My Ingredients"
                                        >
                                            saved
                                        </small>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </PickerOverlay>
            )}
        </section>
    );
}
