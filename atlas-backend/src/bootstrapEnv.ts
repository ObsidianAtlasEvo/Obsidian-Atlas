/**
 * Load env before `./config/env.js` runs. `dotenv/config` uses `process.cwd()`, which breaks
 * when `npm run dev` is started from the monorepo root instead of `atlas-backend/`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(backendRoot, '..');

const localEnv = path.join(repoRoot, '.env.local');
if (fs.existsSync(localEnv)) {
  dotenv.config({ path: localEnv });
}
/** Monorepo root `.env` (optional) — loaded before `atlas-backend/.env`, which wins on conflicts. */
const rootEnv = path.join(repoRoot, '.env');
if (fs.existsSync(rootEnv)) {
  dotenv.config({ path: rootEnv });
}
const backendEnv = path.join(backendRoot, '.env');
if (fs.existsSync(backendEnv)) {
  dotenv.config({ path: backendEnv, override: true });
}
