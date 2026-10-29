// Tests for the global naming rules (rules.mjs).
//
//   node --test db/lab/rules.test.mjs
//
// A tiny stand-in dataset: enough sibling names for the learned rules (which
// states exist) to have something to learn from.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { joinTerm, normalize, parseAll, splitName } from './rules.mjs';

const categories = [
    'Dairy and Egg Products',
    'Beverages',
    'Breakfast Cereals',
    'Alcoholic Beverages',
    'Beef Products',
];

const names = [
    'Egg, whole, raw, fresh',
    'Egg, whole, cooked, hard-boiled',
    'Egg, white, raw, fresh',
    'Egg, white, dried',
    'Peppers, sweet, red, raw',
    'Peppers, sweet, red, canned',
    'Peppers, sweet, green, raw',
    'Peppers, sweet, green, cooked, boiled',
    'Milk, whole, fluid',
    'Milk, buttermilk, fluid',
    'Beverages, carbonated, cola',
    'Cereals ready-to-eat, QUAKER, oat bran',
    'Oscar Mayer, bologna',
    'Alcoholic beverage, beer, regular',
    'Beef, ground, raw',
];

const foods = parseAll(
    names.map((description, id) => [id, description, 'Test']),
    categories,
);
const byName = (start) => foods.find((f) => f.description.startsWith(start));
const shelf = new Set(['beverages', 'cereals']);

test('parentheses are aliases, not name words', () => {
    const { segments, aliases } = splitName(
        'Chickpeas (garbanzo beans, bengal gram), mature seeds, raw',
        shelf,
    );

    assert.equal(segments[0], 'Chickpeas');
    assert.deepEqual(aliases, ['garbanzo beans', 'bengal gram']);
});

test('ALL-CAPS words are a brand and are removed', () => {
    const { segments, brand } = splitName('Cereals ready-to-eat, QUAKER, oat bran', shelf);

    assert.equal(brand, true);
    assert.ok(!segments.join('|').match(/quaker/i));
});

test('notes after a connector word and number notes are dropped', () => {
    const { segments } = splitName(
        'Milk, reduced fat, fluid, 2% milkfat, with added vitamin A',
        shelf,
    );

    assert.deepEqual(segments, ['Milk', 'reduced fat', 'fluid']);
});

test('several capitalised words are a brand; one is not', () => {
    assert.equal(splitName('Oscar Mayer, bologna', shelf).brand, true);
    assert.equal(splitName('Ice cream, vanilla', shelf).brand, false);
});

test('states are learned from siblings of "raw"; modifiers are left alone', () => {
    const egg = byName('Egg, whole, raw');

    assert.equal(egg.core, 'Egg');
    assert.deepEqual(egg.mods, ['whole']);
    assert.ok(egg.states.includes('raw'));
});

test('search terms come out in natural order', () => {
    assert.ok(byName('Egg, whole, raw').terms.includes('whole egg'));
    assert.ok(byName('Egg, whole, raw').terms.includes('raw egg'));

    const pepper = byName('Peppers, sweet, red, raw').terms;
    for (const term of ['sweet pepper', 'red pepper', 'red sweet pepper']) {
        assert.ok(pepper.includes(term), term);
    }
});

test('words after a shelf label are a qualifier, not the food', () => {
    const cereal = byName('Cereals ready-to-eat');

    assert.equal(cereal.core, 'oat bran');
    assert.ok(cereal.states.includes('ready-to-eat'));
    assert.equal(cereal.brand, true);
});

test('a multi-word shelf label is dropped; "Beef" is a food, not a shelf', () => {
    assert.equal(byName('Alcoholic beverage').core, 'beer');
    assert.equal(byName('Beef, ground').core, 'Beef');
});

test('joinTerm puts the modifier first without repeating the noun', () => {
    assert.equal(joinTerm('sweet', 'peppers'), 'sweet pepper');
    assert.equal(joinTerm('buttermilk', 'milk'), 'buttermilk');
});

test('normalize folds plurals', () => {
    assert.equal(normalize('Peaches'), 'peach');
    assert.equal(normalize('Berries'), 'berry');
    assert.equal(normalize('Beans'), 'bean');
});
