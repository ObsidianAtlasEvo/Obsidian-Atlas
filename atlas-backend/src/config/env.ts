import path from 'node:path';
import { z } from 'zod';

const envSchema = z.object({
  /** Bind address (production: 0.0.0.0 behind reverse proxy). */
  HOST: z.string().min(1).optional(),
  PORT: z.coerce.number().int().positive(),
  OLLAMA_BASE_URL: z.string().min(1),
  OLLAMA_CHAT_MODEL: z.string().min(1),
  OLLAMA_EMBED_MODEL: z.string().min(1),
  /** Smaller / faster model for background evolution (defaults to chat model). */
  OLLAMA_EVOLUTION_MODEL: z.string().min(1).optional(),
  /** Optional comma-separated local model pool (fallback chain). Example: "llama3.1:8b,qwen2.5:7b,mistral:7b". */
  OLLAMA_MODEL_POOL: z.string().optional(),
  /** Force cloud/public routing even for sovereign users (useful when local Ollama is unstable). */
  DISABLE_LOCAL_OLLAMA: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
  MEMORY_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1),
  DATASET_SCORE_THRESHOLD: z.coerce.number().min(0).max(1),
  /** Normalized combined eval below this flags an evolution gap (0–1). */
  EVAL_GAP_THRESHOLD: z.coerce.number().min(0).max(1),
  /** Each epistemic axis (0–10) must be ≥ this for dataset “perfect” tier. */
  DATASET_MIN_AXIS_SCORE: z.coerce.number().min(0).max(10),
  EVOLUTION_LLM_TIMEOUT_MS: z.coerce.number().int().positive(),
  SQLITE_PATH: z.string().min(1),
  /** Enable background Chronos heartbeat (defaults to true; set `false` / `0` to disable). */
  CHRONOS_ENABLED: z
    .string()
    .optional()
    .transform((v) => v !== 'false' && v !== '0'),
  CHRONOS_TICK_MS: z.coerce.number().int().positive().optional(),
  /** Skip heartbeat if user interacted within this window (ms). */
  CHRONOS_IDLE_MS: z.coerce.number().int().positive().optional(),
  /** If set, only this user_id receives Chronos heartbeats when idle (must match /v1/chat body). */
  CHRONOS_USER_ID: z.string().min(1).optional(),
  /** Per-tenant daily ceiling (prompt + completion estimate from Ollama). */
  QUOTA_DAILY_TOKEN_LIMIT: z.coerce.number().int().positive().optional(),
  QUOTA_DAILY_CHAT_LIMIT: z.coerce.number().int().positive().optional(),
  /** OpenAI-compatible base URL (e.g. `https://api.groq.com/openai/v1`). Required for public-tier chat and owner fail-safe. */
  ATLAS_CLOUD_OPENAI_BASE_URL: z.string().optional(),
  ATLAS_CLOUD_OPENAI_API_KEY: z.string().optional(),
  ATLAS_CLOUD_CHAT_MODEL: z.string().optional(),
  /**
   * When true, trust `X-Atlas-Verified-Email` from the reverse proxy / edge auth layer.
   * Never enable without a gateway that strips/forges this header from clients.
   */
  ATLAS_TRUST_ROUTING_EMAIL_HEADER: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
  /** Groq OpenAI-compatible API (omni-router + fast delegate path). */
  GROQ_API_KEY: z.string().optional(),
  GROQ_BASE_URL: z.string().optional(),
  GROQ_ROUTER_MODEL: z.string().optional(),
  GROQ_DELEGATE_MODEL: z.string().optional(),
  /** Google GenAI (Gemini) for `gemini_pro` / `multi_agent` expansion. */
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().optional(),
  /** Max time (ms) for the Groq routing JSON call. */
  OMNI_ROUTER_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  /** Max time (ms) for sovereign local Ollama streaming in `/v1/chat/omni-stream` (default 10 min; slow models need more). */
  OMNI_LOCAL_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  /** OpenRouter: unified OpenAI-compatible API for Claude / GPT / etc. */
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_BASE_URL: z.string().optional(),
  OPENROUTER_HTTP_REFERER: z.string().optional(),
  /** Direct OpenAI API (optional fallback when OpenRouter unset). */
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().optional(),
  // ── OpenAI groundwork (Phase 2) ──────────────────────────────────────────
  OPENAI_TIMEOUT_MS:                    z.coerce.number().optional(),
  OPENAI_STREAM_TIMEOUT_MS:             z.coerce.number().optional(),
  OPENAI_MAX_RETRIES:                   z.coerce.number().optional(),
  OPENAI_EMBEDDING_MODEL:               z.string().optional(),
  OPENAI_EMBEDDING_DIMENSIONS:          z.coerce.number().optional(),
  OPENAI_SYNTHESIS_MODEL:               z.string().optional(),
  OPENAI_WORKER_MODEL:                  z.string().optional(),
  OPENAI_ROUTER_MODEL:                  z.string().optional(),
  OPENAI_AUDIT_MODEL:                   z.string().optional(),
  OPENAI_DEFAULT_BUDGET_MODE:           z.enum(['fast', 'balanced', 'max-depth']).optional(),
  OPENAI_NANO_ROUTING_ENABLED:          z.coerce.boolean().optional(),
  OPENAI_PRO_AUDIT_STAKE_THRESHOLD:     z.coerce.number().optional(),
  OPENAI_PRO_AUDIT_CONFLICT_THRESHOLD:  z.coerce.number().optional(),
  // ── Stripe billing (Phase 3) ──────────────────────────────────────────────
  STRIPE_SECRET_KEY:       z.string().optional(),
  STRIPE_WEBHOOK_SECRET:   z.string().optional(),
  STRIPE_PRICE_CORE:       z.string().optional(),
  STRIPE_PRICE_SOVEREIGN:  z.string().optional(),
  STRIPE_SUCCESS_URL:      z.string().optional(),
  STRIPE_CANCEL_URL:       z.string().optional(),
  // ── Sovereign identity (Phase 1) ─────────────────────────────────────────
  SOVEREIGN_CREATOR_USER_ID: z.string().optional(),
  SOVEREIGN_CREATOR_EMAIL:   z.string().optional(),
  /** Google Programmable Search (Custom Search JSON API). */
  GOOGLE_CSE_API_KEY: z.string().optional(),
  GOOGLE_CSE_ENGINE_ID: z.string().optional(),
  /** @deprecated Prefer SYSTEM_TAVILY_API_KEY for quota-bound system research; kept as alias. */
  TAVILY_API_KEY: z.string().optional(),
  /** System Tavily key for free-tier Maximum Clarity (5 runs/user/day). Falls back to TAVILY_API_KEY if unset. */
  SYSTEM_TAVILY_API_KEY: z.string().optional(),
  /** Maximum Clarity consensus models (free-tier defaults). */
  CONSENSUS_GEMINI_MODEL: z.string().optional(),
  /** Primary Groq model for dual-lane / analyst (alias: {@link CONSENSUS_GROQ_MODEL}). */
  CONSENSUS_GROQ_ANALYST_MODEL: z.string().optional(),
  /** @deprecated Use CONSENSUS_GROQ_ANALYST_MODEL — kept for older .env files. */
  CONSENSUS_GROQ_MODEL: z.string().optional(),
  CONSENSUS_GROQ_ALT_MODEL: z.string().optional(),
  CONSENSUS_GROQ_JUDGE_MODEL: z.string().optional(),
  /** Google OAuth (Auth.js / NextAuth-compatible env names). */
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  NEXTAUTH_SECRET: z.string().optional(),
  /** Alias for NEXTAUTH_SECRET when rotating credentials. */
  AUTH_SECRET: z.string().optional(),
  /** Public origin of this API for OAuth callback, e.g. https://obsidianatlastech.com */
  NEXTAUTH_URL: z.string().optional(),
  /** Alias for NEXTAUTH_URL (Auth.js v5 style). */
  AUTH_URL: z.string().optional(),
  /** Optional post-login redirect (defaults to NEXTAUTH_URL). */
  AUTH_SUCCESS_REDIRECT: z.string().optional(),
  /** Comma-separated browser origins allowed for CORS with credentials (overrides defaults). */
  CORS_ORIGINS: z.string().optional(),
});

const raw = envSchema.parse({
  HOST: process.env.HOST,
  PORT: process.env.PORT ?? '3001',
  // Ollama is optional in cloud/production — default to localhost so schema passes
  // even when Ollama is not installed. DISABLE_LOCAL_OLLAMA=true routes away from it.
  OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434',
  OLLAMA_CHAT_MODEL: process.env.OLLAMA_CHAT_MODEL ?? 'llama3.1:8b',
  OLLAMA_EMBED_MODEL: process.env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text',
  OLLAMA_EVOLUTION_MODEL: process.env.OLLAMA_EVOLUTION_MODEL,
  OLLAMA_MODEL_POOL: process.env.OLLAMA_MODEL_POOL,
  DISABLE_LOCAL_OLLAMA: process.env.DISABLE_LOCAL_OLLAMA ?? 'true',
  MEMORY_CONFIDENCE_THRESHOLD: process.env.MEMORY_CONFIDENCE_THRESHOLD ?? '0.65',
  DATASET_SCORE_THRESHOLD: process.env.DATASET_SCORE_THRESHOLD ?? '0.72',
  EVAL_GAP_THRESHOLD: process.env.EVAL_GAP_THRESHOLD ?? '0.42',
  DATASET_MIN_AXIS_SCORE: process.env.DATASET_MIN_AXIS_SCORE ?? '9',
  EVOLUTION_LLM_TIMEOUT_MS: process.env.EVOLUTION_LLM_TIMEOUT_MS ?? '120000',
  SQLITE_PATH: process.env.SQLITE_PATH ?? '/var/www/obsidian-atlas-src/atlas-backend/data/atlas.db',
  CHRONOS_ENABLED: process.env.CHRONOS_ENABLED,
  CHRONOS_TICK_MS: process.env.CHRONOS_TICK_MS,
  CHRONOS_IDLE_MS: process.env.CHRONOS_IDLE_MS,
  CHRONOS_USER_ID: process.env.CHRONOS_USER_ID,
  QUOTA_DAILY_TOKEN_LIMIT: process.env.QUOTA_DAILY_TOKEN_LIMIT,
  QUOTA_DAILY_CHAT_LIMIT: process.env.QUOTA_DAILY_CHAT_LIMIT,
  ATLAS_CLOUD_OPENAI_BASE_URL: process.env.ATLAS_CLOUD_OPENAI_BASE_URL,
  ATLAS_CLOUD_OPENAI_API_KEY: process.env.ATLAS_CLOUD_OPENAI_API_KEY,
  ATLAS_CLOUD_CHAT_MODEL: process.env.ATLAS_CLOUD_CHAT_MODEL,
  ATLAS_TRUST_ROUTING_EMAIL_HEADER: process.env.ATLAS_TRUST_ROUTING_EMAIL_HEADER,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  GROQ_BASE_URL: process.env.GROQ_BASE_URL,
  GROQ_ROUTER_MODEL: process.env.GROQ_ROUTER_MODEL,
  GROQ_DELEGATE_MODEL: process.env.GROQ_DELEGATE_MODEL,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GEMINI_MODEL: process.env.GEMINI_MODEL,
  OMNI_ROUTER_TIMEOUT_MS: process.env.OMNI_ROUTER_TIMEOUT_MS,
  OMNI_LOCAL_TIMEOUT_MS: process.env.OMNI_LOCAL_TIMEOUT_MS,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  OPENROUTER_BASE_URL: process.env.OPENROUTER_BASE_URL,
  OPENROUTER_HTTP_REFERER: process.env.OPENROUTER_HTTP_REFERER,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
  OPENAI_TIMEOUT_MS:                    process.env.OPENAI_TIMEOUT_MS,
  OPENAI_STREAM_TIMEOUT_MS:             process.env.OPENAI_STREAM_TIMEOUT_MS,
  OPENAI_MAX_RETRIES:                   process.env.OPENAI_MAX_RETRIES,
  OPENAI_EMBEDDING_MODEL:               process.env.OPENAI_EMBEDDING_MODEL,
  OPENAI_EMBEDDING_DIMENSIONS:          process.env.OPENAI_EMBEDDING_DIMENSIONS,
  OPENAI_SYNTHESIS_MODEL:               process.env.OPENAI_SYNTHESIS_MODEL,
  OPENAI_WORKER_MODEL:                  process.env.OPENAI_WORKER_MODEL,
  OPENAI_ROUTER_MODEL:                  process.env.OPENAI_ROUTER_MODEL,
  OPENAI_AUDIT_MODEL:                   process.env.OPENAI_AUDIT_MODEL,
  OPENAI_DEFAULT_BUDGET_MODE:           process.env.OPENAI_DEFAULT_BUDGET_MODE,
  OPENAI_NANO_ROUTING_ENABLED:          process.env.OPENAI_NANO_ROUTING_ENABLED,
  OPENAI_PRO_AUDIT_STAKE_THRESHOLD:     process.env.OPENAI_PRO_AUDIT_STAKE_THRESHOLD,
  OPENAI_PRO_AUDIT_CONFLICT_THRESHOLD:  process.env.OPENAI_PRO_AUDIT_CONFLICT_THRESHOLD,
  STRIPE_SECRET_KEY:                    process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET:                process.env.STRIPE_WEBHOOK_SECRET,
  STRIPE_PRICE_CORE:                    process.env.STRIPE_PRICE_CORE,
  STRIPE_PRICE_SOVEREIGN:               process.env.STRIPE_PRICE_SOVEREIGN,
  STRIPE_SUCCESS_URL:                   process.env.STRIPE_SUCCESS_URL,
  STRIPE_CANCEL_URL:                    process.env.STRIPE_CANCEL_URL,
  SOVEREIGN_CREATOR_USER_ID:            process.env.SOVEREIGN_CREATOR_USER_ID,
  SOVEREIGN_CREATOR_EMAIL:              process.env.SOVEREIGN_CREATOR_EMAIL,
  GOOGLE_CSE_API_KEY: process.env.GOOGLE_CSE_API_KEY,
  GOOGLE_CSE_ENGINE_ID: process.env.GOOGLE_CSE_ENGINE_ID,
  TAVILY_API_KEY: process.env.TAVILY_API_KEY,
  SYSTEM_TAVILY_API_KEY: process.env.SYSTEM_TAVILY_API_KEY,
  CONSENSUS_GEMINI_MODEL: process.env.CONSENSUS_GEMINI_MODEL || process.env.GEMINI_MODEL,
  CONSENSUS_GROQ_ANALYST_MODEL:
    process.env.CONSENSUS_GROQ_ANALYST_MODEL || process.env.CONSENSUS_GROQ_MODEL,
  CONSENSUS_GROQ_MODEL: process.env.CONSENSUS_GROQ_MODEL,
  CONSENSUS_GROQ_ALT_MODEL: process.env.CONSENSUS_GROQ_ALT_MODEL,
  CONSENSUS_GROQ_JUDGE_MODEL: process.env.CONSENSUS_GROQ_JUDGE_MODEL,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
  AUTH_SECRET: process.env.AUTH_SECRET,
  NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  AUTH_URL: process.env.AUTH_URL,
  AUTH_SUCCESS_REDIRECT: process.env.AUTH_SUCCESS_REDIRECT,
  CORS_ORIGINS: process.env.CORS_ORIGINS,
});

const sqlitePath = path.resolve(process.cwd(), raw.SQLITE_PATH);
const dataDir = path.dirname(sqlitePath);

const DEFAULT_CORS_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://obsidianatlastech.com',
  'https://www.obsidianatlastech.com',
] as const;

function parseCorsOrigins(raw: string | undefined): string[] {
  if (!raw?.trim()) return [...DEFAULT_CORS_ORIGINS];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseModelPool(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const env = {
  host: raw.HOST?.trim() || '0.0.0.0',
  port: raw.PORT,
  ollamaBaseUrl: raw.OLLAMA_BASE_URL.replace(/\/$/, ''),
  ollamaChatModel: raw.OLLAMA_CHAT_MODEL,
  ollamaEmbedModel: raw.OLLAMA_EMBED_MODEL,
  ollamaEvolutionModel: raw.OLLAMA_EVOLUTION_MODEL ?? raw.OLLAMA_CHAT_MODEL,
  ollamaModelPool: parseModelPool(raw.OLLAMA_MODEL_POOL),
  disableLocalOllama: raw.DISABLE_LOCAL_OLLAMA === true,
  memoryConfidenceThreshold: raw.MEMORY_CONFIDENCE_THRESHOLD,
  datasetScoreThreshold: raw.DATASET_SCORE_THRESHOLD,
  evalGapThreshold: raw.EVAL_GAP_THRESHOLD,
  datasetMinAxisScore: raw.DATASET_MIN_AXIS_SCORE,
  evolutionLlmTimeoutMs: raw.EVOLUTION_LLM_TIMEOUT_MS,
  sqlitePath,
  /** Parent directory of the SQLite file (for traces, datasets under `data/`). */
  dataDir,
  /** Local Vectra index folder (semantic memory); under `dataDir`. */
  semanticVectorIndexPath: path.join(dataDir, 'vectra', 'semantic'),
  chronosEnabled: raw.CHRONOS_ENABLED === true,
  chronosTickMs: raw.CHRONOS_TICK_MS ?? 120_000,
  chronosIdleMs: raw.CHRONOS_IDLE_MS ?? 30 * 60 * 1000,
  chronosUserId: raw.CHRONOS_USER_ID?.trim() || null,
  quotaDailyTokenLimit: raw.QUOTA_DAILY_TOKEN_LIMIT ?? 500_000,
  quotaDailyChatLimit: raw.QUOTA_DAILY_CHAT_LIMIT ?? 120,
  /**
   * OpenAI-compatible cloud fail-safe for the hybrid router. If unset, mirrors Groq when `GROQ_API_KEY` is set
   * so local dev works with a single key.
   */
  cloudOpenAiBaseUrl:
    raw.ATLAS_CLOUD_OPENAI_BASE_URL?.trim() ||
    (raw.GROQ_API_KEY?.trim() ? 'https://api.groq.com/openai/v1' : undefined),
  cloudOpenAiApiKey: raw.ATLAS_CLOUD_OPENAI_API_KEY?.trim() || raw.GROQ_API_KEY?.trim() || undefined,
  cloudChatModel:
    raw.ATLAS_CLOUD_CHAT_MODEL?.trim() ||
    raw.GROQ_DELEGATE_MODEL?.trim() ||
    raw.CONSENSUS_GROQ_ANALYST_MODEL?.trim() ||
    raw.CONSENSUS_GROQ_MODEL?.trim() ||
    'llama-3.3-70b-versatile',
  trustAtlasRoutingEmailHeader: raw.ATLAS_TRUST_ROUTING_EMAIL_HEADER === true,
  groqApiKey: raw.GROQ_API_KEY?.trim() || undefined,
  groqBaseUrl: raw.GROQ_BASE_URL?.trim() || undefined,
  groqRouterModel: raw.GROQ_ROUTER_MODEL?.trim() || undefined,
  groqDelegateModel: raw.GROQ_DELEGATE_MODEL?.trim() || undefined,
  geminiApiKey: raw.GEMINI_API_KEY?.trim() || undefined,
  geminiModel: raw.GEMINI_MODEL?.trim() || 'gemini-2.5-flash',
  omniRouterTimeoutMs: raw.OMNI_ROUTER_TIMEOUT_MS ?? 12_000,
  /** Local Ollama stream budget for sovereign lane (was 180s; large prompts + slow GPUs need more). */
  omniLocalTimeoutMs: raw.OMNI_LOCAL_TIMEOUT_MS ?? 600_000,
  openrouterApiKey: raw.OPENROUTER_API_KEY?.trim() || undefined,
  openrouterBaseUrl: raw.OPENROUTER_BASE_URL?.trim() || undefined,
  openrouterReferer: raw.OPENROUTER_HTTP_REFERER?.trim() || undefined,
  openaiApiKey: raw.OPENAI_API_KEY?.trim() || undefined,
  openaiBaseUrl: raw.OPENAI_BASE_URL?.trim() || undefined,
  // ── OpenAI groundwork (Phase 2) ──────────────────────────────────────────
  openaiTimeoutMs:               raw.OPENAI_TIMEOUT_MS ?? 30_000,
  openaiStreamTimeoutMs:         raw.OPENAI_STREAM_TIMEOUT_MS ?? 60_000,
  openaiMaxRetries:              raw.OPENAI_MAX_RETRIES ?? 2,
  openaiEmbeddingModel:          raw.OPENAI_EMBEDDING_MODEL?.trim() || undefined,
  openaiEmbeddingDimensions:     raw.OPENAI_EMBEDDING_DIMENSIONS ?? undefined,
  openaiSynthesisModel:          raw.OPENAI_SYNTHESIS_MODEL?.trim() || undefined,
  openaiWorkerModel:             raw.OPENAI_WORKER_MODEL?.trim() || undefined,
  openaiRouterModel:             raw.OPENAI_ROUTER_MODEL?.trim() || undefined,
  openaiAuditModel:              raw.OPENAI_AUDIT_MODEL?.trim() || undefined,
  openaiDefaultBudgetMode:       (raw.OPENAI_DEFAULT_BUDGET_MODE as 'fast' | 'balanced' | 'max-depth') ?? 'fast',
  openaiNanoRoutingEnabled:      raw.OPENAI_NANO_ROUTING_ENABLED ?? false,
  openaiProAuditStakeThreshold:  raw.OPENAI_PRO_AUDIT_STAKE_THRESHOLD ?? 70,
  openaiProAuditConflictThreshold: raw.OPENAI_PRO_AUDIT_CONFLICT_THRESHOLD ?? 60,
  // ── Stripe billing (Phase 3) ──────────────────────────────────────────────
  stripeSecretKey:       raw.STRIPE_SECRET_KEY?.trim() || undefined,
  stripeWebhookSecret:   raw.STRIPE_WEBHOOK_SECRET?.trim() || undefined,
  stripePriceCore:       raw.STRIPE_PRICE_CORE?.trim() || undefined,
  stripePriceSovereign:  raw.STRIPE_PRICE_SOVEREIGN?.trim() || undefined,
  stripeSuccessUrl:      raw.STRIPE_SUCCESS_URL?.trim() || undefined,
  stripeCancelUrl:       raw.STRIPE_CANCEL_URL?.trim() || undefined,
  // ── Sovereign identity (Phase 1) ─────────────────────────────────────────
  sovereignCreatorUserId: raw.SOVEREIGN_CREATOR_USER_ID?.trim() || undefined,
  sovereignCreatorEmail:  raw.SOVEREIGN_CREATOR_EMAIL?.trim() || undefined,
  googleCseApiKey: raw.GOOGLE_CSE_API_KEY?.trim() || undefined,
  googleCseEngineId: raw.GOOGLE_CSE_ENGINE_ID?.trim() || undefined,
  tavilyApiKey: raw.TAVILY_API_KEY?.trim() || undefined,
  /** Quota-backed system research; BYOK users never consume this. */
  systemTavilyApiKey:
    raw.SYSTEM_TAVILY_API_KEY?.trim() || raw.TAVILY_API_KEY?.trim() || undefined,
  consensusGeminiModel: raw.CONSENSUS_GEMINI_MODEL?.trim() || 'gemini-2.5-flash',
  consensusGroqAnalystModel: raw.CONSENSUS_GROQ_ANALYST_MODEL?.trim() || 'llama-3.3-70b-versatile',
  consensusGroqAltModel: raw.CONSENSUS_GROQ_ALT_MODEL?.trim() || 'mixtral-8x7b-32768',
  consensusGroqJudgeModel: raw.CONSENSUS_GROQ_JUDGE_MODEL?.trim() || 'llama-3.3-70b-versatile',
  googleClientId: raw.GOOGLE_CLIENT_ID?.trim() || undefined,
  googleClientSecret: raw.GOOGLE_CLIENT_SECRET?.trim() || undefined,
  authSecret: raw.NEXTAUTH_SECRET?.trim() || raw.AUTH_SECRET?.trim() || undefined,
  nextAuthUrl: raw.NEXTAUTH_URL?.trim() || raw.AUTH_URL?.trim() || undefined,
  authSuccessRedirect: raw.AUTH_SUCCESS_REDIRECT?.trim() || undefined,
  corsOrigins: parseCorsOrigins(raw.CORS_ORIGINS),
} as const;

export type Env = typeof env;

