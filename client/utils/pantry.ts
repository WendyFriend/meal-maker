import type { PantryDetails } from '../../shared/types/types';

export type PantryInputs = {
    quantity: string;
    unit: string;
    expiresOn: string;
};

export const pantryUnits = ['g', 'ml', 'pcs'] as const;

export const EXPIRING_SOON_DAYS = 7;
export const EXPIRY_WARNING_DAYS = 3;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Parse YYYY-MM-DD as a local calendar date (new Date('YYYY-MM-DD') would be
// UTC midnight and can land on the wrong day).
function parseDate(value: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (!match) return undefined;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/* Whole calendar days from `today` until the date; negative once expired. */
export function daysUntilExpiry(
    expiresOn: string | undefined,
    today = new Date(),
) {
    if (!expiresOn) return undefined;
    const expiry = parseDate(expiresOn);
    if (!expiry || Number.isNaN(expiry.getTime())) return undefined;
    const start = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
    );
    return Math.round((expiry.getTime() - start.getTime()) / MS_PER_DAY);
}

export function formatExpiry(
    expiresOn: string | undefined,
    today = new Date(),
) {
    const days = daysUntilExpiry(expiresOn, today);
    if (days === undefined) return undefined;
    if (days < -1) return `expired ${-days} days ago`;
    if (days === -1) return 'expired yesterday';
    if (days === 0) return 'expires today';
    if (days === 1) return 'expires tomorrow';
    if (days <= 60) return `expires in ${days} days`;
    const expiry = parseDate(expiresOn as string)!;
    return `expires ${expiry.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    })}`;
}

export type ExpiryTone = 'danger' | 'warning' | undefined;

export function expiryTone(
    expiresOn: string | undefined,
    today = new Date(),
): ExpiryTone {
    const days = daysUntilExpiry(expiresOn, today);
    if (days === undefined) return undefined;
    if (days < 0) return 'danger';
    if (days <= EXPIRY_WARNING_DAYS) return 'warning';
    return undefined;
}

export function formatQuantity({ quantity, unit }: PantryDetails) {
    if (quantity === undefined) return undefined;
    return `${Math.round(quantity * 100) / 100}${unit ? ` ${unit}` : ''}`;
}

/* "500 g · expires in 3 days", or whichever part exists. */
export function formatPantrySummary(
    details: PantryDetails,
    today = new Date(),
) {
    const parts = [
        formatQuantity(details),
        formatExpiry(details.expiresOn, today),
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(' · ') : undefined;
}

export function isExpiringSoon(
    details: PantryDetails,
    today = new Date(),
    withinDays = EXPIRING_SOON_DAYS,
) {
    const days = daysUntilExpiry(details.expiresOn, today);
    return days !== undefined && days <= withinDays;
}

/* Items expiring within a week (or already expired), soonest first. */
export function filterExpiringSoon<T extends PantryDetails>(
    items: T[],
    today = new Date(),
) {
    return items
        .filter((item) => isExpiringSoon(item, today))
        .sort((a, b) => (a.expiresOn ?? '').localeCompare(b.expiresOn ?? ''));
}

/* Form strings → PantryDetails; blank or invalid values are left undefined. */
export function parsePantryInputs(inputs: {
    quantity: string;
    unit: string;
    expiresOn: string;
}): PantryDetails {
    const quantity = Number(inputs.quantity);
    const hasQuantity =
        inputs.quantity.trim() !== '' &&
        Number.isFinite(quantity) &&
        quantity >= 0;
    return {
        quantity: hasQuantity ? quantity : undefined,
        unit: hasQuantity ? inputs.unit || undefined : undefined,
        expiresOn: inputs.expiresOn || undefined,
    };
}

export function toPantryInputs(details: {
    quantity?: number;
    unit?: string;
    expiresOn?: string;
}): PantryInputs {
    return {
        quantity:
            details.quantity === undefined ? '' : String(details.quantity),
        unit: details.unit || 'g',
        expiresOn: details.expiresOn ?? '',
    };
}
