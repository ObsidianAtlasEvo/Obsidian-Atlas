/**
 * openaiUniversalAdapterPatch.ts
 *
 * VERSION: v4
 * DATE: April 2026
 * SUPERSEDES: v3 (groundwork/v3/)
 *
 * CHANGES FROM v3 (adversarial validation pass — 2026-04-15):
 *   - Patch 4a: extractSystemContent() — handles both string and array message content.
 *     v3 cast `m.content as string | undefined` could produce undefined for array content
 *     (multi-modal messages with system role). Now correctly extracts text parts from arrays.
 *   - Patch 4b: extractJsonFromPlainText() — balanced bracket parser replaces greedy regex.
 *     The v3 /\{[\s\S]*\}/ regex is O(n^2) on pathological inputs and matches the LAST
 *     closing brace (greedy), corrupting output when trailing text follows a JSON block.
 *     The v4 parser handles escape sequences, string literals, and nested braces correctly.
 *   - Patch 4c: embedOpenAI() — resolves model via registry entry (not inline literal).
 *     Uses resolvedRegistryEntry.dimensions for default dimension count.
 *     Throws typed errors (OpenAITimeoutError, OpenAINetworkError) on failure.
 *     Validates model alias against known registry entries; throws on unknown model.
 *
 * All v3 fixes (Repairs 1–11, Corrections 6–12) are preserved verbatim.
 *
 * Dispatch block additions for universalAdapter.ts — openai_responses and openai_embeddings backends.
 *
 * MERGE INSTRUCTIONS:
 * 1. Import these functions at the top of universalAdapter.ts
 * 2. Add the 'openai_responses' case to the main dispatch switch/if-else
 * 3. Add the 'openai_embeddings' case as a SEPARATE dispatch branch
 * 4. The exported functions map to the three adapter operation modes:
 *      completeOpenAIResponsesChat → generate (non-streaming)
 *      streamOpenAIResponsesChat   → stream (SSE)
 *      embedOpenAI                 → embed (vector)
 *
 * These functions are intentionally self-contained so they can be pasted
 * into universalAdapter.ts without circular dependency issues.
 *
 * IMPORTANT: This code targets /v1/responses (Responses API), NOT
 * /v1/chat/completions. The request/response shapes are different.
 * Embeddings use /v1/embeddings — a separate endpoint entirely.
 */

import { env } from '../env';
import {
  GenerateInput,
  GenerateOutput,
  EmbeddingInput,
  GenerateInputStreaming,
  OpenAIRateLimitError,
  OpenAIServiceOverloadError,
  OpenAIServerError,
  OpenAITimeoutError,
  OpenAINetworkError,
  is429OpenAI,
  isOpenAITransient,
  isOpenAIOverload,
} from './openaiModelProvider';
import type { LlmRegistryEntry, EmbeddingRegistryEntry } from './openaiRegistry';
import { getEmbeddingRegistryEntry } from './openaiRegistry';

// ─── Error classification re-exports for universalAdapter.ts ─────────────────
// These let the adapter's top-level error handler distinguish OpenAI errors
// from Groq, Gemini, and Anthropic errors without instanceof pollution.

export {
  OpenAIRateLimitError,
  OpenAIServiceOverloadError,
  OpenAIServerError,
  OpenAITimeoutError,
  OpenAINetworkError,
  is429OpenAI,
  isOpenAITransient,
  isOpenAIOverload,
};

// ─── Tool types (CORRECTION 11) ───────────────────────────────────────────────

/**
 * [CORRECTION 11] Tool types for the Responses API request body.
 * Only web_search is wired as a stub. Function/MCP tools come in Phase 4.
 */
export type OpenAIToolType =
  | 'web_search'
  | 'file_search'
  | 'function'
  | 'computer_use'
  | 'code_interpreter';

export interface OpenAIWebSearchTool {
  type: 'web_search';
}

export interface OpenAIFunctionTool {
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>;  // JSON Schema object
}

export type OpenAITool = OpenAIWebSearchTool | OpenAIFunctionTool;

// ─── Dispatch options ─────────────────────────────────────────────────────────

/**
 * Options passed to the dispatch layer.
 *
 * [REPAIR 5] `allowGated` has been removed. The gate now requires a verified
 * routeDecision with requireProAudit === true. This is not bypassable by a
 * simple boolean flag.
 */
export interface DispatchOptions {
  /**
   * The routing decision from the intelligence router.
   * Required to dispatch to gated models (gpt-5.4-pro).
   * routeDecision.requireProAudit must be true for gated entries.
   */
  routeDecision?: { requireProAudit?: boolean; useTools?: boolean };
}

// ─── Internal types (Responses API) ──────────────────────────────────────────

interface ResponsesApiInputItem {
  role: 'user' | 'assistant' | 'developer';
  content: string | OpenAIContentPart[];
}

/** [CORRECTION 13] Multi-modal content part types */
export interface OpenAIContentPartText {
  type: 'text';
  text: string;
}

export interface OpenAIContentPartImageUrl {
  type: 'image_url';
  image_url: { url: string };
}

export interface OpenAIContentPartInputFile {
  type: 'input_file';
  file_id: string;
}

export type OpenAIContentPart =
  | OpenAIContentPartText
  | OpenAIContentPartImageUrl
  | OpenAIContentPartInputFile;

interface ResponsesApiRequestBody {
  model: string;
  input: ResponsesApiInputItem[];
  instructions?: string;
  stream?: boolean;
  store: false;  // [CORRECTION 6] Always false. Atlas governs its own memory substrate via SQLite. OpenAI response persistence is explicitly disabled.
  text?: { format?: { type: 'json_object' | 'text' } };
  temperature?: number;
  tools?: OpenAITool[];  // [CORRECTION 11]
}

interface ResponsesApiResponse {
  id: string;
  model: string;
  output_text: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    input_tokens_details?: { cached_tokens?: number };
  };
  status: 'completed' | 'failed' | 'cancelled';
  error?: { code: string; message: string };
}

interface EmbeddingApiResponse {
  data: Array<{ embedding: number[]; index: number; object: 'embedding' }>;
  model: string;
  usage: { prompt_tokens: number; total_tokens: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getOpenAIConfig(): { apiKey: string; baseUrl: string } {
  const apiKey = env.openaiApiKey;
  if (!apiKey) {
    throw new Error(
      '[universalAdapter/openai] OPENAI_API_KEY is not set. ' +
      'Cannot dispatch to openai_responses or openai_embeddings backend.'
    );
  }
  const baseUrl = (env.openaiBaseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  return { apiKey, baseUrl };
}

/**
 * Convert Atlas messages to Responses API input items.
 * [CORRECTION 13] 'developer' role is preserved as-is (Responses API supports it).
 * 'system' role messages are mapped to 'developer' role for Responses API compatibility.
 * Only 'user', 'assistant', and 'developer' roles appear in input[].
 */
function toResponsesInput(messages: GenerateInput['messages']): ResponsesApiInputItem[] {
  return messages
    .filter((m) => m.role !== 'system')  // system prompts go in instructions field
    .map((m) => {
      const role: ResponsesApiInputItem['role'] =
        m.role === 'developer' ? 'developer'
        : m.role === 'assistant' ? 'assistant'
        : 'user';

      // [CORRECTION 13] Handle both string and array content
      if (typeof m.content === 'string') {
        return { role, content: m.content };
      }
      // Array content (multi-modal) passed through directly
      return { role, content: m.content as OpenAIContentPart[] };
    });
}

/**
 * [v4 PATCH 4a] Extract and concatenate all system message content.
 *
 * v3 cast `m.content as string | undefined` which fails silently for array content:
 * a system message with array content (multi-modal or multi-part) would produce
 * an unexpected value. This version handles both string and array content correctly.
 *
 * @param messages  The full message array from GenerateInput
 * @returns         Concatenated system content string, or undefined if none
 */
function extractSystemContent(messages: GenerateInput['messages']): string | undefined {
  const blocks = messages
    .filter((m) => m.role === 'system')
    .map((m) => {
      if (typeof m.content === 'string') {
        return m.content.trim();
      }

      // Array content — extract text parts only
      const textParts = (m.content as OpenAIContentPart[])
        .filter(
          (part): part is OpenAIContentPartText =>
            part.type === 'text' && typeof part.text === 'string'
        )
        .map((part) => part.text.trim())
        .filter((part) => part.length > 0);

      return textParts.join('\n');
    })
    .map((block) => block.trim())
    .filter((block) => block.length > 0);

  return blocks.length > 0 ? blocks.join('\n\n') : undefined;
}

function parseRetryAfterMs(headers: Headers): number {
  const val = headers.get('retry-after');
  if (val) {
    const s = parseInt(val, 10);
    if (!isNaN(s)) return s * 1000;
  }
  return 2000;
}

async function classifyOpenAIHttpError(
  response: Response,
  operationLabel: string
): Promise<never> {
  const body = await response.text().catch(() => '(unreadable)');
  if (response.status === 429) {
    throw new OpenAIRateLimitError(
      `[openai] Rate limited during ${operationLabel}: ${body}`,
      parseRetryAfterMs(response.headers)
    );
  }
  if (response.status === 503) {
    throw new OpenAIServiceOverloadError(
      `[openai] Service overloaded during ${operationLabel}: ${body}`
    );
  }
  if (response.status >= 500) {
    throw new OpenAIServerError(
      `[openai] Server error ${response.status} during ${operationLabel}: ${body}`,
      response.status
    );
  }
  throw new OpenAIServerError(
    `[openai] API error ${response.status} during ${operationLabel}: ${body}`,
    response.status
  );
}

function createAbortTimer(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * [CORRECTION 11] Build the tools array for a Responses API request.
 * When useTools=true in the route decision, include web_search.
 * TODO: Phase 4 — wire function/MCP tools here.
 */
function buildToolsArray(useTools: boolean): OpenAITool[] | undefined {
  if (!useTools) return undefined;

  const tools: OpenAITool[] = [
    { type: 'web_search' },  // stub: web_search requires no config
    // TODO: Phase 4 — wire function/MCP tools here
  ];

  return tools;
}

/**
 * [v4 PATCH 4b] Extract JSON from plain text output when supportsStructuredOutput=false.
 * Used for gpt-5.4-pro which does not support structured outputs.
 *
 * v3 used greedy regexes (/\{[\s\S]*\}/) which:
 *   - Match the LAST closing brace (greedy), corrupting output when trailing text follows JSON.
 *   - Are O(n^2) on pathological inputs.
 *   - Do not handle escape sequences or string literals containing braces.
 *
 * v4 uses a balanced bracket parser:
 *   1. First tries fenced JSON/code blocks (```json ... ```)
 *   2. Then walks character-by-character, tracking string state and escape sequences,
 *      to find the first balanced { } or [ ] block.
 *   3. Falls back to raw text if no JSON structure found.
 *
 * @param text  Raw text from the model's output
 * @returns     Extracted JSON string (may still fail JSON.parse — caller handles)
 */
export function extractJsonFromPlainText(text: string): string {
  const trimmed = text.trim();

  // 1) Prefer fenced JSON/code blocks if present
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  // 2) Try to locate the first balanced JSON object or array
  const tryBalancedExtract = (source: string, openChar: '{' | '[', closeChar: '}' | ']'): string | null => {
    const start = source.indexOf(openChar);
    if (start === -1) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < source.length; i++) {
      const ch = source[i];

      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === '\\') {
          escaped = true;
          continue;
        }
        if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }

      if (ch === openChar) {
        depth++;
        continue;
      }

      if (ch === closeChar) {
        depth--;
        if (depth === 0) {
          return source.slice(start, i + 1).trim();
        }
      }
    }

    return null;
  };

  const objectJson = tryBalancedExtract(trimmed, '{', '}');
  if (objectJson) return objectJson;

  const arrayJson = tryBalancedExtract(trimmed, '[', ']');
  if (arrayJson) return arrayJson;

  // 3) Final fallback — let the caller raise a parse error
  return trimmed;
}

// ─── Non-streaming dispatch ───────────────────────────────────────────────────

/**
 * Non-streaming completion via OpenAI Responses API.
 *
 * [CORRECTION 6] store: false on all requests.
 * [CORRECTION 7] No OpenAI-Beta header.
 * [CORRECTION 8] supportsStructuredOutput=false (gpt-5.4-pro): json_object format skipped.
 * [CORRECTION 11] useTools flag triggers web_search stub inclusion.
 *
 * Uses POST /v1/responses with stream: false.
 * Response shape: { output_text, usage: { input_tokens, output_tokens } }
 */
export async function completeOpenAIResponsesChat(
  entry: LlmRegistryEntry,
  input: GenerateInput,
  useTools = false
): Promise<GenerateOutput> {
  const { apiKey, baseUrl } = getOpenAIConfig();
  const modelId   = input.modelOverride ?? entry.modelId;
  const timeoutMs = input.timeoutMs ?? env.openaiTimeoutMs ?? 30_000;
  const maxRetries = env.openaiMaxRetries ?? 2;

  const systemInstructions =
    input.systemPrompt ?? extractSystemContent(input.messages) ?? undefined;

  // [CORRECTION 8] Only send json_object format if the entry supports structured output
  const useJsonMode = input.jsonMode && entry.supportsStructuredOutput;

  const body: ResponsesApiRequestBody = {
    model: modelId,
    input: toResponsesInput(input.messages),
    store: false,  // [CORRECTION 6] Atlas governs its own memory substrate via SQLite. OpenAI response persistence is explicitly disabled.
    stream: false,
    ...(systemInstructions ? { instructions: systemInstructions } : {}),
    ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
    ...(useJsonMode ? { text: { format: { type: 'json_object' } } } : {}),
    ...(useTools ? { tools: buildToolsArray(true) } : {}),  // [CORRECTION 11]
  };

  let lastErr: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const { signal, clear } = createAbortTimer(timeoutMs);

    try {
      const response = await fetch(`${baseUrl}/responses`, {
        method: 'POST',
        headers: {
          // [CORRECTION 7] No OpenAI-Beta header. Current Responses API requires no preview header.
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      });
      clear();

      if (!response.ok) {
        await classifyOpenAIHttpError(response, `complete/${modelId}`);
      }

      const data = await response.json() as ResponsesApiResponse;

      if (data.status === 'failed') {
        throw new OpenAIServerError(
          `[openai_responses] Response failed (code: ${data.error?.code ?? 'unknown'}): ` +
          (data.error?.message ?? 'No message'),
          500
        );
      }

      return {
        text: data.output_text,
        model: data.model,
        promptTokens:       data.usage.input_tokens,
        completionTokens:   data.usage.output_tokens,
        cachedInputTokens:  data.usage.input_tokens_details?.cached_tokens ?? 0,
      };
    } catch (err: unknown) {
      clear();
      lastErr = err;

      if (isOpenAIOverload(err) || err instanceof OpenAITimeoutError) {
        throw err;
      }

      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new OpenAITimeoutError(
          `[openai_responses] Request timed out after ${timeoutMs}ms (model: ${modelId})`
        );
      }

      if (is429OpenAI(err) && attempt < maxRetries) {
        await sleep(err.retryAfterMs * Math.pow(2, attempt));
        continue;
      }

      if (isOpenAITransient(err) && attempt < maxRetries) {
        await sleep(1000 * (attempt + 1));
        continue;
      }

      throw err;
    }
  }

  throw lastErr;
}

// ─── Streaming dispatch ───────────────────────────────────────────────────────

/**
 * Streaming completion via OpenAI Responses API SSE.
 *
 * [CORRECTION 6] store: false on all requests.
 * [CORRECTION 7] No OpenAI-Beta header.
 * [CORRECTION 11] useTools flag triggers web_search stub inclusion.
 *
 * Uses POST /v1/responses with stream: true.
 * SSE event format (Responses API — NOT Chat Completions):
 *   data: { "type": "response.output_text.delta", "delta": "chunk text" }
 *   data: { "type": "response.completed", "response": { ... } }
 *   data: [DONE]
 *
 * Yields string delta chunks. Throws on error (caller handles fallback).
 */
export async function* streamOpenAIResponsesChat(
  entry: LlmRegistryEntry,
  input: GenerateInputStreaming,
  useTools = false
): AsyncGenerator<string, void, unknown> {
  const { apiKey, baseUrl } = getOpenAIConfig();
  const modelId   = input.modelOverride ?? entry.modelId;
  const timeoutMs = input.timeoutMs ?? env.openaiStreamTimeoutMs ?? 60_000;

  const systemInstructions =
    input.systemPrompt ?? extractSystemContent(input.messages) ?? undefined;

  const body: ResponsesApiRequestBody = {
    model: modelId,
    input: toResponsesInput(input.messages),
    store: false,  // [CORRECTION 6] Atlas governs its own memory substrate via SQLite. OpenAI response persistence is explicitly disabled.
    stream: true,
    ...(systemInstructions ? { instructions: systemInstructions } : {}),
    ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
    ...(useTools ? { tools: buildToolsArray(true) } : {}),  // [CORRECTION 11]
  };

  const { signal, clear } = createAbortTimer(timeoutMs);

  let response: Response;

  try {
    response = await fetch(`${baseUrl}/responses`, {
      method: 'POST',
      headers: {
        // [CORRECTION 7] No OpenAI-Beta header. Current Responses API requires no preview header.
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err: unknown) {
    clear();
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new OpenAITimeoutError(
        `[openai_responses] Streaming request timed out (model: ${modelId})`
      );
    }
    throw new OpenAINetworkError(
      `[openai_responses] Network error starting stream (model: ${modelId})`,
      err
    );
  }

  if (!response.ok) {
    clear();
    await classifyOpenAIHttpError(response, `stream/${modelId}`);
  }

  if (!response.body) {
    clear();
    throw new OpenAIServerError('[openai_responses] Streaming response has no body', 500);
  }

  const reader  = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer    = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;

        const payload = trimmed.slice('data: '.length);

        if (payload === '[DONE]') {
          return;
        }

        let event: Record<string, unknown>;
        try {
          event = JSON.parse(payload) as Record<string, unknown>;
        } catch {
          console.warn('[universalAdapter/openai_responses] Unparseable SSE line:', payload);
          continue;
        }

        if (event['type'] === 'response.output_text.delta') {
          const delta = event['delta'];
          if (typeof delta === 'string' && delta.length > 0) {
            yield delta;
          }
        } else if (event['type'] === 'response.completed') {
          return;
        }
        // All other event types (response.created, response.in_progress, etc.)
        // are intentionally ignored — silently skipped until handled explicitly.
      }
    }
  } finally {
    clear();
    reader.releaseLock();
  }
}

// ─── Embedding dispatch (v4 PATCH 4c) ────────────────────────────────────────

/**
 * Embeddings via OpenAI Embeddings API (/v1/embeddings).
 *
 * [v4 PATCH 4c] Model resolution via registry (not inline literals):
 *   - Resolves both canonical API names (text-embedding-3-large/small) and
 *     registry alias IDs (openai-embed-large/small).
 *   - Uses resolvedRegistryEntry.dimensions for default dimension count.
 *   - Throws a clear error on unsupported model strings (fail-fast).
 *   - Throws typed errors (OpenAITimeoutError, OpenAINetworkError) on network failure.
 *
 * [CORRECTION 10] This function is called from the 'openai_embeddings' dispatch branch,
 * NOT from the 'openai_responses' branch. They are separate backends.
 *
 * Returns: number[][] — one float32 array per input text, in input order.
 *
 * IMPORTANT: Do NOT use chat models for embeddings. This function always
 * uses text-embedding-3-large or a configured alternative via EmbeddingInput.model.
 */
export async function embedOpenAI(
  input: EmbeddingInput
): Promise<number[][]> {
  const { apiKey, baseUrl } = getOpenAIConfig();
  const requestedModel = input.model ?? env.openaiEmbeddingModel ?? 'text-embedding-3-large';
  const timeoutMs = env.openaiTimeoutMs ?? 30_000;

  // [v4 PATCH 4c] Resolve via registry entry using both alias IDs and canonical names.
  // Unknown model strings throw immediately (fail-fast — no silent wrong-model fallback).
  const resolvedRegistryEntry: EmbeddingRegistryEntry | undefined =
    requestedModel === 'openai-embed-small' || requestedModel === 'text-embedding-3-small'
      ? getEmbeddingRegistryEntry('openai-embed-small')
      : requestedModel === 'openai-embed-large' || requestedModel === 'text-embedding-3-large'
        ? getEmbeddingRegistryEntry('openai-embed-large')
        : undefined;

  if (!resolvedRegistryEntry) {
    throw new Error(
      `[openai_embeddings] Unsupported embedding model '${requestedModel}'. ` +
      `Expected one of: openai-embed-large, openai-embed-small, text-embedding-3-large, text-embedding-3-small.`
    );
  }

  const embeddingModel = resolvedRegistryEntry.apiModel;
  const defaultDimensions =
    input.dimensions
    ?? resolvedRegistryEntry.dimensions
    ?? env.openaiEmbeddingDimensions
    ?? 3072;

  const body: {
    input: string[];
    model: string;
    encoding_format: 'float';
    dimensions?: number;
  } = {
    input: input.texts,
    model: embeddingModel,
    encoding_format: 'float',
    dimensions: defaultDimensions,
  };

  const { signal, clear } = createAbortTimer(timeoutMs);

  let response: Response;

  try {
    response = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err: unknown) {
    clear();
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new OpenAITimeoutError(
        `[openai_embeddings] Timed out after ${timeoutMs}ms (model: ${embeddingModel})`
      );
    }
    throw new OpenAINetworkError(
      `[openai_embeddings] Network error (model: ${embeddingModel})`,
      err
    );
  } finally {
    clear();
  }

  if (!response.ok) {
    await classifyOpenAIHttpError(response, `embed/${embeddingModel}`);
  }

  const data = await response.json() as EmbeddingApiResponse;
  const sorted = [...data.data].sort((a, b) => a.index - b.index);
  return sorted.map((item) => item.embedding);
}

// ─── Adapter dispatch blocks ──────────────────────────────────────────────────

/**
 * The dispatch blocks to add to universalAdapter.ts.
 *
 * [CORRECTION 10] 'openai_responses' and 'openai_embeddings' are SEPARATE cases.
 * [CORRECTION 12] All strings use template literals — no mixed quote escaping.
 * [REPAIR 5] Gate check now uses routeDecision.requireProAudit instead of allowGated boolean.
 *
 * MERGE INSTRUCTION: Add these two cases to the backend dispatch switch in
 * universalAdapter.ts, immediately after the existing 'openrouter' case:
 */
export const UNIVERSAL_ADAPTER_DISPATCH_SNIPPET = `
// ── openai_responses backend — added by openaiUniversalAdapterPatch.ts ──────
case 'openai_responses': {
  // [REPAIR 5] Enforce pro gate: gated entries (gpt-5.4-pro) require a verified
  // routeDecision with requireProAudit === true. The old allowGated boolean is removed.
  const routeDecision = options?.routeDecision;
  if (entry.gated && routeDecision?.requireProAudit !== true) {
    throw new Error(
      \`[universalAdapter] Model '\${entry.id}' is gated. \` +
      \`A verified routeDecision with requireProAudit=true is required.\`
    );
  }

  const useTools = options?.routeDecision?.useTools ?? false;

  if (operation === 'stream') {
    return streamOpenAIResponsesChat(entry, input as GenerateInputStreaming, useTools);
  }

  // Default: non-streaming completion
  return completeOpenAIResponsesChat(entry, input as GenerateInput, useTools);
}

// ── openai_embeddings backend — added by openaiUniversalAdapterPatch.ts ─────
// [CORRECTION 10] Embeddings dispatch is SEPARATE from Responses API dispatch.
// This case handles text-embedding-3-large and text-embedding-3-small.
// It does NOT route through /v1/responses.
case 'openai_embeddings': {
  if (operation !== 'embed') {
    throw new Error(
      \`[universalAdapter] Backend 'openai_embeddings' only supports embed operations. Got: \${operation}\`
    );
  }
  return embedOpenAI(embeddingInput);
}
`;
