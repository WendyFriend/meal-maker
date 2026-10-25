import type {
    GenerateMealRequest,
    GenerateMealResponse,
} from '../../shared/types/types';
import type { AppError, ErrorResponse } from '../meal-generator/types';

export type GenerateMealResult =
    { ok: true; meal: GenerateMealResponse } | { ok: false; error: AppError };

const UNKNOWN_ERROR: AppError = {
    code: 'UNKNOWN_ERROR',
    message:
        'Something went wrong while generating your meal. Please try again.',
};

/* POST /api/generate-meal. Never throws: failures come back as an error
   the UI can show (422 = the requirements can't be met). */
export async function requestMeal(
    input: GenerateMealRequest,
): Promise<GenerateMealResult> {
    try {
        const response = await fetch('/api/generate-meal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
        });
        const payload = await response.json();

        if (response.status === 422) {
            return { ok: false, error: (payload as ErrorResponse).error };
        }
        if (!response.ok) {
            return { ok: false, error: UNKNOWN_ERROR };
        }

        const meal = payload as GenerateMealResponse;

        if (!Array.isArray(meal.ingredients)) {
            console.error('Unexpected generate-meal response:', payload);
            return { ok: false, error: UNKNOWN_ERROR };
        }

        return { ok: true, meal };
    } catch (error) {
        console.error(error);
        return { ok: false, error: UNKNOWN_ERROR };
    }
}
