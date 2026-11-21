import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { Plugin } from 'vite';

/** Liste des fichiers générés, préchargés par le service worker pour un usage hors ligne complet. */
function assetManifest(): Plugin {
  return {
    name: 'knowlist-asset-manifest',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const files = Object.keys(bundle)
        .filter((f) => f.startsWith('assets/') && !/\.woff$/.test(f) && !/(vietnamese|latin-ext)/.test(f))
        .map((f) => `/${f}`);
      this.emitFile({ type: 'asset', fileName: 'asset-manifest.json', source: JSON.stringify({ files }) });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), assetManifest()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000', '/robots.txt': 'http://localhost:3000' },
  },
  build: {
    target: 'es2022',
    cssCodeSplit: true,
    sourcemap: false,
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
} as any);
