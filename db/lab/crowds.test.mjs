// Tests for crowds.mjs: a count shown for a node must match what opens.
//
//   node --test db/lab/crowds.test.mjs
//
// Each case is a shape of data that once showed a number and then opened to
// nothing (or to less than the number said).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseAll } from './rules.mjs';
import { buildCrowds, checkCrowds, expand, rootRows } from './crowds.mjs';

const categories = ['Poultry Products', 'Dairy and Egg Products'];

const crowdsOf = (names) =>
    buildCrowds(
        parseAll(
            names.map((description, id) => [id, description, 'Test']),
            categories,
        ),
    );

const row = (crowds, label) => rootRows(crowds).find((r) => r.label === label);

test('a root whose terms all differ opens to them, with the plain foods separate (pheasant)', () => {
    const crowds = crowdsOf([
        'Pheasant, breast',
        'Pheasant, leg',
        'Pheasant, wing',
        'Pheasant, raw',
        'Pheasant, cooked',
    ]);
    const path = row(crowds, 'pheasant').path;

    const opened = expand(crowds, path);
    const labels = opened.rows.map((r) => r.label);

    assert.equal(row(crowds, 'pheasant').hits, 5);
    // Three one-food terms, and the two foods with no modifier at all.
    assert.deepEqual(labels, ['3 one-food terms', 'pheasant, no modifier']);
    assert.equal(expand(crowds, `${path}>~singles`).rows.length, 3);
    assert.equal(expand(crowds, `${path}>~plain`).foods.length, 2);
    assert.deepEqual(checkCrowds(crowds), []);
});

test('every food is reachable: groups, one-food terms and plain foods cover the root', () => {
    const crowds = crowdsOf([
        'Cheese, swiss',
        'Cheese, swiss, low sodium',
        'Cheese, cheddar',
        'Cheese, cheddar, low fat',
        'Cheese, feta',
        'Cheese, brie',
        'Cheese, raw',
    ]);

    const labels = expand(crowds, 'cheese').rows.map((r) => r.label);

    assert.ok(labels.includes('swiss cheese'));
    assert.ok(labels.includes('cheddar cheese'));
    assert.ok(labels.some((l) => l.endsWith('one-food terms')));
    assert.ok(labels.includes('cheese, no modifier'));
    // The check walks every row and proves each food is reached and counted.
    assert.deepEqual(checkCrowds(crowds), []);
});

test('a group bigger than the page limit says how many it is not listing', () => {
    const names = Array.from({ length: 12 }, (_, i) => `Cheese, swiss, variety ${'abcdefghijkl'[i]}`);
    const crowds = crowdsOf(names);
    const group = expand(crowds, 'cheese').rows.find((r) => r.label === 'swiss cheese');

    const opened = expand(crowds, group.path, { limit: 5 });

    assert.equal(opened.foods.length, 5);
    assert.equal(opened.more, 7);
    assert.equal(opened.foods.length + opened.more, group.hits);
});

test('longer names count toward the root they start with (ice cream)', () => {
    const crowds = crowdsOf([
        'Ice cream, vanilla',
        'Ice cream, chocolate',
        'Ice cream bar, covered with chocolate',
        'Ice cream bar, stick or nugget',
        'Ice cream cone, wafer',
        'Ice cream cone, sugar',
    ]);

    // The bar and cone foods are part of "ice cream", and nothing is listed twice.
    assert.equal(row(crowds, 'ice cream').hits, 6);
    assert.equal(rootRows(crowds).filter((r) => r.label.startsWith('ice cream')).length, 1);
    assert.deepEqual(checkCrowds(crowds), []);
});

test('a root made entirely of one group is listed as that group', () => {
    const crowds = crowdsOf(['Chard, swiss, raw', 'Chard, swiss, cooked', 'Chard, swiss, fresh']);

    const rows = rootRows(crowds);

    assert.equal(rows.length, 1);
    assert.equal(rows[0].label, 'swiss chard');
    assert.equal(expand(crowds, rows[0].path).foods.length, 3);
});
