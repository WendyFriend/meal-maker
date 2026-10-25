// thin Vercel adapter around matchIngredientsRoute()
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { matchIngredientsRoute } from '../server/nutrition/matchIngredients.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.status(404).json({ error: 'Not found' });
        return;
    }

    const result = await matchIngredientsRoute(req.body);

    res.status(result.status).json(result.body);
}
