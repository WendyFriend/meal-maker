import fs from 'node:fs';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import tailwindcss from '@tailwindcss/vite';

// Dev servers. The app runs on 3010 over HTTPS; the API moves to 3020.
//
// HTTPS is not cosmetic here: getUserMedia (the "speak your ingredients" mic)
// only exists in a secure context, and http://<lan-ip> is not one. localhost is
// exempt, which is why the mic works on this machine without TLS but would be
// dead on a phone.
//
// The certificate is self-signed, so a LAN device warns once. It covers
// localhost and the current LAN addresses; regenerate it if the IP changes.
const certPath = './certs/dev-cert.pem';
const keyPath = './certs/dev-key.pem';

const https =
    fs.existsSync(certPath) && fs.existsSync(keyPath)
        ? {
              cert: fs.readFileSync(certPath),
              key: fs.readFileSync(keyPath),
          }
        : undefined;

export const APP_PORT = 3010;
export const API_PORT = 3020;

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
        tailwindcss(),
    ],
    test: {
        environment: 'jsdom',
        setupFiles: './client/test/setup.ts',
        // `db/` holds standalone tooling tested with `node --test`, not vitest.
        // Without this exclusion vitest picks the files up, finds no vitest
        // suite in them, and reports a failure.
        exclude: ['**/node_modules/**', '**/dist/**', 'db/**'],
    },
    preview: {
        host: true,
        port: 4180,
        strictPort: true,
        https,
    },
    server: {
        // 0.0.0.0 so a phone on the LAN can reach it; with host: 'localhost'
        // the server is unreachable from anything but this machine.
        host: '0.0.0.0',
        port: APP_PORT,
        strictPort: true,
        https,
        proxy: {
            '/api': `http://localhost:${API_PORT}`,
        },
    },
});
