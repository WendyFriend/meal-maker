import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleScanIngredients } from '../server/nutrition/photo/scanIngredients.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.status(405).json({ message: 'Method not allowed' });
        return;
    }
    try {
        const result = await handleScanIngredients(req.body);
        res.status(result.status).json(result.body);
    } catch (error) {
        console.error('Ingredient photo scan failed:', error);
        res.status(500).json({ message: 'Could not scan the photo.' });
    }
}
