/**
 * Contract for the local Ollama HTTP client (no cloud SDKs).
 * Implementation: `ollamaClient.ts` + `export const localOllama`.
 */

export type OllamaRole = 'system' | 'user' | 'assistant';

export interface OllamaMessage {
  role: OllamaRole;
  content: string;
}

export interface OllamaChatOptions {
  messages: OllamaMessage[];
  /** Maps to Ollama `format: "json"`. */
  json?: boolean;
  signal?: AbortSignal;
  /** Default true in implementation — set false only for rare diagnostic calls. */
  injectAtlasIdentity?: boolean;
  trace?: { userId: string; channel: string };
}

export interface OllamaStreamChunk {
  contentDelta: string;
  done: boolean;
}

export interface OllamaCompleteOptions {
  system?: string;
  json?: boolean;
  signal?: AbortSignal;
  injectAtlasIdentity?: boolean;
  trace?: { userId: string; channel: string };
}

/** Typed surface area for UI + `localIntelligence` orchestration. */
export interface LocalOllamaClient {
  /** Single-shot chat; waits for full completion. */
  chat(options: OllamaChatOptions): Promise<string>;

  /**
   * Streaming NDJSON chat; invokes `onChunk` for each token delta.
   * Resolves to the full assistant string when the stream ends.
   */
  chatStream(
    options: OllamaChatOptions,
    onChunk?: (chunk: OllamaStreamChunk) => void
  ): Promise<string>;

  /** Convenience: optional system preamble + one user turn. */
  complete(userContent: string, opts?: OllamaCompleteOptions): Promise<string>;

  /** `/api/embed` — used for semantic recall over memories/traces. */
  embed(input: string | string[], opts?: { signal?: AbortSignal }): Promise<number[][]>;

  /** Strip fences and parse JSON from assistant output. */
  parseJsonFromAssistant<T = unknown>(raw: string): T;
}
