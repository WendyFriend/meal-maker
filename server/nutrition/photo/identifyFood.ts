import { askVisionJson } from '../../ai/vision.js';
import { imageFromRequest } from './imageFromRequest.js';

const systemPrompt = `You identify a single food or ingredient in a photo.
Reply with JSON only: { "name": string | null }
"name" is a short food database search term, 1 to 4 words, lowercase,
including the variety and state when visible (for example "red rice cooked",
"rolled oats", "firm tofu"). Read the product name if the photo shows packaging.
Use null if the photo does not show a food.`;

/** Reads a food photo and returns a search term for the food database. */
export async function handleIdentifyFood(input: unknown) {
    const image = imageFromRequest(input);
    if (!image) {
        return {
            status: 400,
            body: { message: 'Provide a JPEG, PNG or WebP photo.' },
        };
    }
    const reply = await askVisionJson(
        systemPrompt,
        'What food is this?',
        image,
    );
    const name =
        typeof reply === 'object' &&
        reply !== null &&
        'name' in reply &&
        typeof reply.name === 'string'
            ? reply.name.trim().replace(/\s+/g, ' ').slice(0, 60)
            : '';
    return name.length >= 2
        ? { status: 200, body: { name } }
        : {
              status: 422,
              body: {
                  message:
                      'Couldn’t recognise the food. Search for it instead.',
              },
          };
}
