import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleIdentifyFood } from '../server/nutrition/photo/identifyFood.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.status(405).json({ message: 'Method not allowed' });
        return;
    }
    try {
        const result = await handleIdentifyFood(req.body);
        res.status(result.status).json(result.body);
    } catch (error) {
        console.error('Food photo identification failed:', error);
        res.status(500).json({ message: 'Could not identify the food.' });
    }
}
