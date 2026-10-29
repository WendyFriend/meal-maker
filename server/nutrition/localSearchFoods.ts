// Bridges the local nutrition_lab resolver into the `SearchFoods` shape the
// rest of the app's nutrition code (searchNutrition.ts, matchIngredients.ts)
// already expects. This is what replaced the live USDA FoodData Central API
// as the app's actual search backend: nutrition_lab's resolve_food_detailed()
// does the matching (arbitrated common names/nouns, plural handling, synonym
// matching -- db/lab/4_search.sql and 8_naming.sql/9_food_names.sql), so the
// result is both offline-capable and better than USDA's own bare-word
// relevance, which the app used to work around with STAPLE_QUERIES/ALIASES.
//
// Callers (searchRankedFoods, matchIngredient) still apply their own ranking
// on top of whatever this returns (scoreFood/scoreMatch); that's unaffected --
// this only changes where the candidate foods come from.
import { resolveFood, type NutritionRow } from './nutritionDb.ts';
import type { SearchFoods } from './searchNutrition.ts';
import type { USDAAbridgedFoodNutrient, USDAFood } from './usda/types.ts';

// nutrient_nbr -> the name mapper.ts looks up by number; the actual string
// only matters for logging, mapper.ts never reads it.
const NUTRIENT_FIELDS: [keyof NutritionRow, string, string][] = [
    ['kcal', '208', 'Energy'],
    ['protein_g', '203', 'Protein'],
    ['fat_g', '204', 'Total lipid (fat)'],
    ['carb_g', '205', 'Carbohydrate, by difference'],
    ['sugar_g', '269', 'Sugars, total'],
    ['fiber_g', '291', 'Fiber, total dietary'],
    ['sat_fat_g', '606', 'Fatty acids, total saturated'],
    ['monofat_g', '645', 'Fatty acids, total monounsaturated'],
    ['polyfat_g', '646', 'Fatty acids, total polyunsaturated'],
    ['trans_fat_g', '605', 'Fatty acids, total trans'],
    ['cholesterol_mg', '601', 'Cholesterol'],
    ['sodium_mg', '307', 'Sodium, Na'],
    ['potassium_mg', '306', 'Potassium, K'],
    ['calcium_mg', '301', 'Calcium, Ca'],
    ['iron_mg', '303', 'Iron, Fe'],
    ['magnesium_mg', '304', 'Magnesium, Mg'],
    ['phosphorus_mg', '305', 'Phosphorus, P'],
    ['zinc_mg', '309', 'Zinc, Zn'],
    ['vitamin_a_ug', '320', 'Vitamin A, RAE'],
    ['vitamin_c_mg', '401', 'Vitamin C, total ascorbic acid'],
    ['vitamin_d_ug', '328', 'Vitamin D (D2 + D3)'],
    ['vitamin_e_mg', '323', 'Vitamin E (alpha-tocopherol)'],
    ['vitamin_k_ug', '430', 'Vitamin K (phylloquinone)'],
    ['thiamin_mg', '404', 'Thiamin'],
    ['riboflavin_mg', '405', 'Riboflavin'],
    ['niacin_mg', '406', 'Niacin'],
    ['b6_mg', '415', 'Vitamin B-6'],
    ['folate_ug', '417', 'Folate, total'],
    ['b12_ug', '418', 'Vitamin B-12'],
];

function toFoodNutrients(row: NutritionRow): USDAAbridgedFoodNutrient[] {
    const nutrients: USDAAbridgedFoodNutrient[] = [];

    for (const [field, nutrientNumber, nutrientName] of NUTRIENT_FIELDS) {
        const value = row[field];
        if (typeof value === 'number' && Number.isFinite(value)) {
            nutrients.push({ nutrientNumber, nutrientName, value, unitName: '' });
        }
    }

    return nutrients;
}

// nutrition_lab's `food.data_type` holds USDA's internal slugs
// (sr_legacy_food, foundation_food, ...), not the "SR Legacy" / "Foundation"
// labels the USDA API returned and that scoreMatch/mapper.ts compare against.
const DATA_TYPE_LABELS: Record<string, string> = {
    sr_legacy_food: 'SR Legacy',
    foundation_food: 'Foundation',
    survey_fndds_food: 'Survey (FNDDS)',
    branded_food: 'Branded',
};

function toUSDAFood(row: NutritionRow): USDAFood {
    const dataType = row.data_type ? (DATA_TYPE_LABELS[row.data_type] ?? row.data_type) : 'SR Legacy';
    return {
        fdcId: row.fdc_id,
        dataType,
        description: row.description,
        foodNutrients: toFoodNutrients(row),
    };
}

export const localSearchFoods: SearchFoods = async (params) => {
    // requireAllWords/sortBy/dataType were knobs for USDA's own full-text
    // search; resolve_food_detailed does its own matching and ignores them.
    const rows = await resolveFood(params.query, Math.min(params.pageSize ?? 20, 20));

    return {
        foodSearchCriteria: { query: params.query },
        totalHits: rows.length,
        currentPage: 1,
        totalPages: 1,
        foods: rows.map(toUSDAFood),
    };
};
