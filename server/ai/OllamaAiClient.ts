type OllamaChatResponse = {
    choices: {
        message: {
            content: string;
        };
    }[];
};

type ChatMessage = {
    role: 'system' | 'user';
    content:
        | string
        | (
              | { type: 'text'; text: string }
              | { type: 'image_url'; image_url: { url: string } }
          )[];
};

/** Ollama's OpenAI-compatible chat API, used for photo reading. */
export class OllamaAiClient {
    private readonly apiKey: string;
    private readonly model: string;

    constructor(apiKey: string, model: string) {
        this.apiKey = apiKey;
        this.model = model;
    }

    /** Asks a vision model about one image, given as a base64 data URL. */
    generateFromImage(
        systemPrompt: string,
        userPrompt: string,
        imageDataUrl: string,
        responseFormat?: 'json',
    ): Promise<string> {
        return this.chat(
            [
                { role: 'system', content: systemPrompt },
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: userPrompt },
                        { type: 'image_url', image_url: { url: imageDataUrl } },
                    ],
                },
            ],
            responseFormat,
        );
    }

    private async chat(
        messages: ChatMessage[],
        responseFormat?: 'json',
    ): Promise<string> {
        const response = await fetch('https://ollama.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: this.model,
                messages,
                ...(responseFormat && {
                    response_format: {
                        type: responseFormat,
                    },
                }),
            }),
        });

        if (!response.ok) {
            throw new Error(
                `Ollama API request failed: ${response.status} ${response.statusText}`,
            );
        }

        const data = (await response.json()) as OllamaChatResponse;

        return data.choices[0].message.content;
    }
}
