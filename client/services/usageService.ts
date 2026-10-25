import { supabase } from '../lib/supabase';
import { devTable } from '../lib/devStore';
import { isDevSessionActive } from '../auth/devAuth';

type GenerationUsageRow = {
    id: string;
    user_id: string;
    created_at: string;
    updated_at: string;
};

const devUsage = devTable<GenerationUsageRow>('generation_usage');

/* Local midnight, so "today" matches the user's calendar. */
function startOfToday() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export async function getGenerationsToday(): Promise<number> {
    const since = startOfToday().toISOString();

    if (isDevSessionActive()) {
        return devUsage.list().filter((row) => row.created_at >= since).length;
    }

    const { count, error } = await supabase
        .from('generation_usage')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since);

    if (error) {
        throw error;
    }

    return count ?? 0;
}

export async function recordGeneration() {
    if (isDevSessionActive()) {
        devUsage.insert({});
        return;
    }

    const { error } = await supabase.from('generation_usage').insert({});

    if (error) {
        throw error;
    }
}

/* Dev helper: lets you test the daily cap again without waiting. */
export function resetDevGenerations() {
    for (const row of devUsage.list()) {
        devUsage.remove(row.id);
    }
}
