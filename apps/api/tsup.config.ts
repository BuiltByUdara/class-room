import { defineConfig } from 'tsup';
export default defineConfig({ entry: ['src/server.ts'], format: ['esm'], target: 'node20', outDir: 'dist', noExternal: ['@tuition/contracts'], sourcemap: true });
