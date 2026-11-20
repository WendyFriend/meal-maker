import { MealMakerApiError } from '../mealmaker/client.js';

/** A failed Nutrition Lab photo request, as a response people can act on. */
export function photoFailure(error: unknown, fallback: string) {
    const status = error instanceof MealMakerApiError ? error.status : 500;
    if (status === 429)
        return {
            status,
            body: {
                message: 'Too many scans right now. Try again in a minute.',
            },
        };
    if (status === 413)
        return { status, body: { message: 'This photo is too large.' } };
    if (status === 400 || status === 415)
        return {
            status: 400,
            body: { message: 'Provide a JPEG, PNG or WebP photo.' },
        };
    console.error('Nutrition Lab photo request failed:', error);
    return { status: 502, body: { message: fallback } };
}

/** The vision model sometimes fails once; Nutrition Lab suggests a retry. */
export async function retryOnce<T>(request: () => Promise<T>): Promise<T> {
    try {
        return await request();
    } catch (error) {
        if (error instanceof MealMakerApiError && error.status === 502)
            return request();
        throw error;
    }
}
