// thin Vercel adapter around searchNutrition()
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { searchNutrition } from '../server/nutrition/searchNutrition.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        res.status(404).json({ error: 'Not found' });
        return;
    }

    const q = Array.isArray(req.query.q) ? req.query.q[0] : req.query.q;
    const result = await searchNutrition(q);

    res.status(result.status).json(result.body);
}
