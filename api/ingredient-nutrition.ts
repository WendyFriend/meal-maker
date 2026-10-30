import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleIngredientNutrition } from '../server/nutrition/handleIngredientNutrition.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.status(405).json({ message: 'Method not allowed' });
        return;
    }
    try {
        const result = await handleIngredientNutrition(
            req.body,
            req.headers['x-meal-generator'],
        );
        res.status(result.status).json(result.body);
    } catch (error) {
        console.error('Ingredient nutrition lookup failed:', error);
        res.status(500).json({
            message: 'Could not load ingredient nutrition.',
        });
    }
}
