export type GenerateMealInput = {
    nutrition: IngredientNutrition[];

    requirements: {
        calories?: number;
        proteinPercentage?: number;
    };
};

export type IngredientNutrition = {
    name: string;
    caloriesPer100g: number;
    proteinPer100g: number;
    carbohydratePer100g: number;
    fatPer100g: number;
    saturatedFatPer100g: number;
    fiberPer100g: number;
};

export type GeneratedMeal = {
    meal: Meal;
};

export type Meal = {
    ingredients: MealIngredient[];
};

export type MealIngredient = IngredientNutrition & {
    amount: number;
};

/**
 * ============================================================
 * CONFIGURATION
 * ============================================================
 */

const INGREDIENT_STEP = 5;
const VEGETABLE_STEP = 10;

const MIN_AMOUNT = 5;

const MIN_CALORIE_DENSITY = 0.75;
const MAX_CALORIE_DENSITY = 0.85;

const TARGET_VEGETABLE_PERCENTAGE = 0.5;

/**
 * We use the middle of the preferred calorie-density range
 * as the ideal meal structure.
 *
 * (0.75 + 0.85) / 2 = 0.80 kcal/g
 */
const PREFERRED_CALORIE_DENSITY =
    (MIN_CALORIE_DENSITY + MAX_CALORIE_DENSITY) / 2;

/**
 * Vegetables are generated around the preferred vegetable
 * weight, in 10g increments.
 *
 * Example:
 *
 * 500 kcal
 * preferred meal weight = 500 / 0.8 = 625g
 * preferred vegetables = 312.5g
 *
 * generated totals:
 *
 * 290, 300, 310, 320, 330
 */
const VEGETABLE_TARGET_VARIATION = 20;

/**
 * When there are multiple carb or protein sources,
 * prefer each ingredient to receive a meaningful amount.
 */
const PREFERRED_MIN_GROUP_AMOUNT = 20;

/**
 * Keep only the best partial candidates.
 */
const BEAM_WIDTH = 500;

/**
 * Maximum amount considered for a single ingredient.
 */
const MAX_AMOUNT = 400;

/**
 * Final candidates can be searched slightly outside
 * the preferred calorie range.
 */
const MAX_SEARCH_CALORIE_RATIO = 1.15;

const PROTEIN_TOLERANCE = 0.05;

type DistributionGroup = 'vegetable' | 'protein' | 'carb' | 'other';

type ClassifiedIngredient = {
    index: number;
    ingredient: IngredientNutrition;
    group: DistributionGroup;
};

type Candidate = {
    amounts: number[];
};

type MealTotals = {
    calories: number;

    protein: number;
    carbohydrates: number;
    fat: number;
    saturatedFat: number;
    fiber: number;

    proteinPercentage: number;
    carbohydratePercentage: number;
    fatPercentage: number;
    saturatedFatPercentage: number;
};

/**
 * ============================================================
 * MAIN
 * ============================================================
 */

export function generateMeal(input: GenerateMealInput): GeneratedMeal {
    const { nutrition, requirements } = input;

    if (nutrition.length === 0) {
        return {
            meal: {
                ingredients: [],
            },
        };
    }

    const classified = nutrition.map(
        (ingredient, index): ClassifiedIngredient => ({
            index,
            ingredient,
            group: classifyIngredient(ingredient, requirements),
        }),
    );

    const vegetables = classified.filter((item) => item.group === 'vegetable');

    const proteins = classified.filter((item) => item.group === 'protein');

    const carbs = classified.filter((item) => item.group === 'carb');

    const others = classified.filter((item) => item.group === 'other');

    /**
     * Start every ingredient at 5g.
     *
     * Group generation will replace these amounts.
     */
    let candidates: Candidate[] = [
        {
            amounts: nutrition.map(() => MIN_AMOUNT),
        },
    ];

    /**
     * 1. Allocate vegetables as a group.
     */
    if (vegetables.length > 0 && requirements.calories !== undefined) {
        candidates = generateVegetableCandidates(
            candidates,
            vegetables,
            requirements.calories,
        );

        candidates = keepBestPartialCandidates(
            candidates,
            nutrition,
            requirements,
            classified,
        );
    }

    /**
     * 2. Allocate protein sources.
     */
    if (proteins.length > 0) {
        candidates = expandGroup(
            candidates,
            proteins,
            nutrition,
            requirements,
            classified,
            'protein',
        );
    }

    /**
     * 3. Allocate carbohydrate sources.
     */
    if (carbs.length > 0) {
        candidates = expandGroup(
            candidates,
            carbs,
            nutrition,
            requirements,
            classified,
            'carb',
        );
    }

    /**
     * 4. Allocate other ingredients.
     */
    if (others.length > 0) {
        candidates = expandGroup(
            candidates,
            others,
            nutrition,
            requirements,
            classified,
            'other',
        );
    }

    /**
     * Find the best complete candidate.
     */
    let bestCandidate = candidates[0];
    let bestScore = calculateFinalScore(
        bestCandidate,
        nutrition,
        requirements,
        classified,
    );

    for (let i = 1; i < candidates.length; i++) {
        const candidate = candidates[i];

        const score = calculateFinalScore(
            candidate,
            nutrition,
            requirements,
            classified,
        );

        if (compareScores(score, bestScore) < 0) {
            bestCandidate = candidate;
            bestScore = score;
        }
    }

    return {
        meal: {
            ingredients: nutrition.map((ingredient, index) => ({
                ...ingredient,
                amount: bestCandidate.amounts[index],
            })),
        },
    };
}

/**
 * ============================================================
 * CLASSIFICATION
 * ============================================================
 *
 * Priority:
 *
 * vegetable
 * protein
 * carb
 * other
 */

function classifyIngredient(
    ingredient: IngredientNutrition,
    requirements: GenerateMealInput['requirements'],
): DistributionGroup {
    if (isNonStarchyVegetable(ingredient)) {
        return 'vegetable';
    }

    if (isProteinSource(ingredient, requirements)) {
        return 'protein';
    }

    if (isCarbSource(ingredient)) {
        return 'carb';
    }

    return 'other';
}

function isNonStarchyVegetable(ingredient: IngredientNutrition): boolean {
    return (
        ingredient.caloriesPer100g < 50 && ingredient.carbohydratePer100g < 10
    );
}

function isProteinSource(
    ingredient: IngredientNutrition,
    requirements: GenerateMealInput['requirements'],
): boolean {
    if (requirements.proteinPercentage === undefined) {
        return false;
    }

    return (
        getProteinCaloriePercentage(ingredient) > requirements.proteinPercentage
    );
}

function getProteinCaloriePercentage(ingredient: IngredientNutrition): number {
    if (ingredient.caloriesPer100g <= 0) {
        return 0;
    }

    return ((ingredient.proteinPer100g * 4) / ingredient.caloriesPer100g) * 100;
}

function isCarbSource(ingredient: IngredientNutrition): boolean {
    if (ingredient.caloriesPer100g <= 0) {
        return false;
    }

    return (
        ((ingredient.carbohydratePer100g * 4) / ingredient.caloriesPer100g) *
            100 >=
        40
    );
}

/**
 * ============================================================
 * VEGETABLE GENERATION
 * ============================================================
 *
 * Vegetables are treated as a group.
 *
 * We first decide the TOTAL vegetable weight, then
 * distribute that weight across all available vegetables.
 *
 * Vegetable totals use 10g increments.
 */

function generateVegetableCandidates(
    candidates: Candidate[],
    vegetables: ClassifiedIngredient[],
    calorieTarget: number,
): Candidate[] {
    const result: Candidate[] = [];

    const vegetableTotals = getPreferredVegetableTotals(calorieTarget);

    for (const candidate of candidates) {
        for (const vegetableTotal of vegetableTotals) {
            const distributions = generateEvenDistributions(
                vegetables.length,
                vegetableTotal,
                MIN_AMOUNT,
                VEGETABLE_STEP,
            );

            for (const distribution of distributions) {
                const amounts = [...candidate.amounts];

                for (let i = 0; i < vegetables.length; i++) {
                    amounts[vegetables[i].index] = distribution[i];
                }

                result.push({ amounts });
            }
        }
    }

    return result;
}

/**
 * Example for 500 kcal:
 *
 * preferred meal weight:
 *
 * 500 / 0.8 = 625g
 *
 * preferred vegetable weight:
 *
 * 625 * 0.5 = 312.5g
 *
 * We round to the nearest 10g:
 *
 * 310g
 *
 * Then generate:
 *
 * 290g
 * 300g
 * 310g
 * 320g
 * 330g
 */
function getPreferredVegetableTotals(calorieTarget: number): number[] {
    const preferredMealWeight = calorieTarget / PREFERRED_CALORIE_DENSITY;

    const preferredVegetableWeight =
        preferredMealWeight * TARGET_VEGETABLE_PERCENTAGE;

    const centre = roundToStep(preferredVegetableWeight, VEGETABLE_STEP);

    const totals: number[] = [];

    for (
        let offset = -VEGETABLE_TARGET_VARIATION;
        offset <= VEGETABLE_TARGET_VARIATION;
        offset += VEGETABLE_STEP
    ) {
        const total = centre + offset;

        if (total >= MIN_AMOUNT) {
            totals.push(total);
        }
    }

    return totals;
}

/**
 * Generate relatively even distributions.
 *
 * Example:
 *
 * total = 300g
 * ingredient count = 2
 *
 * Generates approximately:
 *
 * 150 / 150
 * 140 / 160
 * 160 / 140
 * 130 / 170
 * 170 / 130
 *
 * It deliberately does NOT generate:
 *
 * 5 / 295
 *
 * because we want meaningful variety.
 */
function generateEvenDistributions(
    ingredientCount: number,
    totalAmount: number,
    minimumAmount: number,
    step: number,
): number[][] {
    if (ingredientCount === 0) {
        return [[]];
    }

    if (ingredientCount === 1) {
        return [[totalAmount]];
    }

    const result: number[][] = [];

    generateDistributionRecursively(
        ingredientCount,
        totalAmount,
        minimumAmount,
        step,
        [],
        result,
    );

    return result;
}

function generateDistributionRecursively(
    remainingCount: number,
    remainingAmount: number,
    minimumAmount: number,
    step: number,
    current: number[],
    result: number[][],
): void {
    if (remainingCount === 1) {
        if (remainingAmount >= minimumAmount && remainingAmount % step === 0) {
            result.push([...current, remainingAmount]);
        }

        return;
    }

    const ideal = remainingAmount / remainingCount;

    /**
     * Only search around the even distribution.
     *
     * This prevents:
     *
     * 5g / 305g
     *
     * from being generated when:
     *
     * 155g / 155g
     *
     * is the intended structure.
     */
    const variation = step * 3;

    const centre = roundToStep(ideal, step);

    const min = Math.max(minimumAmount, centre - variation);

    const max = Math.min(
        remainingAmount - minimumAmount * (remainingCount - 1),
        centre + variation,
    );

    for (let amount = roundUpToStep(min, step); amount <= max; amount += step) {
        generateDistributionRecursively(
            remainingCount - 1,
            remainingAmount - amount,
            minimumAmount,
            step,
            [...current, amount],
            result,
        );
    }
}

/**
 * ============================================================
 * PROTEIN / CARB / OTHER EXPANSION
 * ============================================================
 */

function expandGroup(
    candidates: Candidate[],
    group: ClassifiedIngredient[],
    nutrition: IngredientNutrition[],
    requirements: GenerateMealInput['requirements'],
    classified: ClassifiedIngredient[],
    groupType: DistributionGroup,
): Candidate[] {
    let result = candidates;

    /**
     * For multiple protein or carb ingredients,
     * start searching from meaningful portions.
     */
    const minimumAmount =
        group.length > 1 && (groupType === 'protein' || groupType === 'carb')
            ? PREFERRED_MIN_GROUP_AMOUNT
            : MIN_AMOUNT;

    for (const item of group) {
        const next: Candidate[] = [];

        const possibleAmounts = getPossibleAmounts(minimumAmount);

        for (const candidate of result) {
            for (const amount of possibleAmounts) {
                const amounts = [...candidate.amounts];

                amounts[item.index] = amount;

                if (shouldPrune(nutrition, amounts, requirements)) {
                    continue;
                }

                next.push({ amounts });
            }
        }

        result = keepBestPartialCandidates(
            next,
            nutrition,
            requirements,
            classified,
        );
    }

    return result;
}

function getPossibleAmounts(preferredMinimum: number): number[] {
    const amounts = new Set<number>();

    /**
     * Search preferred meaningful amounts first.
     */
    for (
        let amount = preferredMinimum;
        amount <= 200;
        amount += INGREDIENT_STEP
    ) {
        amounts.add(amount);
    }

    /**
     * Larger portions.
     */
    for (let amount = 220; amount <= MAX_AMOUNT; amount += 20) {
        amounts.add(amount);
    }

    /**
     * Soft fallback.
     *
     * We still allow smaller amounts, but they will have
     * a structural penalty later.
     */
    for (
        let amount = MIN_AMOUNT;
        amount < preferredMinimum;
        amount += INGREDIENT_STEP
    ) {
        amounts.add(amount);
    }

    return [...amounts];
}

/**
 * ============================================================
 * PARTIAL CANDIDATE SELECTION
 * ============================================================
 */

function keepBestPartialCandidates(
    candidates: Candidate[],
    nutrition: IngredientNutrition[],
    requirements: GenerateMealInput['requirements'],
    classified: ClassifiedIngredient[],
): Candidate[] {
    if (candidates.length <= BEAM_WIDTH) {
        return candidates;
    }

    return candidates
        .sort((a, b) => {
            const scoreA = calculatePartialScore(
                a,
                nutrition,
                requirements,
                classified,
            );

            const scoreB = calculatePartialScore(
                b,
                nutrition,
                requirements,
                classified,
            );

            return scoreA - scoreB;
        })
        .slice(0, BEAM_WIDTH);
}

/**
 * Partial candidates should not be ranked only by
 * calorie proximity.
 *
 * We also preserve candidates with good structure,
 * particularly even vegetable distributions.
 */
function calculatePartialScore(
    candidate: Candidate,
    nutrition: IngredientNutrition[],
    requirements: GenerateMealInput['requirements'],
    classified: ClassifiedIngredient[],
): number {
    const totals = calculateTotals(nutrition, candidate.amounts);

    let penalty = 0;

    if (requirements.calories !== undefined && requirements.calories > 0) {
        /**
         * Only penalize calories above the search ceiling.
         *
         * Partial candidates may still need calories from
         * ingredients that have not been allocated yet.
         */
        const maximum = requirements.calories * MAX_SEARCH_CALORIE_RATIO;

        if (totals.calories > maximum) {
            penalty += (totals.calories - maximum) / requirements.calories;
        }
    }

    /**
     * Preserve good vegetable structure.
     */
    const vegetableAmounts = getGroupAmounts(
        candidate.amounts,
        classified,
        'vegetable',
    );

    penalty += calculateDistributionPenalty(vegetableAmounts) * 0.5;

    return penalty;
}

/**
 * ============================================================
 * PRUNING
 * ============================================================
 */

function shouldPrune(
    nutrition: IngredientNutrition[],
    amounts: number[],
    requirements: GenerateMealInput['requirements'],
): boolean {
    if (requirements.calories === undefined) {
        return false;
    }

    const calories = calculateCalories(nutrition, amounts);

    return calories > requirements.calories * MAX_SEARCH_CALORIE_RATIO;
}

/**
 * ============================================================
 * FINAL SCORE
 * ============================================================
 */

type Score = {
    requirementPenalty: number;
    structurePenalty: number;
    nutritionPenalty: number;

    calorieDifference: number;
    proteinDifference: number;
};

function calculateFinalScore(
    candidate: Candidate,
    nutrition: IngredientNutrition[],
    requirements: GenerateMealInput['requirements'],
    classified: ClassifiedIngredient[],
): Score {
    const totals = calculateTotals(nutrition, candidate.amounts);

    const caloriePenalty = calculateCaloriePenalty(
        totals.calories,
        requirements.calories,
    );

    const proteinPenalty = calculateProteinPenalty(
        totals.proteinPercentage,
        requirements.proteinPercentage,
    );

    const vegetableAmounts = getGroupAmounts(
        candidate.amounts,
        classified,
        'vegetable',
    );

    const proteinAmounts = getGroupAmounts(
        candidate.amounts,
        classified,
        'protein',
    );

    const carbAmounts = getGroupAmounts(candidate.amounts, classified, 'carb');

    const structurePenalty =
        calculateDistributionPenalty(vegetableAmounts) +
        calculateMeaningfulDistributionPenalty(proteinAmounts) +
        calculateMeaningfulDistributionPenalty(carbAmounts);

    return {
        /**
         * Highest priority:
         *
         * calorie and protein requirements.
         */
        requirementPenalty: caloriePenalty + proteinPenalty,

        /**
         * Second priority:
         *
         * realistic ingredient distribution.
         */
        structurePenalty,

        /**
         * Third priority:
         *
         * fiber and macro preferences.
         */
        nutritionPenalty: calculateNutritionPenalty(totals),

        calorieDifference:
            requirements.calories === undefined
                ? 0
                : Math.abs(totals.calories - requirements.calories),

        proteinDifference:
            requirements.proteinPercentage === undefined
                ? 0
                : Math.abs(
                      totals.proteinPercentage - requirements.proteinPercentage,
                  ),
    };
}

function getGroupAmounts(
    amounts: number[],
    classified: ClassifiedIngredient[],
    group: DistributionGroup,
): number[] {
    return classified
        .filter((item) => item.group === group)
        .map((item) => amounts[item.index]);
}

function calculateMeaningfulDistributionPenalty(amounts: number[]): number {
    if (amounts.length <= 1) {
        return 0;
    }

    let penalty = 0;

    /**
     * Penalize tiny portions.
     */
    for (const amount of amounts) {
        if (amount < PREFERRED_MIN_GROUP_AMOUNT) {
            penalty +=
                ((PREFERRED_MIN_GROUP_AMOUNT - amount) /
                    PREFERRED_MIN_GROUP_AMOUNT) **
                2;
        }
    }

    penalty /= amounts.length;

    /**
     * Prefer relatively even distribution.
     */
    penalty += calculateDistributionPenalty(amounts);

    return penalty;
}

function calculateDistributionPenalty(amounts: number[]): number {
    if (amounts.length <= 1) {
        return 0;
    }

    const total = amounts.reduce((sum, amount) => sum + amount, 0);

    const mean = total / amounts.length;

    if (mean === 0) {
        return 0;
    }

    const deviation = amounts.reduce(
        (sum, amount) => sum + Math.abs(amount - mean),
        0,
    );

    return deviation / amounts.length / mean;
}

/**
 * ============================================================
 * REQUIREMENT PENALTIES
 * ============================================================
 */

function calculateCaloriePenalty(calories: number, target?: number): number {
    if (target === undefined || target <= 0) {
        return 0;
    }

    const minimum = target * 0.95;
    const maximum = target * 1.05;

    if (calories >= minimum && calories <= maximum) {
        return 0;
    }

    const difference =
        calories < minimum ? minimum - calories : calories - maximum;

    return difference / target;
}

function calculateProteinPenalty(
    proteinPercentage: number,
    target?: number,
): number {
    if (target === undefined || target <= 0) {
        return 0;
    }

    const minimum = target * (1 - PROTEIN_TOLERANCE);

    const maximum = target * (1 + PROTEIN_TOLERANCE);

    if (proteinPercentage >= minimum && proteinPercentage <= maximum) {
        return 0;
    }

    const difference =
        proteinPercentage < minimum
            ? minimum - proteinPercentage
            : proteinPercentage - maximum;

    return difference / target;
}

/**
 * ============================================================
 * SECONDARY NUTRITION PREFERENCES
 * ============================================================
 */

function calculateNutritionPenalty(totals: MealTotals): number {
    let penalty = 0;

    /**
     * Fiber:
     *
     * Around 15g / 1000 kcal.
     */
    if (totals.calories > 0) {
        const fiberPer1000Calories = (totals.fiber / totals.calories) * 1000;

        penalty += Math.abs(fiberPer1000Calories - 15) / 15;
    }

    /**
     * Carbohydrates:
     *
     * 45–65%.
     */
    penalty += rangePenalty(totals.carbohydratePercentage, 45, 65);

    /**
     * Fat:
     *
     * 20–30%.
     */
    penalty += rangePenalty(totals.fatPercentage, 20, 30);

    /**
     * Saturated fat:
     *
     * Less than 10%.
     */
    penalty += Math.max(0, totals.saturatedFatPercentage - 10) / 10;

    return penalty;
}

function rangePenalty(value: number, minimum: number, maximum: number): number {
    if (value < minimum) {
        return (minimum - value) / minimum;
    }

    if (value > maximum) {
        return (value - maximum) / maximum;
    }

    return 0;
}

/**
 * ============================================================
 * TOTAL CALCULATIONS
 * ============================================================
 */

function calculateTotals(
    nutrition: IngredientNutrition[],
    amounts: number[],
): MealTotals {
    let calories = 0;

    let protein = 0;
    let carbohydrates = 0;
    let fat = 0;
    let saturatedFat = 0;
    let fiber = 0;

    for (let i = 0; i < nutrition.length; i++) {
        const ingredient = nutrition[i];
        const amount = amounts[i];
        const factor = amount / 100;

        calories += ingredient.caloriesPer100g * factor;

        protein += ingredient.proteinPer100g * factor;

        carbohydrates += ingredient.carbohydratePer100g * factor;

        fat += ingredient.fatPer100g * factor;

        saturatedFat += ingredient.saturatedFatPer100g * factor;

        fiber += ingredient.fiberPer100g * factor;
    }

    const proteinCalories = protein * 4;

    const carbohydrateCalories = carbohydrates * 4;

    const fatCalories = fat * 9;

    const macroCalories = proteinCalories + carbohydrateCalories + fatCalories;

    return {
        calories,
        protein,
        carbohydrates,
        fat,
        saturatedFat,
        fiber,

        proteinPercentage:
            macroCalories === 0 ? 0 : (proteinCalories / macroCalories) * 100,

        carbohydratePercentage:
            macroCalories === 0
                ? 0
                : (carbohydrateCalories / macroCalories) * 100,

        fatPercentage:
            macroCalories === 0 ? 0 : (fatCalories / macroCalories) * 100,

        saturatedFatPercentage:
            macroCalories === 0
                ? 0
                : ((saturatedFat * 9) / macroCalories) * 100,
    };
}

function calculateCalories(
    nutrition: IngredientNutrition[],
    amounts: number[],
): number {
    return nutrition.reduce(
        (total, ingredient, index) =>
            total + ingredient.caloriesPer100g * (amounts[index] / 100),
        0,
    );
}

/**
 * ============================================================
 * SCORE COMPARISON
 * ============================================================
 */

function compareScores(a: Score, b: Score): number {
    /**
     * 1. Meet calorie and protein requirements.
     */
    if (a.requirementPenalty !== b.requirementPenalty) {
        return a.requirementPenalty - b.requirementPenalty;
    }

    /**
     * 2. Prefer realistic structure.
     */
    if (a.structurePenalty !== b.structurePenalty) {
        return a.structurePenalty - b.structurePenalty;
    }

    /**
     * 3. Prefer secondary nutrition goals.
     */
    if (a.nutritionPenalty !== b.nutritionPenalty) {
        return a.nutritionPenalty - b.nutritionPenalty;
    }

    /**
     * 4. Prefer calories closer to target.
     */
    if (a.calorieDifference !== b.calorieDifference) {
        return a.calorieDifference - b.calorieDifference;
    }

    /**
     * 5. Prefer protein closer to target.
     */
    return a.proteinDifference - b.proteinDifference;
}

/**
 * ============================================================
 * ROUNDING
 * ============================================================
 */

function roundToStep(value: number, step: number): number {
    return Math.round(value / step) * step;
}

function roundUpToStep(value: number, step: number): number {
    return Math.ceil(value / step) * step;
}
