/** Diets Nutrition Lab can generate meals for (`requirements.dietary`). */
export const DIETS = [
    { id: 'vegan', label: 'Vegan' },
    { id: 'vegetarian', label: 'Vegetarian' },
    { id: 'gluten-free', label: 'Gluten-free' },
    { id: 'dairy-free', label: 'Dairy-free' },
] as const;

export type Diet = (typeof DIETS)[number]['id'];

export function isDiet(value: unknown): value is Diet {
    return DIETS.some(({ id }) => id === value);
}
