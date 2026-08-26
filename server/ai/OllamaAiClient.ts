import type { AiClient } from './AiClient.ts';

type OllamaChatResponse = {
    choices: {
        message: {
            content: string;
        };
    }[];
};

export class OllamaAiClient implements AiClient {
    private readonly apiKey: string;
    private readonly model: string;

    constructor(apiKey: string, model: string) {
        this.apiKey = apiKey;
        this.model = model;
    }

    async generate(prompt: string): Promise<string> {
        const response = await fetch('https://ollama.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: this.model,
                messages: [
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
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
