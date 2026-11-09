import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { Analytics } from '@vercel/analytics/react';
import './index.css';
import App from './App.tsx';
import { AuthProvider } from './auth/AuthContext';

registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <AuthProvider>
            <App />
        </AuthProvider>
        <Analytics />
    </StrictMode>,
);
