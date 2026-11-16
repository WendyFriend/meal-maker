import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleNutritionLabel } from '../server/nutrition/label/readNutritionLabel.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.status(405).json({ message: 'Method not allowed' });
        return;
    }
    try {
        const result = await handleNutritionLabel(req.body);
        res.status(result.status).json(result.body);
    } catch (error) {
        console.error('Nutrition label scan failed:', error);
        res.status(500).json({ message: 'Could not read the label.' });
    }
}
