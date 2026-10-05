// thin Vercel adapter around handleGenerateMeal()
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { GenerateMealRequest } from '../shared/types/types.ts';
import { handleGenerateMealOllama } from '../server/meal-generator/algorithms/generateMealOllama.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.status(404).json({ error: 'Not found' });
        return;
    }

    try {
        const input = req.body as GenerateMealRequest;

        const result = await handleGenerateMealOllama(input);

        res.status(result.status).json(result.body);
    } catch (error) {
        console.error('generate-meal error:', error);

        res.status(500).json({
            message: 'Failed to generate meal',
        });
    }
}
