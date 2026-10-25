/*
 * Local layout preview harness.
 * Renders the REAL app by injecting a signed-in Supabase session into
 * localStorage. Server-side RLS rejects the fabricated token, but those
 * failures are caught (loadIngredients) or render empty states — which is
 * exactly what we want for layout QA. No app code is modified.
 */
export default async function run(page) {
    const now = Math.floor(Date.now() / 1000);
    const session = {
        access_token: 'qa-preview-token',
        token_type: 'bearer',
        expires_in: 3600,
        // Far future so supabase-js returns the session without refreshing
        expires_at: now + 60 * 60 * 24 * 7,
        refresh_token: 'qa-preview-refresh',
        user: {
            id: '00000000-0000-0000-0000-0000000000aa',
            aud: 'authenticated',
            role: 'authenticated',
            email: 'qa-preview@example.com',
            app_metadata: { provider: 'email' },
            user_metadata: {},
            created_at: new Date().toISOString(),
        },
    };

    await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
    await page.evaluate((s) => {
        localStorage.setItem(
            'sb-fgiceoltfrerviphnxka-auth-token',
            JSON.stringify(s),
        );
    }, session);
    await page.reload({ waitUntil: 'networkidle' });

    // Wait for the authenticated app to mount
    await page.waitForFunction(
        () => !!document.querySelector('.meal-maker-screen'),
        undefined,
        { timeout: 15000 },
    );

    return 'app mounted';
}
