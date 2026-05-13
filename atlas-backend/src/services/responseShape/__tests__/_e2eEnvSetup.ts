/**
 * Side-effect-only module that primes process.env before the e2e test imports
 * the overseer + env modules. ESM hoists imports, so this file's top-level
 * mutation runs before any module that imports it.
 *
 * Loaded ONLY by integration.e2e.test.ts. Do not import elsewhere.
 */

if (!process.env.GROQ_API_KEY) {
  process.env.GROQ_API_KEY = 'test-key-e2e';
}
