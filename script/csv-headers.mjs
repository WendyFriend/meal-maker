// Prints the exact header line of each SR Legacy CSV, so the loader's column
// lists can be checked against reality rather than assumed.
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';

const DIR = 'data/usda/FoodData_Central_sr_legacy_food_csv_2018-04';
const FILES = [
    'food.csv',
    'food_nutrient.csv',
    'nutrient.csv',
    'food_category.csv',
    'food_portion.csv',
];

for (const file of FILES) {
    const rl = createInterface({
        input: createReadStream(join(DIR, file), 'utf8'),
        crlfDelay: Infinity,
    });
    for await (const line of rl) {
        const bom = line.startsWith('\uFEFF') ? ' [BOM]' : '';
        console.log(`${file}${bom}`);
        console.log(`  ${line.replace(/^\uFEFF/, '')}`);
        const cols = line.replace(/^\uFEFF/, '').split(',');
        console.log(`  -> ${cols.length} columns\n`);
        break;
    }
}
