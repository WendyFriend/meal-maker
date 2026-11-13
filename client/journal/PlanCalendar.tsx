import { useState } from 'react';
import SlidingSheet from '../components/SlidingSheet';
import { localDateValue } from './nutrition';
import './PlanCalendar.css';

type PlanCalendarProps = {
    selectedDay: string;
    onSelect: (day: string) => void;
    onClose: () => void;
};

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function PlanCalendar({
    selectedDay,
    onSelect,
    onClose,
}: PlanCalendarProps) {
    const [selectedYear, selectedMonth] = selectedDay.split('-').map(Number);
    const [visibleMonth, setVisibleMonth] = useState(
        () => new Date(selectedYear, selectedMonth - 1, 1),
    );
    const year = visibleMonth.getFullYear();
    const month = visibleMonth.getMonth();
    const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = localDateValue();
    const monthLabel = visibleMonth.toLocaleDateString('en-AU', {
        month: 'long',
        year: 'numeric',
    });

    return (
        <SlidingSheet
            className="plan-calendar-sheet"
            label="Choose plan date"
            onClose={onClose}
            header={<h2>Choose date</h2>}
        >
            <div className="plan-calendar-month">
                <button
                    type="button"
                    aria-label="Previous month"
                    onClick={() =>
                        setVisibleMonth(new Date(year, month - 1, 1))
                    }
                >
                    <span aria-hidden="true">‹</span>
                </button>
                <strong aria-live="polite">{monthLabel}</strong>
                <button
                    type="button"
                    aria-label="Next month"
                    onClick={() =>
                        setVisibleMonth(new Date(year, month + 1, 1))
                    }
                >
                    <span aria-hidden="true">›</span>
                </button>
            </div>
            <div
                className="plan-calendar-grid"
                role="group"
                aria-label={monthLabel}
            >
                {weekdays.map((weekday) => (
                    <span className="plan-calendar-weekday" key={weekday}>
                        {weekday}
                    </span>
                ))}
                {Array.from({ length: firstWeekday }, (_, index) => (
                    <span key={`empty-${index}`} aria-hidden="true" />
                ))}
                {Array.from({ length: daysInMonth }, (_, index) => {
                    const date = new Date(year, month, index + 1);
                    const value = localDateValue(date);
                    const fullDate = date.toLocaleDateString('en-AU', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                    });
                    return (
                        <button
                            key={value}
                            type="button"
                            className="plan-calendar-day"
                            aria-label={`Choose ${fullDate}`}
                            aria-pressed={value === selectedDay}
                            data-today={value === today}
                            onClick={() => onSelect(value)}
                        >
                            {index + 1}
                        </button>
                    );
                })}
            </div>
            <button
                type="button"
                className="plan-calendar-today"
                onClick={() => onSelect(today)}
            >
                Today
            </button>
        </SlidingSheet>
    );
}
