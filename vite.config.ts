import fs from 'node:fs';
import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import tailwindcss from '@tailwindcss/vite';

const certPath = './192.168.4.26.pem';
const keyPath = './192.168.4.26-key.pem';

const https =
    fs.existsSync(certPath) && fs.existsSync(keyPath)
        ? {
              cert: fs.readFileSync(certPath),
              key: fs.readFileSync(keyPath),
          }
        : undefined;

export default defineConfig({
    plugins: [
        {
            name: 'validate-supabase-build-env',
            configResolved(config) {
                if (config.command !== 'build') return;
                const env = loadEnv(config.mode, config.root, 'VITE_');
                for (const key of [
                    'VITE_SUPABASE_URL',
                    'VITE_SUPABASE_PUBLISHABLE_KEY',
                ]) {
                    if (!env[key])
                        throw new Error(
                            `${key} is required for the client build`,
                        );
                }
            },
        },
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            workbox: {
                navigateFallback: '/index.html',
                runtimeCaching: [
                    {
                        // Food IDs produce stable WebP URLs. Cache thumbnails
                        // across visits, including the common foods shown
                        // whenever database search opens.
                        urlPattern: ({ request, url }) =>
                            request.destination === 'image' &&
                            /\/thumbnails\/\d+\.webp$/.test(url.pathname),
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'nutrition-lab-thumbnails',
                            cacheableResponse: { statuses: [0, 200] },
                            expiration: {
                                maxEntries: 120,
                                maxAgeSeconds: 30 * 24 * 60 * 60,
                            },
                        },
                    },
                ],
            },
            manifest: {
                name: 'MealMaker',
                short_name: 'MealMaker',
                description: 'Create meals from the ingredients you have.',
                theme_color: '#fbf6ee',
                background_color: '#fbf6ee',
                display: 'standalone',
                icons: [
                    {
                        src: '/icon-192.png',
                        sizes: '192x192',
                        type: 'image/png',
                    },
                    {
                        src: '/icon-512.png',
                        sizes: '512x512',
                        type: 'image/png',
                    },
                    {
                        src: '/icon-192-maskable.png',
                        sizes: '192x192',
                        type: 'image/png',
                        purpose: 'maskable',
                    },
                    {
                        src: '/icon-512-maskable.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'maskable',
                    },
                ],
            },
        }),
        tailwindcss(),
    ],
    test: {
        environment: 'jsdom',
        setupFiles: './client/test/setup.ts',
    },
    preview: {
        host: true,
        port: 4173,
        strictPort: true,
        https,
    },
    server: {
        host: true,
        port: 5173,
        strictPort: true,
        proxy: {
            '/api': 'http://localhost:3001',
        },
    },
});
