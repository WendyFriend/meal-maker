import { expect, it } from 'vitest';
import { rankByCloseness, searchCloseness } from './Ingredient';

it('puts the food itself before foods that only start with its name', () => {
    const names = [
        'Pumpkin seeds',
        'Pumpkin, raw',
        'Pie, pumpkin',
        'Seeds, pumpkin and squash seed kernels, dried',
    ];
    expect(rankByCloseness(names, 'Pumpkin', (name) => name)).toEqual([
        'Pumpkin, raw',
        'Pumpkin seeds',
        'Pie, pumpkin',
        'Seeds, pumpkin and squash seed kernels, dried',
    ]);
});

it('treats an exact name and simple plurals as closest', () => {
    expect(searchCloseness('Pumpkin', 'pumpkin')).toBe(0);
    expect(searchCloseness('Pumpkins, raw', 'pumpkin')).toBe(1);
    expect(searchCloseness('Pumpkin, raw', 'pumpkins')).toBe(1);
    // Equally close results keep the order they came in.
    expect(
        rankByCloseness(['Tofu, firm', 'Tofu, silken'], 'tofu', (n) => n),
    ).toEqual(['Tofu, firm', 'Tofu, silken']);
});
