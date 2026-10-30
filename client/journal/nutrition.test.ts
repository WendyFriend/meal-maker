import { describe, expect, it } from 'vitest';
import { localDayBounds } from './nutrition';
import { totalNutrition } from '../utils/nutrition';

describe('journal daily totals', () => {
    it('scales nutrients by actual portions and returns zero for an empty day', () => {
        expect(
            totalNutrition([
                {
                    name: 'Tofu',
                    weight: 150,
                    caloriesPer100g: 130,
                    proteinPer100g: 15,
                    carbohydratePer100g: 6,
                    fatPer100g: 4,
                },
            ]),
        ).toEqual({ calories: 195, protein: 22.5, carbohydrate: 9, fat: 6 });
        expect(totalNutrition([])).toEqual({
            calories: 0,
            protein: 0,
            carbohydrate: 0,
            fat: 0,
        });
    });
    it.each(['2026-10-04', '2026-04-05', '2026-12-31'])(
        'uses local midnight boundaries for %s, including daylight saving and year rollover',
        (day) => {
            const { start, end } = localDayBounds(day);
            const first = new Date(start),
                next = new Date(end);
            expect(first.getHours()).toBe(0);
            expect(next.getHours()).toBe(0);
            expect(next.getMinutes()).toBe(0);
            expect(next.getTime() - first.getTime()).toBe(
                86400000 +
                    (next.getTimezoneOffset() - first.getTimezoneOffset()) *
                        60000,
            );
            const last = new Date(next.getTime() - 1);
            expect(last.getDate()).toBe(first.getDate());
        },
    );
    it('rejects impossible dates', () => {
        expect(() => localDayBounds('2026-02-30')).toThrow();
    });
});
