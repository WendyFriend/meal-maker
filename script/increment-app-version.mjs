import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const versionFile = fileURLToPath(
    new URL('../client/version.ts', import.meta.url),
);
const dryRun = process.argv.includes('--dry-run');
const source = await readFile(versionFile, 'utf8');
const versionPattern =
    /(export const APP_VERSION\s*=\s*['"])(\d+)\.(\d+)\.(\d+)(['"];?)/;
const match = source.match(versionPattern);

if (!match) {
    throw new Error(`Could not find a valid APP_VERSION in ${versionFile}`);
}

const [, prefix, major, minor, patch, suffix] = match;
const currentVersion = `${major}.${minor}.${patch}`;
const nextVersion = `${major}.${minor}.${Number(patch) + 1}`;

if (!dryRun) {
    await writeFile(
        versionFile,
        source.replace(versionPattern, `${prefix}${nextVersion}${suffix}`),
    );
}

console.log(
    `App version: ${currentVersion} -> ${nextVersion}${dryRun ? ' (dry run)' : ''}`,
);
