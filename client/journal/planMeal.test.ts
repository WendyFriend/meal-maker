import { describe, expect, it } from 'vitest';
import { defaultMealName, nextPlanTime } from './planMeal';
import { localDayBounds } from './nutrition';

const lentils = {
    name: 'Lentils',
    weight: 100,
    caloriesPer100g: 116,
    proteinPer100g: 9,
    carbohydratePer100g: 20,
    fatPer100g: 0.4,
};

describe('plan meal helpers', () => {
    it('names a meal after the plan weekday and its first ingredient', () => {
        expect(defaultMealName('2026-11-15', [lentils])).toBe('Sunday lentils');
        expect(
            defaultMealName('2026-11-16', [
                { ...lentils, name: 'Rice, cooked' },
            ]),
        ).toBe('Monday rice');
    });

    it('places a new meal after the latest planned meal of that day', () => {
        const day = '2026-11-15';
        const { start, end } = localDayBounds(day);
        const late = new Date(Date.parse(start) + 20 * 3600_000).toISOString();
        const at = nextPlanTime(day, [{ eatenAt: late }], new Date(2026, 0, 1));
        expect(Date.parse(at)).toBeGreaterThan(Date.parse(late));
        expect(Date.parse(at)).toBeLessThan(Date.parse(end));
    });

    it('uses the current time for today and midday for other days', () => {
        const now = new Date(2026, 10, 15, 9, 30);
        expect(nextPlanTime('2026-11-15', [], now)).toBe(now.toISOString());
        expect(nextPlanTime('2026-11-16', [], now)).toBe(
            new Date(2026, 10, 16, 12).toISOString(),
        );
    });
});
