import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
const API_TARGET = process.env.VITE_API_TARGET || 'http://localhost:3000';
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    server: {
        port: 5173,
        fs: { allow: ['..'] },
        proxy: {
            '/api': { target: API_TARGET, changeOrigin: true },
            '/ws': { target: API_TARGET, ws: true, changeOrigin: true },
            '/.proxy/api': { target: API_TARGET, changeOrigin: true, rewrite: (p) => p.replace(/^\/\.proxy/, '') },
            '/.proxy/ws': { target: API_TARGET, ws: true, changeOrigin: true, rewrite: (p) => p.replace(/^\/\.proxy/, '') },
        },
    },
    build: {
        outDir: 'dist',
        sourcemap: true,
        chunkSizeWarningLimit: 900,
    },
});
