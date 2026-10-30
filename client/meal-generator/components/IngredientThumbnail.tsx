import { useState } from 'react';
import thumbnails from '../../assets/ingredients/ingredient-thumbnails.png';
import { getFoodThumbnailUrl } from '../../utils/foodThumbnail';
import { normalizeIngredientName } from '../../utils/Ingredient';
import './IngredientThumbnail.css';

// Row-major order in the 4 × 4 thumbnail atlas. Match whole words so, for
// example, "eggplant" doesn't receive an egg photo.
const thumbnailAliases: readonly (readonly string[])[] = [
    ['tofu'],
    ['broccoli'],
    ['carrot', 'carrots'],
    ['brown rice'],
    ['chickpea', 'chickpeas', 'chick peas', 'garbanzo'],
    ['tahini', 'sesame paste'],
    ['lemon', 'lemons'],
    ['garlic'],
    ['spinach'],
    ['tomato', 'tomatoes'],
    ['chicken'],
    ['egg', 'eggs'],
    ['oat', 'oats', 'oatmeal'],
    ['pumpkin'],
    ['lentil', 'lentils'],
    ['mushroom', 'mushrooms'],
];

export default function IngredientThumbnail({
    name,
    fdcId,
}: {
    name: string;
    fdcId?: number;
}) {
    const [failedFdcId, setFailedFdcId] = useState<number>();
    const words = ` ${normalizeIngredientName(name).replace(/[^a-z0-9]+/g, ' ')} `;
    const isPantryProduct = /\b(oil|stock|broth|powder|flour)\b/.test(words);
    const index = isPantryProduct
        ? -1
        : thumbnailAliases.findIndex((aliases) =>
              aliases.some((alias) => words.includes(` ${alias} `)),
          );

    // Many foods have no picture yet; those 404 and use the local thumbnail.
    if (fdcId !== undefined && failedFdcId !== fdcId) {
        return (
            <img
                className="meal-ingredient-thumbnail meal-ingredient-thumbnail-photo"
                src={getFoodThumbnailUrl(fdcId)}
                alt=""
                loading="lazy"
                onError={() => setFailedFdcId(fdcId)}
            />
        );
    }

    return index >= 0 ? (
        <span
            className="meal-ingredient-thumbnail"
            aria-hidden="true"
            style={{
                backgroundImage: `url(${thumbnails})`,
                backgroundPosition: `${((index % 4) / 3) * 100}% ${(Math.floor(index / 4) / 3) * 100}%`,
            }}
        />
    ) : (
        <span
            className="meal-ingredient-thumbnail meal-ingredient-thumbnail-fallback"
            aria-hidden="true"
        >
            <svg viewBox="0 0 32 32" fill="none">
                <path d="M5 15h22c-1 7-5 11-11 11S6 22 5 15Zm5 12h12M12 6c-3 3 3 3 0 6m8-6c-3 3 3 3 0 6" />
            </svg>
        </span>
    );
}
