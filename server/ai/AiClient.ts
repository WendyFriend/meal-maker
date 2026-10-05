export type AiClient = {
    generate: (systemPrompt: string, userPrompt: string) => Promise<string>;
};
