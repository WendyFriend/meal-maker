import { describe, expect, it } from 'vitest';
import { loadGuide } from './guide.ts';

describe('loadGuide', () => {
    const endpoints = [
        { method: 'GET', path: '/api/v1/health', scope: 'public' },
        { method: 'POST', path: '/api/v1/parse', scope: 'parse' },
    ];

    it('serves docs/api-for-agents.md with the live endpoint table appended', async () => {
        const guide = await loadGuide(endpoints);
        expect(guide).not.toBeNull();
        expect(guide!.markdown).toMatch(/^# MealMaker API/);
        expect(guide!.markdown).toContain('## Endpoints on this server');
        expect(guide!.markdown).toContain('| POST | `/api/v1/parse` | parse |');
        expect(guide!.updated).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('changes version when the endpoint list changes', async () => {
        const a = await loadGuide(endpoints);
        const b = await loadGuide([...endpoints, { method: 'GET', path: '/api/v1/new', scope: 'foods' }]);
        expect(a!.version).toMatch(/^[0-9a-f]{12}$/);
        expect(b!.version).not.toBe(a!.version);
    });
});
