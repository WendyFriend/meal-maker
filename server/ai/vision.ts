import { OllamaAiClient } from './OllamaAiClient.js';

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
