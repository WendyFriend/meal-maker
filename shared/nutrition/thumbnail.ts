/* Generated food thumbnails (db/lab/thumb_studio.py), served by server/server.ts
   from db/lab/thumbnails/<fdc_id>.webp. Most foods don't have one yet -- the
   server 404s and callers should fall back to no image (e.g. an <img
   onError={(e) => e.currentTarget.remove()}>) rather than show a broken icon. */
export function thumbnailUrl(fdcId: number): string {
    return `/api/thumbnails/${fdcId}.webp`;
}
