import { useId, useLayoutEffect, useRef, useState } from 'react';
import './MealGoalWheel.css';

type GoalOption = { label: string; value: number | undefined };

type MealGoalWheelProps = {
    label: string;
    options: GoalOption[];
    initialValue: number | undefined;
    active?: boolean;
    onValueChange: (value: number | undefined) => void;
};

const itemHeight = 44;

export default function MealGoalWheel({
    label,
    options,
    initialValue,
    active = true,
    onValueChange,
}: MealGoalWheelProps) {
    const listRef = useRef<HTMLDivElement>(null);
    const [initialIndex] = useState(() =>
        Math.max(
            0,
            options.findIndex((option) => option.value === initialValue),
        ),
    );
    const currentIndex = useRef(initialIndex);
    const [selectedIndex, setSelectedIndex] = useState(initialIndex);
    const optionId = useId();

    useLayoutEffect(() => {
        if (active && listRef.current)
            listRef.current.scrollTop = currentIndex.current * itemHeight;
    }, [active]);

    function selectFromScroll(element: HTMLDivElement) {
        const next = Math.max(
            0,
            Math.min(
                options.length - 1,
                Math.round(element.scrollTop / itemHeight),
            ),
        );
        if (next === currentIndex.current) return;
        currentIndex.current = next;
        setSelectedIndex(next);
        onValueChange(options[next].value);
    }

    function scrollToIndex(index: number) {
        listRef.current?.scrollTo({
            top: index * itemHeight,
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)')
                .matches
                ? 'auto'
                : 'smooth',
        });
    }

    return (
        <div className="meal-goal-wheel">
            <div className="meal-goal-wheel-selection" aria-hidden="true" />
            <div
                ref={listRef}
                className="meal-goal-wheel-list"
                role="listbox"
                aria-label={label}
                aria-orientation="vertical"
                aria-activedescendant={`${optionId}-${selectedIndex}`}
                tabIndex={0}
                onScroll={(event) => selectFromScroll(event.currentTarget)}
                onKeyDown={(event) => {
                    let next = currentIndex.current;
                    if (event.key === 'ArrowUp') next -= 1;
                    else if (event.key === 'ArrowDown') next += 1;
                    else if (event.key === 'Home') next = 0;
                    else if (event.key === 'End') next = options.length - 1;
                    else return;
                    event.preventDefault();
                    scrollToIndex(
                        Math.max(0, Math.min(options.length - 1, next)),
                    );
                }}
            >
                {options.map((option, index) => (
                    <button
                        key={option.value ?? 'none'}
                        id={`${optionId}-${index}`}
                        className="meal-goal-wheel-option"
                        type="button"
                        role="option"
                        aria-selected={index === selectedIndex}
                        data-empty={option.value === undefined}
                        tabIndex={-1}
                        onClick={() => scrollToIndex(index)}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
        </div>
    );
}
