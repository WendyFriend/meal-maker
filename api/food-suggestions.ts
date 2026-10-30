import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleFoodSuggestions } from '../server/nutrition/handleFoodSearch.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        res.status(405).json({ message: 'Method not allowed' });
        return;
    }
    const q = req.query.q;
    const result = await handleFoodSuggestions(
        typeof q === 'string' ? q : null,
    );
    res.status(result.status).json(result.body);
}
