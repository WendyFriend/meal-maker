export type AiClient = {
    generate: (prompt: string) => Promise<string>;
};
