import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleFoodSearch } from '../server/nutrition/handleFoodSearch.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET')
        return res.status(405).json({ message: 'Method not allowed' });
    try {
        const result = await handleFoodSearch(req.query.q);
        return res.status(result.status).json(result.body);
    } catch (error) {
        console.error('Nutrition Lab food search failed:', error);
        return res.status(502).json({ message: 'Could not search foods.' });
    }
}
