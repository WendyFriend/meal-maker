import fs from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

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
                theme_color: '#8b5cf6',
                background_color: '#fafafa',
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
    ],
    preview: {
        host: true,
        https,
    },
});
