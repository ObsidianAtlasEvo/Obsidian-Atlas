/**
 * Atlas Backend — esbuild production build
 *
 * Replaces `tsc` for production/VPS builds (10–20x faster).
 * Type-checking is done separately via `npm run typecheck` in CI.
 *
 * Output: ESM files in dist/ mirroring src/ structure.
 */

import { build } from 'esbuild';
import { rmSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

/** Recursively collect all .ts files under a directory */
function collectTs(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectTs(full, files);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      files.push(full);
    }
  }
  return files;
}

const srcDir = join(__dirname, 'src');
const distDir = join(__dirname, 'dist');
const srcFiles = collectTs(srcDir);

// Clean dist/
rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

console.log(`Building ${srcFiles.length} TypeScript files with esbuild...`);

await build({
  entryPoints: srcFiles,
  outdir: distDir,
  outbase: srcDir,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  bundle: false,      // transpile-only — keeps native addons and Node resolution working
  sourcemap: false,
  minify: false,
  logLevel: 'info',
});

console.log(`✓ Built ${srcFiles.length} files → dist/`);
