/**
 * openaiModelProvider.ts — Phase 2 stub
 *
 * TODO: Wire real OpenAI model provider when Phase 2 is promoted.
 * This stub satisfies imports from openaiRoutingDecision.ts and
 * openaiUniversalAdapterPatch.ts so the groundwork/v4 files compile.
 */

// ─── Message types ───────────────────────────────────────────────────────────

export interface GenerateMessage {
  role: 'system' | 'user' | 'assistant' | 'developer';
  content: string | unknown[];
}

export interface GenerateInput {
  messages: GenerateMessage[];
  modelOverride?: string;
  timeoutMs?: number;
  systemPrompt?: string;
  jsonMode?: boolean;
  temperature?: number;
}

export interface GenerateInputStreaming extends GenerateInput {
  stream?: boolean;
}

export interface GenerateOutput {
  text: string;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  cachedInputTokens?: number;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
  };
}

export interface EmbeddingInput {
  texts: string[];
  model?: string;
  dimensions?: number;
}

// ─── Error classes ───────────────────────────────────────────────────────────

export class OpenAIRateLimitError extends Error {
  retryAfterMs: number;
  constructor(message: string, retryAfterMs = 1000) {
    super(message);
    this.name = 'OpenAIRateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

export class OpenAITimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenAITimeoutError';
  }
}

export class OpenAIServiceOverloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenAIServiceOverloadError';
  }
}

export class OpenAIServerError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = 'OpenAIServerError';
    this.statusCode = statusCode;
  }
}

export class OpenAINetworkError extends Error {
  cause: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'OpenAINetworkError';
    this.cause = cause;
  }
}

// ─── Type guards ─────────────────────────────────────────────────────────────

export function is429OpenAI(err: unknown): err is OpenAIRateLimitError {
  return err instanceof OpenAIRateLimitError;
}

export function isOpenAITransient(err: unknown): err is OpenAIServerError | OpenAINetworkError {
  return err instanceof OpenAIServerError || err instanceof OpenAINetworkError;
}

export function isOpenAIOverload(err: unknown): err is OpenAIServiceOverloadError {
  return err instanceof OpenAIServiceOverloadError;
}
