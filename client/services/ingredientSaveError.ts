export type IngredientSaveFailure = {
    message: string;
    action: 'retry' | 'refresh' | 'none';
    diagnostic?: string;
};

/** Keep database details available for troubleshooting without making them the main UI copy. */
export function describeIngredientSaveError(
    error: unknown,
    name: string,
    operation: 'save' | 'remove' = 'save',
): IngredientSaveFailure {
    const record =
        error && typeof error === 'object'
            ? (error as Record<string, unknown>)
            : {};
    const code = typeof record.code === 'string' ? record.code : undefined;
    const status =
        typeof record.httpStatus === 'number' ? record.httpStatus : undefined;
    const detail =
        typeof record.message === 'string' ? record.message : undefined;
    const diagnostic = code
        ? `${code}${detail ? `: ${detail}` : ''}`
        : undefined;

    if (operation === 'save' && code === '23505')
        return {
            message: `${name} is already in My Ingredients.`,
            action: 'refresh',
            diagnostic,
        };
    if (status === 401 || status === 403 || code === 'PGRST301')
        return {
            message:
                'Your session may have expired. Sign in again to manage ingredients.',
            action: 'none',
            diagnostic,
        };
    if (code === 'PGRST204' || code === '42703')
        return {
            message: `${operation === 'save' ? 'Saving' : 'Removing'} is unavailable right now. Please try again later.`,
            action: 'none',
            diagnostic,
        };
    if (
        error instanceof TypeError ||
        (detail && /failed to fetch|fetch failed|networkerror/i.test(detail)) ||
        (typeof navigator !== 'undefined' && !navigator.onLine)
    )
        return {
            message: `Couldn't connect to ${operation} ${name}. Check your connection.`,
            action: 'retry',
        };
    return {
        message: `Couldn't ${operation} ${name}.`,
        action: 'retry',
        diagnostic,
    };
}
