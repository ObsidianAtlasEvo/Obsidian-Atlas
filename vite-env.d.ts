/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ATLAS_API_URL?: string;
  readonly VITE_ATLAS_AUTH_DISABLED?: string;
  /** Production: SPA and API share a host; use relative `/api` paths without `VITE_ATLAS_API_URL`. */
  readonly VITE_ATLAS_SAME_ORIGIN?: string;
  /** Dev: override proxy target for `/api` and `/auth` (default `http://127.0.0.1:3001`). */
  readonly VITE_ATLAS_PROXY_TARGET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
