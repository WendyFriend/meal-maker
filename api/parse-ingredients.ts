import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleParseIngredients } from '../server/nutrition/handleFoodSearch.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.status(405).json({ message: 'Method not allowed' });
        return;
    }
    const result = await handleParseIngredients(req.body);
    res.status(result.status).json(result.body);
}
