import type { MicronutrientKey } from '../../../shared/micronutrients';

export const MICRONUTRIENT_INFORMATION = {
    ironPer100g: {
        description:
            'Iron helps your blood carry oxygen around your body and supplies oxygen to your muscles. Your body also uses it for growth and to make certain hormones.',
        source: 'https://ods.od.nih.gov/factsheets/Iron-Consumer/',
    },
    calciumPer100g: {
        description:
            'Calcium gives bones and teeth their strength and structure. It also helps muscles contract and nerves send signals.',
        source: 'https://ods.od.nih.gov/factsheets/Calcium-Consumer/',
    },
    magnesiumPer100g: {
        description:
            'Magnesium supports normal muscle and nerve activity and helps regulate blood sugar and blood pressure. It is also involved in building bone, proteins and DNA.',
        source: 'https://ods.od.nih.gov/factsheets/Magnesium-Consumer/',
    },
    zincPer100g: {
        description:
            'Zinc supports your immune system and wound healing. Your body also needs it to make DNA and proteins and for normal growth.',
        source: 'https://ods.od.nih.gov/factsheets/Zinc-Consumer/',
    },
    seleniumPer100g: {
        description:
            'Selenium helps your thyroid make and use hormones. It also supports reproduction, DNA production and the protection of your cells.',
        source: 'https://ods.od.nih.gov/factsheets/Selenium-Consumer/',
    },
    folatePer100g: {
        description:
            'Folate is a B vitamin that helps cells make DNA and divide. This makes it important for normal growth and the production of new cells. DFE means dietary folate equivalents, which account for differences in absorption.',
        source: 'https://ods.od.nih.gov/factsheets/Folate-Consumer/',
    },
    vitaminCPer100g: {
        description:
            'Vitamin C helps your body make collagen for tissue repair and wound healing. It also supports immune function, protects cells and helps you absorb iron from plant foods.',
        source: 'https://ods.od.nih.gov/factsheets/VitaminC-Consumer/',
    },
    vitaminB12Per100g: {
        description:
            'Vitamin B12 supports healthy nerves and red blood cells and helps your body make DNA. Getting enough helps prevent a type of anaemia that can cause tiredness and weakness.',
        source: 'https://ods.od.nih.gov/factsheets/VitaminB12-Consumer/',
    },
} satisfies Record<MicronutrientKey, { description: string; source: string }>;
