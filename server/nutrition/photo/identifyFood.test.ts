// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { handleIdentifyFood } from './identifyFood.js';
import { parseJsonObject } from '../../ai/vision.js';

afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

function modelReplies(content: string) {
    vi.stubEnv('OLLAMA_API_KEY', 'key');
    vi.stubEnv('OLLAMA_MODEL', 'gemma4');
    vi.stubGlobal(
        'fetch',
        vi
            .fn()
            .mockResolvedValue(
                new Response(
                    JSON.stringify({ choices: [{ message: { content } }] }),
                ),
            ),
    );
}

const image = 'data:image/jpeg;base64,abc';

it('returns a short search term for the photographed food', async () => {
    modelReplies('```json\n{"name": "  red   rice cooked "}\n```');
    expect(await handleIdentifyFood({ image })).toEqual({
        status: 200,
        body: { name: 'red rice cooked' },
    });
});

it('reports photos that do not show a food', async () => {
    modelReplies('{"name": null}');
    expect((await handleIdentifyFood({ image })).status).toBe(422);
});

it('rejects requests without a photo', async () => {
    expect((await handleIdentifyFood({ image: 'x' })).status).toBe(400);
});

it('reads JSON wrapped in a code fence', () => {
    expect(parseJsonObject('```json\n{"name":"oats"}\n```')).toEqual({
        name: 'oats',
    });
    expect(parseJsonObject('no json here')).toBeUndefined();
});
