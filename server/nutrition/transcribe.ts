// Speech-to-text for the recipe builder.
//
// The browser records one utterance and posts the raw bytes here; this forwards
// them to OpenAI and returns the cleaned transcript. Raw-body rather than
// multipart because there is exactly one clip per request and writing a
// multipart parser for that is not worth it.
//
// The helper logic below (container sniffing, transcript cleaning) is a direct
// port of the working implementation in `db/ui/lookup.mjs`, which is unit-tested
// there. Keeping the two in step matters: both feed the same resolver.
import type { IncomingMessage } from 'node:http';

const TRANSCRIBE_MODEL = process.env.TRANSCRIBE_MODEL || 'gpt-transcribe';
// A spoken ingredient is a few hundred KB. Cap well above that so a runaway
// upload cannot exhaust memory.
const MAX_AUDIO_BYTES = 12 * 1024 * 1024;
const MAX_SECONDS = 20;

/**
 * Identifies the audio container from its magic bytes.
 *
 * The browser sends audio/webm, but Safari sends mp4 and a test client may send
 * wav. Labelling the upload by its actual bytes rather than by an assumed
 * extension is what stops OpenAI replying "Audio file might be corrupted or
 * unsupported".
 */
export function sniffAudio(buffer: Buffer): { name: string; type: string } {
    const ascii = (from: number, to: number) => buffer.subarray(from, to).toString('latin1');

    if (buffer.length >= 4 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') {
        return { name: 'clip.wav', type: 'audio/wav' };
    }
    // EBML header covers webm and mkv.
    if (buffer.length >= 4 && buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
        return { name: 'clip.webm', type: 'audio/webm' };
    }
    if (buffer.length >= 8 && ascii(4, 8) === 'ftyp') {
        return { name: 'clip.m4a', type: 'audio/mp4' };
    }
    if (buffer.length >= 3 && ascii(0, 3) === 'ID3') {
        return { name: 'clip.mp3', type: 'audio/mpeg' };
    }
    return { name: 'clip.webm', type: 'audio/webm' };
}

/**
 * Cleans a raw transcript into something worth searching for.
 *
 * Speech comes back with sentence punctuation and capitalisation: saying
 * "tomato" yields "Tomato." That trailing full stop breaks an exact name match,
 * so only edge punctuation is removed. Interior characters are meaningful — the
 * comma in "tomato, red" and the hyphen in "extra-virgin" must survive.
 */
export function cleanTranscript(raw: unknown): string {
    return String(raw ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^[^\p{L}\p{N}]+/u, '')
        .replace(/[^\p{L}\p{N}]+$/u, '')
        .trim();
}

/** Reads the raw request body, refusing anything implausibly large. */
export function readAudioBody(req: IncomingMessage): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let size = 0;

        req.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > MAX_AUDIO_BYTES) {
                reject(new Error('audio too large'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

export type TranscribeResult =
    | { status: 200; body: { text: string } }
    | { status: 400 | 502 | 503; body: { error: { code: string; message: string } } };

/**
 * Transcribes one clip.
 *
 * `keywords` is a domain hint: OpenAI documents it as a hint only, so it cannot
 * inject words the speaker did not say, but it improves accuracy on food names
 * that are commonly misheard or are non-US vocabulary.
 */
export async function transcribeAudio(
    buffer: Buffer,
    apiKey = process.env.OPENAI_API_KEY,
): Promise<TranscribeResult> {
    if (!apiKey) {
        return {
            status: 503,
            body: {
                error: {
                    code: 'TRANSCRIPTION_DISABLED',
                    message: 'OPENAI_API_KEY is not set, so voice input is unavailable.',
                },
            },
        };
    }

    if (!buffer.length) {
        return {
            status: 400,
            body: { error: { code: 'EMPTY_AUDIO', message: 'No audio was received.' } },
        };
    }

    const { name, type } = sniffAudio(buffer);
    const form = new FormData();
    form.append('file', new Blob([buffer], { type }), name);
    form.append('model', TRANSCRIBE_MODEL);
    for (const keyword of [
        'courgette',
        'aubergine',
        'chickpeas',
        'garbanzo',
        'coriander',
        'cilantro',
        'capsicum',
        'rocket',
        'prawns',
        'mince',
    ]) {
        form.append('keywords[]', keyword);
    }
    form.append('languages[]', 'en');

    try {
        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}` },
            body: form,
        });

        if (!response.ok) {
            const detail = (await response.text()).slice(0, 200);
            console.error('transcription failed:', response.status, detail);
            return {
                status: 502,
                body: {
                    error: {
                        code: 'TRANSCRIPTION_FAILED',
                        message: 'Could not transcribe that clip.',
                    },
                },
            };
        }

        const data = (await response.json()) as { text?: string };
        return { status: 200, body: { text: cleanTranscript(data.text) } };
    } catch (error) {
        console.error('transcription error:', error);
        return {
            status: 502,
            body: {
                error: {
                    code: 'TRANSCRIPTION_FAILED',
                    message: 'Could not reach the transcription service.',
                },
            },
        };
    }
}

/** Route wrapper: reads the body, then transcribes. */
export async function transcribeRoute(req: IncomingMessage): Promise<TranscribeResult> {
    let buffer: Buffer;
    try {
        buffer = await readAudioBody(req);
    } catch {
        return {
            status: 400,
            body: { error: { code: 'AUDIO_TOO_LARGE', message: `Keep clips under ${MAX_SECONDS}s.` } },
        };
    }
    return transcribeAudio(buffer);
}
