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

// crypto.randomUUID only exists in secure contexts (https or localhost), so
// a phone opening the dev server by LAN address needs a fallback.
function newId(): string {
    if (typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0'));

    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}

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
                id: newId(),
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
