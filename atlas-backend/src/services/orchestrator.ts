// ── Multi-Model Orchestrator ──────────────────────────────────────────────────
// The engine that fans out a single query to multiple AI models in parallel,
// collects their responses with per-model error isolation, and returns a
// unified result with full timing metadata.
//
// Design principles:
//  • One model failing MUST NOT block or affect others
//  • Each model call has its own timeout
//  • All results (success + failure) are returned for transparency
//  • The orchestrator is stateless — all state is in the request

import { createAllProviders } from './providers/index.js';
import { getModelById, getProviderById } from './modelRegistry.js';
import type { ProviderMessage } from './providers/base.js';

export type { ProviderMessage };

export interface OrchestrationRequest {
  messages: ProviderMessage[];
  /** Model IDs from the registry, e.g. ['openai/gpt-4o', 'ollama/llama3.1:70b'] */
  selectedModels: string[];
  /** Per-model timeout in milliseconds. Default: 30,000 */
  timeoutMs?: number;
  /** Hard cap on concurrent model calls. Default: 5 */
  maxModels?: number;
}

export interface ModelResponse {
  modelId: string;
  /** Provider ID string, e.g. 'openai' */
  provider: string;
  content: string;
  tokensUsed?: number;
  durationMs: number;
  error?: string;
  status: 'success' | 'error' | 'timeout';
}

export interface OrchestrationResult {
  responses: ModelResponse[];
  totalDurationMs: number;
  modelsQueried: number;
  modelsSucceeded: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_MODELS = 5;

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Derive the provider ID from a model ID by looking it up in the registry.
 * Falls back to parsing the prefix before the first slash.
 */
function resolveProviderId(modelId: string): string {
  const def = getModelById(modelId);
  if (def) return def.provider;
  const slashIdx = modelId.indexOf('/');
  return slashIdx >= 0 ? modelId.slice(0, slashIdx) : modelId;
}

/**
 * Determine whether a provider is usable (has API key or is local).
 * For Ollama we rely on the `ping` check embedded in `isAvailable()`;
 * for others we just check env var presence.
 */
async function isProviderUsable(providerId: string): Promise<boolean> {
  const providers = createAllProviders();
  const provider = providers.get(providerId);
  if (!provider) return false;
  try {
    return await provider.isAvailable();
  } catch {
    return false;
  }
}

/** Classify an error as a timeout vs generic error. */
function classifyError(err: unknown): 'timeout' | 'error' {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (
      msg.includes('abort') ||
      msg.includes('timeout') ||
      msg.includes('timed out') ||
      msg.includes('the user aborted')
    ) {
      return 'timeout';
    }
  }
  return 'error';
}

// ── Main export ───────────────────────────────────────────────────────────────

export class Orchestrator {
  /**
   * Fan out the request to all selected models in parallel.
   *
   * Flow:
   *  1. Resolve each model ID to its provider
   *  2. Filter to providers that are currently available
   *  3. Cap at maxModels
   *  4. Fire all requests concurrently with Promise.allSettled
   *  5. Collect results, including partial failures
   */
  async orchestrate(request: OrchestrationRequest): Promise<OrchestrationResult> {
    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxModels = request.maxModels ?? DEFAULT_MAX_MODELS;
    const overallStart = Date.now();

    const providers = createAllProviders();

    // ── 1. Resolve and filter models ────────────────────────────────────────
    // Check provider availability concurrently
    const availabilityChecks = await Promise.all(
      request.selectedModels.map(async (modelId) => {
        const providerId = resolveProviderId(modelId);
        const available = await isProviderUsable(providerId);
        return { modelId, providerId, available };
      }),
    );

    const filteredModels = availabilityChecks
      .filter((m) => m.available)
      .slice(0, maxModels);

    if (filteredModels.length === 0) {
      return {
        responses: [],
        totalDurationMs: Date.now() - overallStart,
        modelsQueried: 0,
        modelsSucceeded: 0,
      };
    }

    // ── 2. Fan out parallel calls ────────────────────────────────────────────
    const callPromises = filteredModels.map(({ modelId, providerId }) => {
      const provider = providers.get(providerId);

      if (!provider) {
        const errorResponse: ModelResponse = {
          modelId,
          provider: providerId,
          content: '',
          durationMs: 0,
          error: `Provider '${providerId}' not registered`,
          status: 'error',
        };
        return Promise.resolve(errorResponse);
      }

      const callStart = Date.now();

      const completionPromise = provider.complete(request.messages, {
        model: modelId,
        timeoutMs,
      });

      // Wrap in a race with a hard timeout to guarantee we never wait forever
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Model ${modelId} timed out after ${timeoutMs}ms`)), timeoutMs),
      );

      return Promise.race([completionPromise, timeoutPromise])
        .then((result): ModelResponse => ({
          modelId,
          provider: providerId,
          content: result.content,
          tokensUsed: result.tokensUsed,
          durationMs: Date.now() - callStart,
          status: 'success',
        }))
        .catch((err: unknown): ModelResponse => {
          const status = classifyError(err);
          const error = err instanceof Error ? err.message : String(err);
          return {
            modelId,
            provider: providerId,
            content: '',
            durationMs: Date.now() - callStart,
            error,
            status,
          };
        });
    });

    // ── 3. Collect all results (settled = no unhandled rejections) ───────────
    const settled = await Promise.allSettled(callPromises);

    const responses: ModelResponse[] = settled.map((result) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }
      // Promise.allSettled should never produce 'rejected' here because we
      // catch errors inside each promise, but handle it defensively.
      return {
        modelId: 'unknown',
        provider: 'unknown',
        content: '',
        durationMs: 0,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        status: 'error' as const,
      };
    });

    const modelsSucceeded = responses.filter((r) => r.status === 'success').length;

    return {
      responses,
      totalDurationMs: Date.now() - overallStart,
      modelsQueried: filteredModels.length,
      modelsSucceeded,
    };
  }
}

// Singleton for use across routes
export const orchestrator = new Orchestrator();
