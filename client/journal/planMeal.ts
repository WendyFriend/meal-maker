import type { JournalEntry } from '../../shared/types/journal';
import type { MealIngredient } from '../../shared/types/types';
import { localDateValue, localDayBounds } from './nutrition';

/**
 * A time on `day` after every meal already planned, so a new meal is listed
 * last: meals without a manual position sort by time, after ordered ones.
 * Today uses the current time; other days start from midday.
 */
export function nextPlanTime(
    day: string,
    entries: Pick<JournalEntry, 'eatenAt'>[],
    now = new Date(),
) {
    const { start, end } = localDayBounds(day);
    const dayStart = Date.parse(start);
    const dayEnd = Date.parse(end);
    const base =
        localDateValue(now) === day ? now.getTime() : dayStart + 12 * 3600_000;
    const latest = Math.max(
        -Infinity,
        ...entries
            .map(({ eatenAt }) => Date.parse(eatenAt))
            .filter(Number.isFinite),
    );
    const at = Math.min(Math.max(base, latest + 1000), dayEnd - 1000);
    return new Date(Math.max(at, dayStart)).toISOString();
}

/** "Sunday lentils": the plan day's weekday and the first ingredient. */
export function defaultMealName(day: string, ingredients: MealIngredient[]) {
    const [year, month, date] = day.split('-').map(Number);
    const weekday = new Date(year, month - 1, date).toLocaleDateString(
        'en-AU',
        { weekday: 'long' },
    );
    // "Rice, cooked" reads as "rice".
    const food = ingredients[0]?.name.split(',')[0].trim().toLowerCase();
    return food ? `${weekday} ${food}` : `${weekday} meal`;
}
