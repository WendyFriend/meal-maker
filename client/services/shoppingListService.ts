import { supabase } from '../lib/supabase';
import { devTable } from '../lib/devStore';
import { isDevSessionActive } from '../auth/devAuth';
import type { Recipe, ShoppingListItem } from '../../shared/types/recipe';

export type ShoppingListItemRow = {
    id: string;
    user_id: string;
    name: string;
    quantity: string | null;
    checked: boolean;
    created_at: string;
    updated_at: string;
};

export type NewShoppingItem = {
    name: string;
    quantity?: string;
};

export type ShoppingMergePlan = {
    updates: { id: string; quantity: string }[];
    inserts: NewShoppingItem[];
};

const devItems = devTable<ShoppingListItemRow>('shopping_list_items');

/* Parses quantities of the form "<number> g"; anything else is null. */
export function parseGrams(quantity?: string): number | null {
    const match = quantity?.trim().match(/^(\d+(?:\.\d+)?)\s*g$/i);

    return match ? Number(match[1]) : null;
}

export function formatGrams(grams: number): string {
    return `${Math.round(grams)} g`;
}

/*
 * Sums each recipe's ingredient weights by case-insensitive name. Weights are
 * per serving, so each is multiplied by the recipe's servings.
 */
export function aggregateIngredients(recipes: Recipe[]): NewShoppingItem[] {
    const totals = new Map<string, { name: string; grams: number }>();

    for (const recipe of recipes) {
        const servings = recipe.servings ?? 1;

        for (const ingredient of recipe.ingredients) {
            const name = ingredient.name.trim();
            const key = name.toLowerCase();

            if (!key) {
                continue;
            }

            const existing = totals.get(key);
            const grams = ingredient.weight * servings;

            if (existing) {
                existing.grams += grams;
            } else {
                totals.set(key, { name, grams });
            }
        }
    }

    return [...totals.values()].map(({ name, grams }) => ({
        name,
        quantity: formatGrams(grams),
    }));
}

/*
 * Decides how incoming items fold into the list: an incoming "<n> g" item
 * merges into an existing unchecked item of the same name (case-insensitive)
 * whose quantity is also "<n> g"; everything else becomes a new item.
 */
export function planShoppingMerge(
    existing: ShoppingListItem[],
    incoming: NewShoppingItem[],
): ShoppingMergePlan {
    const quantities = new Map<string, string | undefined>();
    const updated = new Set<string>();
    const inserts: NewShoppingItem[] = [];

    for (const item of existing) {
        quantities.set(item.id, item.quantity);
    }

    for (const next of incoming) {
        const name = next.name.trim();
        const quantity = next.quantity?.trim() || undefined;
        const nextGrams = parseGrams(quantity);

        if (!name) {
            continue;
        }

        if (nextGrams === null) {
            inserts.push({ name, quantity });
            continue;
        }

        const target = existing.find(
            (item) =>
                !item.checked &&
                item.name.toLowerCase() === name.toLowerCase() &&
                parseGrams(quantities.get(item.id)) !== null,
        );

        if (target) {
            const total =
                (parseGrams(quantities.get(target.id)) ?? 0) + nextGrams;

            quantities.set(target.id, formatGrams(total));
            updated.add(target.id);
            continue;
        }

        // Also fold into an item already queued in this batch.
        const queued = inserts.find(
            (item) =>
                item.name.toLowerCase() === name.toLowerCase() &&
                parseGrams(item.quantity) !== null,
        );

        if (queued) {
            queued.quantity = formatGrams(
                (parseGrams(queued.quantity) ?? 0) + nextGrams,
            );
        } else {
            inserts.push({ name, quantity });
        }
    }

    return {
        updates: [...updated].map((id) => ({
            id,
            quantity: quantities.get(id) as string,
        })),
        inserts,
    };
}

export async function getItems() {
    if (isDevSessionActive()) {
        return devItems
            .list()
            .sort((a, b) => a.created_at.localeCompare(b.created_at))
            .map(toShoppingListItem);
    }

    const { data, error } = await supabase
        .from('shopping_list_items')
        .select('*')
        .order('created_at');

    if (error) {
        throw error;
    }

    return (data as ShoppingListItemRow[]).map(toShoppingListItem);
}

/* Adds items using the merge rule; resolves to how many rows changed. */
export async function addItems(items: NewShoppingItem[]) {
    const plan = planShoppingMerge(await getItems(), items);

    if (isDevSessionActive()) {
        plan.updates.forEach(({ id, quantity }) =>
            devItems.update(id, { quantity }),
        );
        plan.inserts.forEach((item) =>
            devItems.insert({
                name: item.name,
                quantity: item.quantity ?? null,
                checked: false,
            }),
        );
    } else {
        for (const { id, quantity } of plan.updates) {
            const { error } = await supabase
                .from('shopping_list_items')
                .update({ quantity })
                .eq('id', id);

            if (error) {
                throw error;
            }
        }

        if (plan.inserts.length > 0) {
            const { error } = await supabase.from('shopping_list_items').insert(
                plan.inserts.map((item) => ({
                    name: item.name,
                    quantity: item.quantity ?? null,
                    checked: false,
                })),
            );

            if (error) {
                throw error;
            }
        }
    }

    return plan.updates.length + plan.inserts.length;
}

export async function setChecked(id: string, checked: boolean) {
    if (isDevSessionActive()) {
        return toShoppingListItem(devItems.update(id, { checked }));
    }

    const { data, error } = await supabase
        .from('shopping_list_items')
        .update({ checked })
        .eq('id', id)
        .select()
        .single();

    if (error) {
        throw error;
    }

    return toShoppingListItem(data as ShoppingListItemRow);
}

export async function removeItem(id: string) {
    if (isDevSessionActive()) {
        devItems.remove(id);
        return;
    }

    const { error } = await supabase
        .from('shopping_list_items')
        .delete()
        .eq('id', id);

    if (error) {
        throw error;
    }
}

export async function clearChecked() {
    if (isDevSessionActive()) {
        devItems
            .list()
            .filter((row) => row.checked)
            .forEach((row) => devItems.remove(row.id));
        return;
    }

    const { error } = await supabase
        .from('shopping_list_items')
        .delete()
        .eq('checked', true);

    if (error) {
        throw error;
    }
}

export function toShoppingListItem(row: ShoppingListItemRow): ShoppingListItem {
    return {
        id: row.id,
        name: row.name,
        quantity: row.quantity ?? undefined,
        checked: row.checked,
    };
}
