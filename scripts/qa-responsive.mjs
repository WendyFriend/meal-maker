/*
 * Local responsive layout report.
 * Drives the real app at a given viewport and reports layout metrics.
 */
export const previewWidths = [1440, 1024, 768, 390, 360];

export default async function run(page) {
    const report = {};

    for (const width of previewWidths) {
        await page.setViewportSize({ width, height: 1000 });
        await page.waitForTimeout(300);

        const metrics = await page.evaluate(() => {
            const docEl = document.documentElement;
            const overflowX = docEl.scrollWidth - docEl.clientWidth;
            const hero = document.querySelector('.meal-maker-hero');
            const form = document.querySelector('.meal-maker-form');
            const nav = document.querySelector('.page-header-nav');
            const heroStyle = hero ? getComputedStyle(hero) : null;
            const cols = heroStyle
                ? heroStyle.gridTemplateColumns || heroStyle.flexDirection
                : null;

            return {
                overflowX,
                heroLayout: cols,
                navVisible: !!nav && nav.offsetParent !== null,
                formWidth: form
                    ? Math.round(form.getBoundingClientRect().width)
                    : null,
                docWidth: docEl.clientWidth,
            };
        });

        report[width] = metrics;
    }

    return report;
}
