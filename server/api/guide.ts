// GET /api/v1/docs: the usage guide for client developers and their agents.
//
// The guide is docs/api-for-agents.md, read from disk on each request so an
// edit shows up without a restart. A list of the endpoints this server
// actually has is appended, built from the router's own table, so that part can
// never drift from the code. The bundle build copies the markdown next to
// dist-server/server.mjs.
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const CANDIDATES = [
    join(here, 'api-for-agents.md'), // production bundle: dist-server/
    join(here, '..', '..', 'docs', 'api-for-agents.md'), // repo checkout: server/api/
];

export type EndpointSummary = { method: string; path: string; scope: string };

export type Guide = {
    markdown: string;
    /** Changes whenever the guide or the endpoint list changes. */
    version: string;
    updated: string;
};

export async function loadGuide(endpoints: EndpointSummary[]): Promise<Guide | null> {
    for (const file of CANDIDATES) {
        try {
            const [text, info] = await Promise.all([readFile(file, 'utf8'), stat(file)]);
            const table = [
                '',
                '## Endpoints on this server',
                '',
                'Generated from the running server, so always current.',
                '',
                '| Method | Path | Scope |',
                '| --- | --- | --- |',
                ...endpoints.map((e) => `| ${e.method} | \`${e.path}\` | ${e.scope} |`),
                '',
            ].join('\n');
            const markdown = `${text.trimEnd()}\n${table}`;
            return {
                markdown,
                version: createHash('sha256').update(markdown).digest('hex').slice(0, 12),
                updated: info.mtime.toISOString(),
            };
        } catch {
            // try the next location
        }
    }
    return null;
}
