// Generated food thumbnails (db/lab/thumb_studio.py), served as files.
//
// THUMBNAIL_DIR points at the folder of <fdc_id>.webp files; by default that is
// db/lab/thumbnails in this checkout, where the studio writes them. Most foods
// don't have one yet: a missing file is a 404 and clients show no image.
import type { ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const THUMBNAIL_DIR = process.env.THUMBNAIL_DIR || join(here, '..', 'db', 'lab', 'thumbnails');

/** Writes the thumbnail named like "171474.webp", or a 400/404. Returns the status sent. */
export async function sendThumbnail(res: ServerResponse, name: string): Promise<number> {
    if (!/^\d{1,9}\.webp$/.test(name)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { code: 'BAD_THUMBNAIL_NAME', message: 'Expected <fdcId>.webp' } }));
        return 400;
    }

    try {
        const data = await readFile(join(THUMBNAIL_DIR, name));
        res.writeHead(200, { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=3600' });
        res.end(data);
        return 200;
    } catch {
        res.writeHead(404);
        res.end();
        return 404;
    }
}
