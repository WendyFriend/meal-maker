import { OllamaAiClient } from './OllamaAiClient.js';

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

/** Models sometimes wrap JSON in prose or code fences; keep the object. */
export function parseJsonObject(reply: string): unknown {
    const start = reply.indexOf('{');
    const end = reply.lastIndexOf('}');
    if (start < 0 || end < start) return undefined;
    try {
        return JSON.parse(reply.slice(start, end + 1));
    } catch {
        return undefined;
    }
}

/** Asks the configured vision model about a photo and parses its JSON reply. */
export async function askVisionJson(
    systemPrompt: string,
    userPrompt: string,
    image: string,
): Promise<unknown> {
    const apiKey = process.env.OLLAMA_API_KEY;
    const model = process.env.OLLAMA_VISION_MODEL ?? process.env.OLLAMA_MODEL;
    if (!apiKey || !model) throw new Error('Ollama is not configured');
    const reply = await new OllamaAiClient(apiKey, model).generateFromImage(
        systemPrompt,
        userPrompt,
        image,
        'json',
    );
    return parseJsonObject(reply);
}
