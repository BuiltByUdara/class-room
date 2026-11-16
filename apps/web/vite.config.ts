import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const apiUrl = process.env.VITE_API_URL || env.VITE_API_URL;
  if (command === 'build') {
    if (!apiUrl) throw new Error('Set VITE_API_URL to your deployed API origin before building the web app');
    const parsed = new URL(apiUrl);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== apiUrl.replace(/\/$/, '')) throw new Error('VITE_API_URL must be an HTTP(S) origin without a path');
    if (parsed.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(parsed.hostname)) throw new Error('A deployed API must use HTTPS');
  }
  return { plugins: [react(), tailwindcss(), {
    name: 'deployment-headers',
    generateBundle() {
      const origin = new URL(apiUrl!).origin;
      this.emitFile({ type: 'asset', fileName: '_headers', source: `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://drive.google.com https://*.googleusercontent.com; font-src 'self'; connect-src 'self' ${origin}; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'
  Cache-Control: no-cache
/assets/*
  Cache-Control: public, max-age=31536000, immutable
` });
      this.emitFile({ type: 'asset', fileName: '_redirects', source: '/* /index.html 200\n' });
    },
  }], resolve: { dedupe: ['zod'], alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } }, server: { port: 5173, strictPort: true } };
});
