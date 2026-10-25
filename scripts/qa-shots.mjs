/*
 * Local responsive screenshots.
 * Screenshots the app at the five required widths.
 */
import { previewWidths } from './qa-responsive.mjs';

export default async function run(page) {
    const shots = [];

    for (const width of previewWidths) {
        await page.setViewportSize({ width, height: 1000 });
        await page.waitForTimeout(400);
        const path = `/tmp/mm-${width}.png`;
        await page.screenshot({ path, fullPage: true });
        shots.push({ width, path });
    }

    return shots;
}
