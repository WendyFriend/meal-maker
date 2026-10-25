import { addDays, fromDateKey, toDateKey } from '../services/mealPlanService';

const weekday = new Intl.DateTimeFormat('en', { weekday: 'long' });
const weekdayShort = new Intl.DateTimeFormat('en', { weekday: 'short' });
const monthDay = new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
});
const longDate = new Intl.DateTimeFormat('en', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
});

/* "Today", "Tomorrow", "Yesterday", else "Thursday 29 Oct". */
export function formatDayTitle(dateKey: string, todayKey: string) {
    const date = fromDateKey(dateKey);

    if (dateKey === todayKey) return 'Today';
    if (dateKey === toDateKey(addDays(fromDateKey(todayKey), 1))) {
        return 'Tomorrow';
    }
    if (dateKey === toDateKey(addDays(fromDateKey(todayKey), -1))) {
        return 'Yesterday';
    }

    return `${weekday.format(date)} ${monthDay.format(date)}`;
}

/* "Sunday 25 October" */
export function formatLongDate(dateKey: string) {
    return longDate.format(fromDateKey(dateKey));
}

/* "Mon 27 Oct" */
export function formatShortDate(dateKey: string) {
    const date = fromDateKey(dateKey);

    return `${weekdayShort.format(date)} ${monthDay.format(date)}`;
}

export function formatWeekdayShort(dateKey: string) {
    return weekdayShort.format(fromDateKey(dateKey));
}

/* Whether a day is past what the plan lets you schedule. */
export function isBeyondPlanningWindow(
    dateKey: string,
    todayKey: string,
    daysAhead: number,
) {
    return dateKey > toDateKey(addDays(fromDateKey(todayKey), daysAhead));
}

/* "07:30" -> "7:30 am" */
export function formatTime(time?: string) {
    if (!time) return '';

    const [hours, minutes] = time.split(':').map(Number);

    if (Number.isNaN(hours) || Number.isNaN(minutes)) return time;

    const suffix = hours >= 12 ? 'pm' : 'am';

    return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${suffix}`;
}
