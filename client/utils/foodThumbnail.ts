const DEFAULT_API_URL = 'https://mealmaker.brotherk3d.com/api/v1';

// Thumbnails are public, so no API key is needed in the browser.
export function getFoodThumbnailUrl(fdcId: number): string {
    const base = (
        import.meta.env.VITE_MEALMAKER_API_URL ?? DEFAULT_API_URL
    ).replace(/\/+$/, '');
    return `${base}/thumbnails/${fdcId}.webp`;
}
