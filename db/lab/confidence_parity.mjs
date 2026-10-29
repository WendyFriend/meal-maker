// Checks that confidence.mjs scores exactly like train_confidence.py.
//   node confidence_parity.mjs <model.json> <parity_cases.json>
// Prints the largest difference in probability; exits 1 if it is above 1e-9.
import { readFileSync } from 'node:fs';
import { featuresOf, probability } from './confidence.mjs';

const model = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const cases = JSON.parse(readFileSync(process.argv[3], 'utf8'));
let worst = 0;
for (const c of cases) {
    worst = Math.max(worst, Math.abs(probability(model, featuresOf(c.query, c.rows)) - c.p));
}
console.log(JSON.stringify({ cases: cases.length, max_diff: worst }));
process.exit(worst > 1e-9 ? 1 : 0);
