// Runs a read-only .sql probe and prints the rows as text.
//
// The project's apply-sql.mjs streams a file through psql without -t/-A, which
// is fine for migrations but unreadable for a SELECT. This keeps queries
// copy-pasteable as .sql files instead of fighting PowerShell quoting.
//
// Usage: node --env-file=.env db/ui/probe-sql.mjs db/probe-glycoalkaloids.sql
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const PSQL = process.env.PSQL_PATH || 'C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe';
const dbUrl = process.env.NUTRITION_DATABASE_URL;
const file = process.argv[2];

if (!dbUrl || !file) {
    console.error('Usage: node --env-file=.env db/ui/probe-sql.mjs <file.sql>');
    process.exit(1);
}

const parsed = new URL(dbUrl);
const sql = await readFile(resolve(file), 'utf8');

const args = [
    '-h', parsed.hostname,
    '-p', parsed.port || '5432',
    '-U', decodeURIComponent(parsed.username),
    '-d', parsed.pathname.replace(/^\//, ''),
    '-t', '-A', '-F', ' | ',
    '-v', 'ON_ERROR_STOP=1',
    '-f', '-',
];

const child = execFile(
    PSQL,
    args,
    {
        maxBuffer: 32 * 1024 * 1024,
        env: { ...process.env, PGPASSWORD: decodeURIComponent(parsed.password) },
        windowsHide: true,
    },
    (error, stdout, stderr) => {
        if (stdout.trim()) console.log(stdout.trim());
        if (error) {
            console.error(stderr.trim() || error.message);
            process.exit(1);
        }
    },
);

child.stdin.on('error', () => {});
child.stdin.end(sql);
