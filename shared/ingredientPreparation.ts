type Preparation = {
    title: string;
    tips: string[];
    source?: { label: string; url: string };
};
const pulses = {
    label: 'USA Pulses cooking guide',
    url: 'https://usapulses.org/how-to-prepare/',
};

export function getIngredientPreparation(
    name: string,
    customTips?: string[],
): Preparation {
    if (customTips !== undefined) {
        return { title: 'Your preparation tips', tips: customTips };
    }
    const food = name.toLowerCase();
    const legume =
        /\b(chickpeas?|garbanzos?|lentils?|kidney beans?|cannellini|black beans?|pinto beans?|navy beans?|white beans?|split peas?)\b/.test(
            food,
        );
    if (!/\b(flour|powder|extract|sauce)\b/.test(food)) {
        if (
            legume &&
            /\b(canned|tinned|cooked|boiled|ready.to.eat)\b/.test(food) &&
            !/\b(uncooked|dried|dry)\b/.test(food)
        ) {
            return {
                title: 'Already cooked',
                tips: [
                    'Canned pulses need no soaking. Drain and rinse, then use in your recipe. For packaged cooked pulses, follow the reheating directions.',
                ],
                source: pulses,
            };
        }
        if (/\b(kidney beans?|cannellini)\b/.test(food)) {
            return {
                title: 'Starting with dried kidney beans',
                tips: [
                    'Soak for at least 5 hours, discard the water and rinse.',
                    'Boil vigorously in fresh water for at least 30 minutes, then continue cooking until tender. Proper boiling destroys the lectin toxin; soaking alone does not.',
                    'Do not use a slow cooker alone to cook dried kidney beans. Follow an appliance-tested recipe if pressure cooking.',
                ],
                source: {
                    label: 'FDA: natural toxins in food',
                    url: 'https://www.fda.gov/food/chemical-contaminants-pesticides/natural-toxins-food',
                },
            };
        }
        if (/\b(chickpeas?|garbanzos?)\b/.test(food)) {
            return {
                title: 'Starting with dried chickpeas',
                tips: [
                    'Soak 8–24 hours, then discard the soaking water and rinse.',
                    'Bring to a boil in fresh water, then simmer 90–120 minutes, until tender.',
                    'Electric pressure cooker: soaked chickpeas take about 15 minutes on high, with 15 minutes of natural release. Follow appliance water and fill limits.',
                ],
                source: pulses,
            };
        }
        if (/\blentils?\b/.test(food)) {
            return {
                title: 'Starting with dried lentils',
                tips: [
                    'Rinse and sort; soaking is unnecessary.',
                    'Simmer whole lentils 20–40 minutes until tender; split red lentils usually take 5–10 minutes.',
                    'Pressure cook whole lentils on low for 10–15 minutes, then release naturally. This guide excludes red lentils from pressure cooking.',
                ],
                source: pulses,
            };
        }
        if (/\b(black|pinto|navy|white) beans?\b/.test(food)) {
            const pressureTip = /\bwhite beans?\b/.test(food)
                ? 'For pressure cooking, follow your appliance’s tested instructions for the specific variety of white bean.'
                : `Electric pressure cooker: unsoaked beans take about ${/\bnavy\b/.test(food) ? '25–30' : '25'} minutes on high. Naturally release for at least 20 minutes. Follow appliance fill limits.`;
            return {
                title: 'Starting with dried beans',
                tips: [
                    'Soak overnight (about 8 hours), drain and rinse. Cook in fresh water for 1–2 hours until tender.',
                    pressureTip,
                ],
                source: pulses,
            };
        }
        if (/\bspinach\b/.test(food)) {
            return {
                title: 'Optional: reduce soluble oxalate',
                tips: [
                    'Boiling spinach in water and draining it can lower soluble oxalate. Discard the cooking water if this is your goal; a quick blanch does not guarantee the same reduction.',
                    'This is an optional preparation choice, not a requirement for everyone to eat spinach. The nutrition figures above describe the listed food, not an estimate of nutrients after additional cooking.',
                ],
                source: {
                    label: 'Research: cooking and vegetable oxalate',
                    url: 'https://pubmed.ncbi.nlm.nih.gov/15826055/',
                },
            };
        }
    }
    return {
        title: 'Prepare for your recipe',
        tips: [
            'Follow the recipe and package directions for this ingredient. Cooking time depends on its form, portion size and preparation method.',
        ],
    };
}
