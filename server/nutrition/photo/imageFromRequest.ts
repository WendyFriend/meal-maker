const MAX_IMAGE_CHARS = 6_000_000;

/** Returns the photo when the request carries a usable image data URL. */
export function imageFromRequest(input: unknown): string | undefined {
    const image =
        typeof input === 'object' && input !== null && 'image' in input
            ? input.image
            : undefined;
    return typeof image === 'string' &&
        /^data:image\/(jpeg|png|webp);base64,/.test(image) &&
        image.length <= MAX_IMAGE_CHARS
        ? image
        : undefined;
}
