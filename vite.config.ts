// Atlas-Audit: [PERF-P1] Verified — Rollup manualChunks for react, motion, d3, lucide, firebase, markdown + residual vendor (smaller main chunk, better HTTP cache).
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function npmPackageRoot(id: string, pkg: string): boolean {
  const n = id.replace(/\\/g, '/');
  return n.includes(`node_modules/${pkg}/`);
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const chatUrlEnv = env.OLLAMA_CHAT_URL?.trim();
  /** Same-origin `/ollama/*` → proxy (avoids mixed content when the SPA is served over HTTPS, e.g. Cloudflare Tunnel). */
  const defaultChatUrl =
    chatUrlEnv && chatUrlEnv.length > 0 ? chatUrlEnv : '/ollama/api/chat';

  /** Atlas Node backend (Fastify) — cookies + CORS must align with `credentials: 'include'`. */
  const atlasProxyTarget = env.VITE_ATLAS_PROXY_TARGET?.trim() || 'http://127.0.0.1:3001';

  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.OLLAMA_CHAT_URL': JSON.stringify(defaultChatUrl),
      'process.env.OLLAMA_MODEL': JSON.stringify(env.OLLAMA_MODEL ?? 'llama3.1:70b'),
      'process.env.OLLAMA_EMBED_MODEL': JSON.stringify(env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text'),
      'process.env.OLLAMA_REQUEST_TIMEOUT_MS': JSON.stringify(
        env.OLLAMA_REQUEST_TIMEOUT_MS ?? '1200000'
      ),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        'firebase/app': path.resolve(__dirname, 'src/shims/firebase-app.ts'),
        'firebase/auth': path.resolve(__dirname, 'src/shims/firebase-auth.ts'),
        'firebase/firestore': path.resolve(__dirname, 'src/shims/firebase-firestore.ts'),
      },
    },
    server: {
      /** Expose on all interfaces so Cloudflare Tunnel / LAN can reach :3000 (see also `npm run dev:web --host`). */
      host: true,
      /** Public URL for OAuth is still `NEXTAUTH_URL` / `AUTH_URL` (e.g. https://obsidianatlastech.com). */
      port: 3000,
      /** If 3000 is taken, fail fast instead of binding to 3001 (which would collide with atlas-backend). */
      strictPort: true,
      // Optional: set DISABLE_HMR=true to reduce reload churn when an external agent edits files.
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/ollama': {
          target: 'http://127.0.0.1:11434',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/ollama/, ''),
        },
        /** REST + SSE: `/api/v1/...` → backend `/v1/...` */
        '/api': {
          target: atlasProxyTarget,
          changeOrigin: true,
          secure: false,
          rewrite: (p) => p.replace(/^\/api/, ''),
        },
        /** Google OAuth + session cookies: `/auth/...` → backend */
        '/auth': {
          target: atlasProxyTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    build: {
      // App chunk remains large until route-level lazy loading; vendors are split out above.
      chunkSizeWarningLimit: 950,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            if (
              npmPackageRoot(id, 'react') ||
              npmPackageRoot(id, 'react-dom') ||
              npmPackageRoot(id, 'scheduler')
            ) {
              return 'react-vendor';
            }
            if (npmPackageRoot(id, 'motion') || npmPackageRoot(id, 'framer-motion')) {
              return 'motion-vendor';
            }
            if (npmPackageRoot(id, 'd3')) return 'd3-vendor';
            if (npmPackageRoot(id, 'lucide-react')) return 'lucide-vendor';
            if (npmPackageRoot(id, 'firebase') || npmPackageRoot(id, '@firebase')) {
              return 'firebase-vendor';
            }
            if (npmPackageRoot(id, 'react-markdown')) return 'markdown-vendor';
            if (npmPackageRoot(id, 'dexie')) return 'dexie-vendor';
            if (npmPackageRoot(id, 'zustand')) return 'zustand-vendor';
            return 'vendor';
          },
        },
      },
    },
  };
});
