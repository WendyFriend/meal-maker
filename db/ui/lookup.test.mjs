// Tests for cleanTranscript().
//
// Speech returns sentence punctuation, so "tomato" arrives as "Tomato." That
// full stop was breaking the exact synonym match in the resolver and dropping
// the query to the fuzzy tier, where the model picked "Tomatoes, green, raw".
// These cases pin the behaviour that caused it.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cleanTranscript, parseAnalysis, parseTargets } from './lookup.mjs';

test('strips a trailing full stop', () => {
    assert.equal(cleanTranscript('Tomato.'), 'Tomato');
});

test('strips a trailing question or exclamation mark', () => {
    assert.equal(cleanTranscript('Tomato?'), 'Tomato');
    assert.equal(cleanTranscript('Tomato!'), 'Tomato');
});

test('strips leading and trailing whitespace', () => {
    assert.equal(cleanTranscript('   tomatoes  '), 'tomatoes');
});

test('collapses internal runs of whitespace', () => {
    assert.equal(cleanTranscript('green   tomato'), 'green tomato');
});

test('keeps the interior comma in a USDA-style name', () => {
    assert.equal(cleanTranscript('tomato, red'), 'tomato, red');
});

test('keeps interior hyphens', () => {
    assert.equal(cleanTranscript('extra-virgin olive oil'), 'extra-virgin olive oil');
});

test('handles quotes around the whole phrase', () => {
    assert.equal(cleanTranscript('"tomato"'), 'tomato');
});

test('handles a period ending a quote', () => {
    assert.equal(cleanTranscript('"tomato."'), 'tomato');
});

test('handles empty and nullish input', () => {
    assert.equal(cleanTranscript(''), '');
    assert.equal(cleanTranscript(null), '');
    assert.equal(cleanTranscript(undefined), '');
});

test('handles punctuation-only input', () => {
    assert.equal(cleanTranscript('...'), '');
});

test('leaves non-latin scripts intact', () => {
    assert.equal(cleanTranscript('  échalote '), 'échalote');
});

test('strips a trailing ellipsis but keeps the word', () => {
    assert.equal(cleanTranscript('tomato...'), 'tomato');
});

// ---------------------------------------------------------------------------
// parseAnalysis: reading the model's split/correct reply.
//
// Only reached when the rules found nothing trustworthy, so a bad reply must
// degrade to "no opinion" rather than throwing or inventing an item.
// ---------------------------------------------------------------------------

test('splits a spoken list into separate foods', () => {
    const out = parseAnalysis('{"items":["tomatoes","potatoes","egg","tofu"]}');
    assert.deepEqual(out.items, ['tomatoes', 'potatoes', 'egg', 'tofu']);
});

test('reads a single corrected item', () => {
    const out = parseAnalysis('{"items":["broccoli"]}');
    assert.deepEqual(out.items, ['broccoli']);
});

test('tolerates a fenced JSON reply', () => {
    const out = parseAnalysis('```json\n{"items":["tofu","egg"]}\n```');
    assert.deepEqual(out.items, ['tofu', 'egg']);
});

test('tolerates prose before and after the JSON', () => {
    const out = parseAnalysis('Sure! Here you go: {"items":["tofu"]} Hope that helps.');
    assert.deepEqual(out.items, ['tofu']);
});

test('lowercases and trims each item', () => {
    const out = parseAnalysis('{"items":["  Tomatoes  ","EGG"]}');
    assert.deepEqual(out.items, ['tomatoes', 'egg']);
});

test('drops edge punctuation the model echoed back', () => {
    const out = parseAnalysis('{"items":["tomatoes,","egg."]}');
    assert.deepEqual(out.items, ['tomatoes', 'egg']);
});

test('drops duplicates that differ only by case', () => {
    const out = parseAnalysis('{"items":["tomato","Tomato","TOMATO"]}');
    assert.deepEqual(out.items, ['tomato']);
});

test('drops empty and too-short entries', () => {
    const out = parseAnalysis('{"items":["","a","egg"]}');
    assert.deepEqual(out.items, ['egg']);
});

test('ignores non-string entries', () => {
    const out = parseAnalysis('{"items":[42,null,{"a":1},"tofu"]}');
    assert.deepEqual(out.items, ['tofu']);
});

test('caps the fan-out so one reply cannot trigger unlimited lookups', () => {
    const many = JSON.stringify({ items: Array.from({ length: 20 }, (_, i) => `food${i}`) });
    assert.equal(parseAnalysis(many).items.length, 8);
});

test('returns null when there is no JSON at all', () => {
    assert.equal(parseAnalysis('I am not sure what you mean.'), null);
});

test('returns null on malformed JSON', () => {
    assert.equal(parseAnalysis('{"items":["tofu"'), null);
});

test('returns null when items is missing or empty', () => {
    assert.equal(parseAnalysis('{"food":[1,2]}'), null);
    assert.equal(parseAnalysis('{"items":[]}'), null);
});

test('returns null for nullish input', () => {
    assert.equal(parseAnalysis(null), null);
    assert.equal(parseAnalysis(undefined), null);
    assert.equal(parseAnalysis(''), null);
});

// ---------------------------------------------------------------------------
// parseTargets: the stated nutrition figures ("30% protein", "500 calories").
// Display only for now. A chip that is quietly wrong is worse than no chip, so
// dubious entries are dropped rather than coerced.
// ---------------------------------------------------------------------------

test('keeps a stated protein goal in grams', () => {
    assert.deepEqual(parseTargets([{ nutrient: 'protein', amount: 30, unit: 'g' }]), [
        { nutrient: 'protein', amount: 30, unit: 'g' },
    ]);
});

test('keeps a stated percentage goal', () => {
    assert.deepEqual(parseTargets([{ nutrient: 'protein', amount: 30, unit: '%' }]), [
        { nutrient: 'protein', amount: 30, unit: '%' },
    ]);
});

test('defaults calories to kcal when the unit is missing', () => {
    assert.deepEqual(parseTargets([{ nutrient: 'calories', amount: 500 }]), [
        { nutrient: 'calories', amount: 500, unit: 'kcal' },
    ]);
});

test('folds "cal" and "calories" onto kcal', () => {
    assert.equal(parseTargets([{ nutrient: 'calories', amount: 500, unit: 'cal' }])[0].unit, 'kcal');
    assert.equal(
        parseTargets([{ nutrient: 'calories', amount: 500, unit: 'calories' }])[0].unit,
        'kcal',
    );
});

test('canonicalises nutrient aliases', () => {
    assert.equal(parseTargets([{ nutrient: 'carbohydrates', amount: 20 }])[0].nutrient, 'carbs');
    assert.equal(parseTargets([{ nutrient: 'Carbs', amount: 20 }])[0].nutrient, 'carbs');
    assert.equal(parseTargets([{ nutrient: 'fiber', amount: 5 }])[0].nutrient, 'fibre');
});

test('defaults sodium and cholesterol to mg', () => {
    assert.equal(parseTargets([{ nutrient: 'sodium', amount: 400 }])[0].unit, 'mg');
    assert.equal(parseTargets([{ nutrient: 'cholesterol', amount: 100 }])[0].unit, 'mg');
});

test('accepts a numeric string amount', () => {
    assert.equal(parseTargets([{ nutrient: 'protein', amount: '30' }])[0].amount, 30);
});

test('drops unknown nutrients', () => {
    assert.deepEqual(parseTargets([{ nutrient: 'unobtainium', amount: 5 }]), []);
});

test('drops non-numeric amounts instead of coercing to NaN', () => {
    assert.deepEqual(parseTargets([{ nutrient: 'protein', amount: 'lots' }]), []);
    assert.deepEqual(parseTargets([{ nutrient: 'protein', amount: '' }]), []);
    assert.deepEqual(parseTargets([{ nutrient: 'protein', amount: true }]), []);
});

test('drops zero and negative amounts', () => {
    assert.deepEqual(parseTargets([{ nutrient: 'protein', amount: 0 }]), []);
    assert.deepEqual(parseTargets([{ nutrient: 'protein', amount: -5 }]), []);
});

test('drops a percentage above 100', () => {
    assert.deepEqual(parseTargets([{ nutrient: 'protein', amount: 130, unit: '%' }]), []);
});

test('drops an implausible gram figure', () => {
    // A mis-transcribed "3000g protein" should not be shown as a claim.
    assert.deepEqual(parseTargets([{ nutrient: 'protein', amount: 3000, unit: 'g' }]), []);
});

test('keeps one target per nutrient and unit', () => {
    const out = parseTargets([
        { nutrient: 'protein', amount: 30, unit: 'g' },
        { nutrient: 'protein', amount: 40, unit: 'g' },
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].amount, 30);
});

test('keeps the same nutrient in different units', () => {
    // "30g protein and 30% protein" are two different claims.
    const out = parseTargets([
        { nutrient: 'protein', amount: 30, unit: 'g' },
        { nutrient: 'protein', amount: 30, unit: '%' },
    ]);
    assert.equal(out.length, 2);
});

test('ignores non-object entries', () => {
    assert.deepEqual(parseTargets(['protein', 42, null]), []);
});

test('returns an empty array for nullish or non-array input', () => {
    assert.deepEqual(parseTargets(null), []);
    assert.deepEqual(parseTargets(undefined), []);
    assert.deepEqual(parseTargets({}), []);
});

test('parseAnalysis carries targets through', () => {
    const out = parseAnalysis(
        '{"items":["tofu"],"targets":[{"nutrient":"protein","amount":30,"unit":"g"}]}',
    );
    assert.deepEqual(out.targets, [{ nutrient: 'protein', amount: 30, unit: 'g' }]);
});

test('parseAnalysis defaults targets to an empty array when absent', () => {
    const out = parseAnalysis('{"items":["tofu"]}');
    assert.deepEqual(out.targets, []);
});

test('targets never veto a readable reply', () => {
    // A nonsense targets array must not lose the item that was parsed.
    const out = parseAnalysis('{"items":["tofu"],"targets":"nonsense"}');
    assert.deepEqual(out.items, ['tofu']);
    assert.deepEqual(out.targets, []);
});
