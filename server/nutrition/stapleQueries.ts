/*
 * USDA's search relevance is built for full-text matching, not for the bare
 * one-word queries a cook types. "bread" gives every "Bread, <variant>" the
 * same score, so the list starts at "Bread, cheese" and "Bread, egg"; "tomato"
 * puts "Tomato powder" above raw tomatoes.
 *
 * Searching a slightly longer, canonical phrase steers USDA's own relevance
 * towards the everyday food while still returning a broad result set (a query
 * like "milk whole 3.25% milkfat" still matches 400+ foods). Only bare
 * staple words are expanded: anything else is searched exactly as typed.
 */
export const STAPLE_QUERIES: Record<string, string> = {
    // Breads and grains
    bread: 'bread white commercial',
    'white bread': 'bread white commercial',
    'wholemeal bread': 'bread whole-wheat commercial',
    'whole wheat bread': 'bread whole-wheat commercial',
    bagel: 'bagels plain enriched',
    bagels: 'bagels plain enriched',
    flour: 'flour wheat all-purpose',
    'plain flour': 'flour wheat all-purpose',
    'all purpose flour': 'flour wheat all-purpose',
    'all-purpose flour': 'flour wheat all-purpose',
    rice: 'rice white long-grain raw',
    'white rice': 'rice white long-grain raw',
    'brown rice': 'rice brown long-grain raw',
    pasta: 'pasta dry enriched',
    spaghetti: 'pasta dry enriched spaghetti',
    noodle: 'noodles egg dry enriched',
    noodles: 'noodles egg dry enriched',
    oats: 'oats whole grain',
    oatmeal: 'cereals oats instant fortified plain',
    quinoa: 'quinoa uncooked',
    couscous: 'couscous dry',
    cornmeal: 'cornmeal whole-grain yellow',

    // Dairy and eggs
    milk: 'milk whole 3.25% milkfat',
    'whole milk': 'milk whole 3.25% milkfat',
    'skim milk': 'milk nonfat fluid',
    cream: 'cream fluid heavy whipping',
    'sour cream': 'cream sour cultured',
    yogurt: 'yogurt plain whole milk',
    yoghurt: 'yogurt plain whole milk',
    'greek yogurt': 'yogurt greek plain whole milk',
    cheese: 'cheddar cheese',
    cheddar: 'cheddar cheese',
    parmesan: 'cheese parmesan grated',
    mozzarella: 'cheese mozzarella whole milk',
    feta: 'cheese feta',
    butter: 'butter salted',
    egg: 'egg whole raw fresh',
    eggs: 'egg whole raw fresh',

    // Proteins
    chicken: 'chicken breast boneless skinless raw',
    'chicken breast': 'chicken breast boneless skinless raw',
    'chicken thigh': 'chicken thigh boneless skinless raw',
    beef: 'beef ground 85% lean raw',
    'ground beef': 'beef ground 85% lean raw',
    'beef mince': 'beef ground 85% lean raw',
    steak: 'beef steak raw',
    pork: 'pork fresh loin raw',
    'pork chop': 'pork fresh loin chops raw',
    bacon: 'pork cured bacon raw',
    lamb: 'lamb domestic leg raw',
    turkey: 'turkey breast raw',
    salmon: 'salmon atlantic farmed raw',
    tuna: 'fish tuna light canned in water',
    cod: 'fish cod atlantic raw',
    shrimp: 'crustaceans shrimp raw',
    prawns: 'crustaceans shrimp raw',
    tofu: 'tofu raw firm',
    lentil: 'lentils raw',
    lentils: 'lentils raw',
    'chickpea': 'chickpeas raw',
    chickpeas: 'chickpeas raw',
    'black beans': 'beans black mature seeds raw',

    // Vegetables
    tomato: 'tomatoes red ripe raw',
    tomatoes: 'tomatoes red ripe raw',
    'cherry tomato': 'tomatoes red ripe raw',
    potato: 'potatoes flesh and skin raw',
    potatoes: 'potatoes flesh and skin raw',
    'sweet potato': 'sweet potatoes orange flesh raw',
    onion: 'onions raw',
    'red onion': 'onions red raw',
    garlic: 'garlic raw',
    carrot: 'carrots raw',
    carrot_: 'carrots raw',
    broccoli: 'broccoli raw',
    cauliflower: 'cauliflower raw',
    spinach: 'spinach raw',
    kale: 'kale raw',
    lettuce: 'lettuce iceberg raw',
    cucumber: 'cucumber with peel raw',
    courgette: 'squash summer zucchini includes skin raw',
    zucchini: 'squash summer zucchini includes skin raw',
    mushroom: 'mushrooms white raw',
    mushrooms: 'mushrooms white raw',
    capsicum: 'peppers sweet green raw',
    'bell pepper': 'peppers sweet green raw',
    pepper: 'peppers sweet green raw',
    celery: 'celery raw',
    'sweetcorn': 'corn sweet yellow raw',
    corn: 'corn sweet yellow raw',
    pea: 'peas green raw',
    peas: 'peas green raw',
    pumpkin: 'pumpkin raw',
    beetroot: 'beets raw',
    cabbage: 'cabbage raw',
    asparagus: 'asparagus raw',
    eggplant: 'eggplant raw',
    aubergine: 'eggplant raw',

    // Fruit
    apple: 'apples raw with skin',
    apples: 'apples raw with skin',
    banana: 'bananas raw',
    bananas: 'bananas raw',
    orange: 'oranges raw all commercial varieties',
    lemon: 'lemons raw without peel',
    lime: 'limes raw',
    strawberry: 'strawberries raw',
    strawberries: 'strawberries raw',
    blueberry: 'blueberries raw',
    blueberries: 'blueberries raw',
    grapes: 'grapes red or green raw',
    mango: 'mangoes raw',
    avocado: 'avocados raw',
    peach: 'peaches raw',
    pear: 'pears raw',
    pineapple: 'pineapple raw all varieties',

    // Pantry
    salt: 'salt table',
    sugar: 'sugars granulated',
    'brown sugar': 'sugars brown',
    honey: 'honey',
    'olive oil': 'oil olive',
    'vegetable oil': 'oil vegetable canola',
    'sunflower oil': 'oil sunflower',
    'coconut oil': 'oil coconut',
    vinegar: 'vinegar distilled',
    'soy sauce': 'soy sauce made from soy and wheat shoyu',
    ketchup: 'catsup',
    mayonnaise: 'mayonnaise regular',
    mustard: 'mustard prepared yellow',
    'peanut butter': 'peanut butter smooth',
    'baking powder': 'leavening agents baking powder',
    'baking soda': 'leavening agents baking soda',
};

/* The canonical USDA phrasing for a bare staple query, or undefined to
   search exactly what was typed. Multi-word entries must match exactly so
   that "sweet potato" is expanded but "sweet and sour potato" is not. */
export function expandStapleQuery(query: string): string | undefined {
    const normalized = query.toLowerCase().replace(/\s+/g, ' ').trim();

    return STAPLE_QUERIES[normalized];
}
