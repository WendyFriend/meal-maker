import { getDevSession } from '../auth/devAuth';

// localStorage stand-in for Supabase tables, used while signed in with the
// dev login so the app works without a database.

type BaseRow = {
    id: string;
    user_id: string;
    created_at: string;
    updated_at: string;
};

const STORAGE_PREFIX = 'mealmaker-dev-table:';

export function devTable<Row extends BaseRow>(name: string) {
    const key = STORAGE_PREFIX + name;

    function read(): Row[] {
        return JSON.parse(localStorage.getItem(key) ?? '[]') as Row[];
    }

    function write(rows: Row[]) {
        localStorage.setItem(key, JSON.stringify(rows));
    }

    function findIndex(rows: Row[], id: string) {
        const index = rows.findIndex((row) => row.id === id);

        if (index === -1) {
            throw new Error(`${name}: row ${id} not found`);
        }

        return index;
    }

    return {
        list(): Row[] {
            return read();
        },

        insert(values: Partial<Omit<Row, keyof BaseRow>>): Row {
            const now = new Date().toISOString();
            const row = {
                ...values,
                id: crypto.randomUUID(),
                user_id: getDevSession()?.user.id ?? '',
                created_at: now,
                updated_at: now,
            } as Row;

            write([...read(), row]);
            return row;
        },

        update(id: string, values: Partial<Row>): Row {
            const rows = read();
            const index = findIndex(rows, id);
            // Like Supabase, undefined fields leave the stored value as is.
            const defined = Object.fromEntries(
                Object.entries(values).filter(
                    ([, value]) => value !== undefined,
                ),
            );
            const row = { ...rows[index], ...defined, id };

            rows[index] = row;
            write(rows);
            return row;
        },

        remove(id: string): Row {
            const rows = read();
            const [row] = rows.splice(findIndex(rows, id), 1);

            write(rows);
            return row;
        },
    };
}
