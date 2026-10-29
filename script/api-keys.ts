// Manage MealMaker API keys (server/api/keys.ts).
//
//   npm run api-keys -- create "Wendy dev" --scopes foods,parse,voice,generate --rate 120 --env dev
//   npm run api-keys -- list
//   npm run api-keys -- revoke <id>
//   npm run api-keys -- usage [days]
//
// Talks to whichever keys database the environment points at: the local one
// with this repo's .env, or the VPS when run there (or with API_DATABASE_URL
// set to it). A new key is printed once and cannot be shown again.
import { apiDb, createKey, ensureApiSchema, SCOPES, type Scope } from '../server/api/keys.ts';

const [command, ...args] = process.argv.slice(2);

function option(name: string): string | undefined {
    const index = args.indexOf(`--${name}`);
    return index === -1 ? undefined : args[index + 1];
}

async function main() {
    await ensureApiSchema();
    const db = apiDb();

    if (command === 'create') {
        const name = args[0];
        if (!name || name.startsWith('--')) throw new Error('Give the key a name: create "Wendy dev" ...');
        const scopes = (option('scopes') ?? SCOPES.join(',')).split(',').map((s) => s.trim());
        const unknown = scopes.filter((s) => !(SCOPES as readonly string[]).includes(s));
        if (unknown.length) throw new Error(`Unknown scopes: ${unknown.join(', ')}. Known: ${SCOPES.join(', ')}`);
        const env = option('env') === 'dev' ? 'dev' : 'live';
        const rate = Number(option('rate') ?? 60);

        const { key, id } = await createKey({ name, scopes: scopes as Scope[], ratePerMinute: rate, env });
        console.log(`Created key ${id} "${name}" (scopes: ${scopes.join(', ')}; ${rate}/min).`);
        console.log('\nKey (shown once, store it now):\n');
        console.log(`  ${key}\n`);
        return;
    }

    if (command === 'list') {
        const { rows } = await db.query(
            `SELECT id, name, prefix, array_to_string(scopes, ',') AS scopes, rate_per_minute AS "perMin",
                    to_char(created_at, 'YYYY-MM-DD') AS created,
                    coalesce(to_char(last_used_at, 'YYYY-MM-DD HH24:MI'), '-') AS "lastUsed",
                    CASE WHEN revoked_at IS NULL THEN '' ELSE 'revoked' END AS status
             FROM api.api_key ORDER BY id`,
        );
        console.table(rows);
        return;
    }

    if (command === 'revoke') {
        const id = Number(args[0]);
        const { rowCount } = await db.query('UPDATE api.api_key SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL', [id]);
        console.log(rowCount ? `Revoked key ${id}. Running servers stop accepting it within 30 s.` : `No active key ${id}.`);
        return;
    }

    if (command === 'usage') {
        const days = Number(args[0]) || 7;
        const { rows } = await db.query(
            `SELECT coalesce(k.name, '(no key)') AS key, r.route, count(*)::int AS requests,
                    count(*) FILTER (WHERE r.status >= 400)::int AS errors, round(avg(r.ms))::int AS "avgMs"
             FROM api.api_request r LEFT JOIN api.api_key k ON k.id = r.key_id
             WHERE r.at > now() - make_interval(days => $1)
             GROUP BY 1, 2 ORDER BY 1, 3 DESC`,
            [days],
        );
        console.table(rows);
        return;
    }

    console.log('Usage: npm run api-keys -- create "<name>" [--scopes foods,parse,voice,generate] [--rate 60] [--env dev|live]');
    console.log('       npm run api-keys -- list | revoke <id> | usage [days]');
}

main()
    .catch((error: Error) => {
        console.error(error.message);
        process.exitCode = 1;
    })
    .finally(() => apiDb().end().catch(() => {}));
