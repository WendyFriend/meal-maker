import {
    useId,
    useLayoutEffect,
    useRef,
    useState,
    type KeyboardEvent,
    type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { positionPopover } from '../../utils/positionPopover';
import './CalorieDropdown.css';

export type CalorieOption = { label: string; value: string };

type CalorieDropdownProps = {
    id: string;
    triggerRef: RefObject<HTMLButtonElement | null>;
    options: CalorieOption[];
    value: string;
    onSelect: (value: string) => void;
    onClose: () => void;
};

export default function CalorieDropdown({
    id,
    triggerRef,
    options,
    value,
    onSelect,
    onClose,
}: CalorieDropdownProps) {
    const [activeIndex, setActiveIndex] = useState(() =>
        Math.max(
            0,
            options.findIndex((option) => option.value === value),
        ),
    );
    const panelRef = useRef<HTMLDivElement>(null);
    const typeahead = useRef({ text: '', time: 0 });
    const optionId = useId();

    useLayoutEffect(() => {
        const panelNode = panelRef.current;
        const triggerNode = triggerRef.current;
        if (!panelNode || !triggerNode) return;
        const panel = panelNode;
        const trigger = triggerNode;

        function position() {
            positionPopover(panel, trigger, {
                width: Math.max(trigger.getBoundingClientRect().width, 180),
                maxHeight: 264,
                gap: 6,
            });
        }

        function closeOutside(event: PointerEvent) {
            const target = event.target as Node;
            if (!panel.contains(target) && !trigger.contains(target)) onClose();
        }

        position();
        panel.focus({ preventScroll: true });
        document.addEventListener('pointerdown', closeOutside);
        window.addEventListener('resize', position);
        window.addEventListener('scroll', position, true);
        const observer =
            typeof ResizeObserver === 'undefined'
                ? null
                : new ResizeObserver(position);
        observer?.observe(trigger);
        const form = trigger.closest('.meal-maker-form');
        if (form) observer?.observe(form);
        return () => {
            document.removeEventListener('pointerdown', closeOutside);
            window.removeEventListener('resize', position);
            window.removeEventListener('scroll', position, true);
            observer?.disconnect();
            if (panel.contains(document.activeElement) && trigger.isConnected)
                trigger.focus({ preventScroll: true });
        };
    }, [triggerRef, onClose]);

    useLayoutEffect(() => {
        const panel = panelRef.current;
        const option = panel?.querySelector<HTMLElement>(
            `[data-index="${activeIndex}"]`,
        );
        if (!panel || !option) return;
        // Scroll only the dropdown, never the underlying form.
        const top = option.offsetTop;
        const bottom = top + option.offsetHeight;
        if (top < panel.scrollTop + 6) panel.scrollTop = Math.max(0, top - 6);
        else if (bottom > panel.scrollTop + panel.clientHeight - 6)
            panel.scrollTop = bottom - panel.clientHeight + 6;
    }, [activeIndex]);

    function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        const movements: Record<string, number> = {
            ArrowDown: 1,
            ArrowUp: -1,
            PageDown: 5,
            PageUp: -5,
        };
        if (
            event.key === 'Escape' ||
            (event.altKey && event.key === 'ArrowUp')
        ) {
            event.preventDefault();
            event.stopPropagation();
            onClose();
        } else if (event.key === 'Tab') {
            // Return to the trigger before the browser performs normal Tab navigation.
            onClose();
        } else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelect(options[activeIndex].value);
        } else if (event.key in movements) {
            event.preventDefault();
            setActiveIndex((index) =>
                Math.max(
                    0,
                    Math.min(options.length - 1, index + movements[event.key]),
                ),
            );
        } else if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            setActiveIndex(event.key === 'Home' ? 0 : options.length - 1);
        } else if (
            event.key.length === 1 &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.altKey
        ) {
            event.preventDefault();
            const now = Date.now();
            typeahead.current.text =
                (now - typeahead.current.time < 700
                    ? typeahead.current.text
                    : '') + event.key.toLowerCase();
            typeahead.current.time = now;
            const index = options.findIndex((option) =>
                option.label.toLowerCase().startsWith(typeahead.current.text),
            );
            if (index !== -1) setActiveIndex(index);
        }
    }

    return createPortal(
        <div
            ref={panelRef}
            id={id}
            className="calorie-dropdown"
            role="listbox"
            aria-label="Calorie goal"
            tabIndex={0}
            aria-activedescendant={`${optionId}-${activeIndex}`}
            onKeyDown={handleKeyDown}
        >
            {options.map((option, index) => (
                <button
                    type="button"
                    role="option"
                    tabIndex={-1}
                    key={option.value}
                    id={`${optionId}-${index}`}
                    data-index={index}
                    className="calorie-dropdown-option"
                    aria-label={
                        option.value === 'none'
                            ? option.label
                            : `${option.label} kcal`
                    }
                    aria-selected={value === option.value}
                    data-active={activeIndex === index}
                    onMouseDown={(event) => event.preventDefault()}
                    onPointerMove={() => setActiveIndex(index)}
                    onClick={() => onSelect(option.value)}
                >
                    <span>
                        {option.label}
                        {option.value !== 'none' && (
                            <span className="calorie-dropdown-unit"> kcal</span>
                        )}
                    </span>
                    {value === option.value && (
                        <svg viewBox="0 0 20 20" aria-hidden="true">
                            <path d="m4 10 4 4 8-8" />
                        </svg>
                    )}
                </button>
            ))}
        </div>,
        document.body,
    );
}
