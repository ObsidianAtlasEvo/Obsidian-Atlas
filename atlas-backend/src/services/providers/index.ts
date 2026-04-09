// ── Provider Factory ──────────────────────────────────────────────────────────
// Creates and returns all provider instances, keyed by provider ID.
// OpenAI-compatible providers share the same factory function — they differ
// only in base URL, API key env var, and default model name.

import { createOpenAICompatibleProvider } from './base.js';
import { OllamaProvider } from './ollama.js';
import { AnthropicProvider } from './anthropic.js';
import { GoogleProvider } from './google.js';
import type { ModelProvider } from './base.js';

export type { ModelProvider, ProviderMessage, CompletionOptions, CompletionResult } from './base.js';

let _providerCache: Map<string, ModelProvider> | null = null;

/**
 * Create (and cache) all provider instances.
 *
 * The map is keyed by provider ID string (e.g. 'openai', 'anthropic').
 * Providers that use the OpenAI-compatible format are created via the
 * `createOpenAICompatibleProvider` factory — they differ only in endpoint
 * and API key location.
 *
 * The cache is intentional: provider instances are stateless value objects,
 * and creating them on every request would be wasteful.
 */
export function createAllProviders(): Map<string, ModelProvider> {
  if (_providerCache) return _providerCache;

  const providers = new Map<string, ModelProvider>();

  // ── Local ──────────────────────────────────────────────────────────────────
  providers.set('ollama', new OllamaProvider());

  // ── Custom API formats ─────────────────────────────────────────────────────
  providers.set('anthropic', new AnthropicProvider());
  providers.set('google', new GoogleProvider());

  // ── OpenAI-compatible providers ────────────────────────────────────────────
  // All of these speak the same /v1/chat/completions protocol; they differ
  // only in base URL, auth header, and model naming conventions.

  providers.set(
    'openai',
    createOpenAICompatibleProvider(
      'openai',
      'OpenAI',
      'https://api.openai.com/v1',
      'OPENAI_API_KEY',
      'gpt-4o',
    ),
  );

  providers.set(
    'mistral',
    createOpenAICompatibleProvider(
      'mistral',
      'Mistral',
      'https://api.mistral.ai/v1',
      'MISTRAL_API_KEY',
      'mistral-large-latest',
    ),
  );

  providers.set(
    'deepseek',
    createOpenAICompatibleProvider(
      'deepseek',
      'DeepSeek',
      'https://api.deepseek.com/v1',
      'DEEPSEEK_API_KEY',
      'deepseek-chat',
    ),
  );

  providers.set(
    'groq',
    createOpenAICompatibleProvider(
      'groq',
      'Groq',
      'https://api.groq.com/openai/v1',
      'GROQ_API_KEY',
      'llama-3.1-70b-versatile',
    ),
  );

  providers.set(
    'together',
    createOpenAICompatibleProvider(
      'together',
      'Together',
      'https://api.together.xyz/v1',
      'TOGETHER_API_KEY',
      'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
    ),
  );

  providers.set(
    'cohere',
    createOpenAICompatibleProvider(
      'cohere',
      'Cohere',
      'https://api.cohere.com/v1',
      'COHERE_API_KEY',
      'command-r-plus',
    ),
  );

  providers.set(
    'perplexity',
    createOpenAICompatibleProvider(
      'perplexity',
      'Perplexity',
      'https://api.perplexity.ai',
      'PERPLEXITY_API_KEY',
      'llama-3.1-sonar-large-128k-online',
    ),
  );

  providers.set(
    'xai',
    createOpenAICompatibleProvider(
      'xai',
      'xAI',
      'https://api.x.ai/v1',
      'XAI_API_KEY',
      'grok-2',
    ),
  );

  _providerCache = providers;
  return providers;
}

/**
 * Look up a single provider by ID.
 * Returns undefined if the provider is not registered.
 */
export function getProvider(id: string): ModelProvider | undefined {
  return createAllProviders().get(id);
}

/** Reset the provider cache (useful for testing). */
export function resetProviderCache(): void {
  _providerCache = null;
}
