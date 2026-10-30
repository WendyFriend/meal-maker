import fs from 'node:fs';
import { defineConfig } from 'vitest/config';
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
        react(),
        VitePWA({
            registerType: 'autoUpdate',
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
