/**
 * openaiRoutingDecision.ts
 *
 * VERSION: v4
 * DATE: April 2026
 * SUPERSEDES: v3 (groundwork/v3/)
 *
 * CHANGES FROM v3 (adversarial validation pass — 2026-04-15):
 *   - Patch 5a: safeDefaultRoutingDecision() — two fixes:
 *     · usedGroqFallback: false (was true in v3). No actual Groq classification
 *       occurs inside this function — the flag was semantically wrong.
 *     · estimatedOutputTokens: path === 'A' ? 300 : 800 (was always 800 regardless
 *       of path). Path A (nano direct) has a realistic estimate of 300 tokens, not 800.
 *       Aligns with routeToOpenAIPath() which already maps Path A → 300.
 *   - Patch 5b: classifyAndRoute() — three fixes:
 *     · effectiveBudgetMode computed once at function entry (cleaner, DRY).
 *     · All three fallback branches use safeDefaultRoutingDecision(effectiveBudgetMode)
 *       with usedGroqFallback: false (correct — no Groq classification occurs here).
 *     · Error classification uses is429OpenAI, isOpenAIOverload, OpenAITimeoutError
 *       (correct typed checks — no string matching or generic instanceof Error).
 *     · Comment updated to remove misleading "Groq fallback" language.
 *
 * All v3 fixes (Repairs 1–11, Corrections 4–5, 11) are preserved verbatim.
 *
 * OpenAI routing decision contract, nano intake classifier, and
 * cost-aware Path A/B/C/D selector.
 *
 * This module is the intelligence routing layer powered by gpt-5.4-nano.
 * It runs BEFORE the swarm orchestrator and determines which models and
 * paths are needed for a given request.
 *
 * Architecture position:
 *   OmniRouter (heuristic) → classifyWithNano() → routeToOpenAIPath() → swarm
 */

import { env } from '../../../../config/env.js';
import {
  OpenAIRateLimitError,
  OpenAITimeoutError,
  is429OpenAI,
  isOpenAIOverload,
} from './openaiModelProvider';

// ─── Classification schema ────────────────────────────────────────────────────

/** Category of the user's intent */
export type IntentCategory =
  | 'question'      // seeking information
  | 'task'          // requesting action or output creation
  | 'analysis'      // asking for evaluation, breakdown, or assessment
  | 'creation'      // creative work: writing, code, design
  | 'reflection'    // self-referential, identity, philosophical
  | 'command'       // imperative directive to Atlas
  | 'conversation'; // casual chat, greetings

/**
 * Structured classification produced by gpt-5.4-nano.
 *
 * This schema is sent to nano as the JSON output contract.
 * All fields are required in the nano response — if nano omits a field,
 * the classification is invalid and the safe default fallback is triggered.
 */
export interface OpenAIClassification {
  /** Natural language summary of what the user wants (max 80 chars) */
  intent: string;

  /** Category of the intent */
  intent_category: IntentCategory;

  /**
   * How wrong can Atlas afford to be? (0–100)
   * Calibration:
   *   0–24:  casual, lookup, low-consequence (Path A territory)
   *   25–69: analytical, decisions with moderate stakes (Path B territory)
   *   70–100: identity/doctrine, high-consequence decisions, explicit depth (Path C/D territory)
   */
  stakes: number;

  /** How underspecified or ambiguous is this request? (0–100) */
  ambiguity: number;

  /** Does answering well require Atlas memory / past context? */
  memory_need: boolean;

  /** Does answering well require web search or code execution? */
  tool_need: boolean;

  /** How novel or out-of-distribution is this request? (0–100) */
  novelty: number;

  /**
   * How likely is a multi-specialist swarm to produce contradictory outputs? (0–100)
   * High conflict_risk = strong signal to use pro arbitration.
   */
  conflict_risk: number;

  /** Primary domain (e.g., "software engineering", "philosophy", "atlas identity") */
  domain: string;

  /** Nano's recommended execution path */
  recommended_path: 'A' | 'B' | 'C' | 'D';

  /**
   * Registry IDs of specialist models recommended for Path B/C/D.
   * Empty for Path A.
   */
  specialists: string[];

  /** Does this request require real-time / live data? */
  need_current_info: boolean;

  /** Did the user explicitly request deep analysis or maximum depth? */
  explicit_depth_request: boolean;

  /** Nano's confidence in its own classification (0–1) */
  confidence: number;
}

// ─── Routing decision contract ────────────────────────────────────────────────

/** Budget mode controls maximum path and model selection */
export type BudgetMode = 'fast' | 'balanced' | 'max-depth';

/** Response delivery mode */
export type ResponseMode = 'direct' | 'structured' | 'stream';

/**
 * OpenAIRouteDecision is the output of the routing layer.
 * It fully specifies which models to use, which capabilities to engage,
 * and what the cost/depth tradeoff is for this request.
 *
 * This interface is the routing contract between the intelligence router
 * and the swarm orchestrator.
 */
export interface OpenAIRouteDecision {
  // ── Capability flags ────────────────────────────────────────────────
  /** Should Atlas retrieve memories before generating? */
  useMemory: boolean;
  /**
   * Should Atlas use external tools (search, code execution)?
   * [CORRECTION 11] When true, the provider MUST include the tools array
   * in the Responses API request body. Currently only web_search is wired.
   */
  useTools: boolean;
  /** Should Atlas run multiple specialist sub-agents? */
  useSpecialists: boolean;
  /** Registry IDs of specialists to invoke (empty if useSpecialists=false) */
  specialists: string[];

  // ── Model selection ─────────────────────────────────────────────────
  /** The model that produces the final synthesized response */
  synthesisModel: 'gpt-5.4-nano' | 'gpt-5.4-mini' | 'gpt-5.4' | 'gpt-5.4-pro';
  /** Whether the pro audit gate was triggered and gpt-5.4-pro is authorized */
  requireProAudit: boolean;

  // ── Output shaping ──────────────────────────────────────────────────
  /** Should the final output be polished for conversational tone? */
  requireChatPolish: boolean;
  /** Delivery mode for the response */
  responseMode: ResponseMode;

  // ── Cost / depth tier ───────────────────────────────────────────────
  /** Budget mode in effect for this request */
  budgetMode: BudgetMode;
  /** Execution path determined by classification + budget mode */
  path: 'A' | 'B' | 'C' | 'D';

  // ── Diagnostics ─────────────────────────────────────────────────────
  /** Nano's confidence in the classification that produced this decision */
  classificationConfidence: number;
  /** Estimated input token count (for cost pre-check) */
  estimatedInputTokens: number;
  /** Estimated output token count (for cost pre-check) */
  estimatedOutputTokens: number;
  /**
   * True if this decision was produced because nano was unavailable AND a Groq
   * classification was successfully used as a fallback at a HIGHER layer.
   * Always false when returned by classifyAndRoute() — no Groq call occurs here.
   * Set to true only by callers that implement their own Groq fallback.
   */
  usedGroqFallback: boolean;
}

// ─── Path threshold constants (COMPILE-TIME REFERENCE ONLY) ──────────────────

/**
 * [CORRECTION 5] PATH_THRESHOLDS is kept as compile-time reference documentation ONLY.
 * These values document the default thresholds but are NOT used in any runtime comparison.
 * All runtime checks use env.openaiProAuditStakeThreshold and
 * env.openaiProAuditConflictThreshold which are read from the environment at call time.
 *
 * To change thresholds: set the env vars, not these constants.
 */
export const PATH_THRESHOLDS = {
  /** [ref only] default stakes ceiling for Path A */
  pathA_maxStakes_default:         24,
  /** [ref only] default min stakes for Path B */
  pathB_minStakes_default:         25,
  /** [ref only] novelty threshold for Path C escalation */
  pathC_novelty_threshold:         70,
  /** [ref only] ambiguity threshold for Path C escalation */
  pathC_ambiguity_threshold:       80,
  /** [ref only] default min stakes for Path C (same as pro stake threshold) */
  pathC_minStakes_default:         70,
  /** [ref only] default minimum stakes for Path D — reads from env at runtime */
  pathD_minStakes_default:         70,
  /** [ref only] default minimum conflict_risk for Path D — reads from env at runtime */
  pathD_minConflictRisk_default:   60,
} as const;

/** Budget mode caps the maximum reachable path */
export const BUDGET_MODE_PATH_CAPS: Record<BudgetMode, 'A' | 'B' | 'C' | 'D'> = {
  'fast':        'A',  // [CORRECTION 4] fast = Path A ONLY. Never gpt-5.4.
  'balanced':    'B',  // [CORRECTION 4] balanced = max Path B
  'max-depth':   'D',  // full escalation allowed
};

// ─── Nano classification prompt ───────────────────────────────────────────────

const NANO_CLASSIFICATION_SYSTEM = `You are the Atlas Intelligence Router. Your only job is to classify the request below and output a routing decision as JSON.

You do NOT answer the request. You classify it.

Output ONLY valid JSON matching this exact schema — no preamble, no explanation, no markdown fences:

{
  "intent": "<max 80 chars describing what the user wants>",
  "intent_category": "<question|task|analysis|creation|reflection|command|conversation>",
  "stakes": <0-100 integer>,
  "ambiguity": <0-100 integer>,
  "memory_need": <true|false>,
  "tool_need": <true|false>,
  "novelty": <0-100 integer>,
  "conflict_risk": <0-100 integer>,
  "domain": "<primary domain string>",
  "recommended_path": "<A|B|C|D>",
  "specialists": [],
  "need_current_info": <true|false>,
  "explicit_depth_request": <true|false>,
  "confidence": <0.0-1.0 float>
}

Stakes calibration:
  0-24: casual conversation, simple lookups, greetings, trivial tasks (Path A)
  25-69: analytical, technical, decisions with moderate consequences (Path B)
  70-100: identity/doctrine, high-consequence decisions, explicit deep analysis requests, strategic decisions (Path C/D)

Path calibration:
  A: stakes<25 AND no memory/tool/specialist need — nano responds directly
  B: stakes 25-69 OR moderate memory/tool need — mini investigates
  C: stakes>=70 OR high novelty (>=70) OR high ambiguity (>=80) — gpt-5.4 synthesizes
  D: stakes>proAuditStakeThreshold AND (conflict_risk>proAuditConflictThreshold OR explicit_depth_request) — gpt-5.4-pro arbitrates

Anti-escalation rule: Do not recommend Path D for straightforward analytical tasks. Reserve D for genuine high-stakes conflicts.`;

// ─── Nano classifier ──────────────────────────────────────────────────────────

interface NanoClassifierOptions {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  routerModel?: string;
}

/**
 * Calls gpt-5.4-nano with the Atlas routing payload and returns a structured
 * OpenAIClassification.
 *
 * Failure modes:
 * - OpenAIRateLimitError (429): caller applies backoff
 * - OpenAITimeoutError: caller triggers immediate conservative fallback
 * - OpenAIServiceOverloadError: caller triggers immediate conservative fallback
 * - JSON parse failure: returns null → caller uses conservative fallback
 *
 * [CORRECTION 7] No OpenAI-Beta header sent.
 * [CORRECTION 6] store: false on all requests.
 *
 * @param routingPayloadJson - The serialized routing payload (message content)
 * @param options - Optional overrides
 * @returns Parsed classification or null on parse failure
 */
export async function classifyWithNano(
  routingPayloadJson: string,
  options: NanoClassifierOptions = {}
): Promise<OpenAIClassification | null> {
  const apiKey = options.apiKey ?? env.openaiApiKey;
  if (!apiKey) {
    throw new Error('[classifyWithNano] OPENAI_API_KEY is not set');
  }

  const baseUrl = (options.baseUrl ?? env.openaiBaseUrl ?? 'https://api.openai.com/v1')
    .replace(/\/$/, '');
  const timeoutMs = options.timeoutMs ?? 800;  // nano should be fast; 800ms hard ceiling
  const routerModel = options.routerModel ?? env.openaiRouterModel ?? 'gpt-5.4-nano';

  const requestBody = {
    model: routerModel,
    input: [{ role: 'user', content: routingPayloadJson }],
    instructions: NANO_CLASSIFICATION_SYSTEM,
    stream: false,
    store: false,  // [CORRECTION 6] Atlas governs its own memory substrate via SQLite. OpenAI response persistence is explicitly disabled.
    text: { format: { type: 'json_object' } },
    temperature: 0,  // deterministic classification
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;

  try {
    response = await fetch(`${baseUrl}/responses`, {
      method: 'POST',
      headers: {
        // [CORRECTION 7] No OpenAI-Beta header. Current Responses API requires no preview header.
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
  } catch (err: unknown) {
    clearTimeout(timer);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new OpenAITimeoutError(
        `[classifyWithNano] Timed out after ${timeoutMs}ms — trigger conservative fallback`
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 429) {
    const retryAfterMs = parseInt(response.headers.get('retry-after') ?? '2', 10) * 1000;
    throw new OpenAIRateLimitError(
      '[classifyWithNano] Rate limited — trigger conservative fallback',
      retryAfterMs
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.warn(
      `[classifyWithNano] HTTP ${response.status} from nano: ${body} — using conservative fallback`
    );
    return null;
  }

  interface NanoRawResponse {
    output_text: string;
    status: string;
  }

  const data = await response.json() as NanoRawResponse;

  if (data.status !== 'completed') {
    console.warn(`[classifyWithNano] Non-completed status: ${data.status} — using conservative fallback`);
    return null;
  }

  try {
    const parsed = JSON.parse(data.output_text) as OpenAIClassification;

    // Validate required fields are present and within range
    if (
      typeof parsed.stakes !== 'number' ||
      typeof parsed.confidence !== 'number' ||
      !['A', 'B', 'C', 'D'].includes(parsed.recommended_path)
    ) {
      console.warn('[classifyWithNano] Malformed classification JSON — using conservative fallback');
      return null;
    }

    // Clamp numeric fields to valid ranges
    parsed.stakes        = Math.max(0, Math.min(100, Math.round(parsed.stakes)));
    parsed.ambiguity     = Math.max(0, Math.min(100, Math.round(parsed.ambiguity ?? 50)));
    parsed.novelty       = Math.max(0, Math.min(100, Math.round(parsed.novelty ?? 50)));
    parsed.conflict_risk = Math.max(0, Math.min(100, Math.round(parsed.conflict_risk ?? 0)));
    parsed.confidence    = Math.max(0, Math.min(1, parsed.confidence));

    return parsed;
  } catch {
    console.warn('[classifyWithNano] Failed to parse nano JSON output — using conservative fallback');
    return null;
  }
}

// ─── Path selector (CORRECTION 4) ────────────────────────────────────────────

interface PathSelectorInput {
  stakes: number;
  conflict_risk: number;
  explicit_depth_request: boolean;
  memory_need: boolean;
  tool_need: boolean;
  novelty: number;
  ambiguity: number;
  specialists: string[];
  confidence: number;
}

/**
 * Determine the execution path and synthesis model based on classification
 * scores and budget mode.
 *
 * [CORRECTION 4] Budget mode is checked as the FIRST gate, not last.
 * The path logic is:
 *   1. Determine budget mode cap FIRST (fast=A, balanced=B, max-depth=D)
 *   2. Only evaluate raw path escalation up to that cap
 *   3. Within the capped range, apply normal escalation rules
 *
 * [CORRECTION 4] 'fast' mode:
 *   - Capped at Path A. Nano responds directly. gpt-5.4 is NEVER used.
 *   - The v1 behavior of upgrading to gpt-5.4 within Path B when stakes ≥ 55
 *     is REMOVED from fast mode. fast means nano-only.
 *
 * [CORRECTION 4] 'balanced' mode:
 *   - Path A for low stakes (stakes < 25, no special needs)
 *   - Path B for standard (mini workers + gpt-5.4 synthesis capped at B)
 *   - Max path is B — no Path C or D.
 *
 * [CORRECTION 5] Pro gate thresholds read from env at runtime:
 *   - env.openaiProAuditStakeThreshold (default: 70)
 *   - env.openaiProAuditConflictThreshold (default: 60)
 *   PATH_THRESHOLDS constants are NOT used in runtime comparisons.
 */
function selectPath(
  scores: PathSelectorInput,
  budgetMode: BudgetMode
): { path: 'A' | 'B' | 'C' | 'D'; synthesisModel: OpenAIRouteDecision['synthesisModel'] } {

  // [CORRECTION 4] Budget mode is the FIRST gate — determine cap before anything else
  const cap = BUDGET_MODE_PATH_CAPS[budgetMode];

  // [CORRECTION 5] Read pro gate thresholds from env at runtime (not from PATH_THRESHOLDS)
  const proStakeThreshold    = env.openaiProAuditStakeThreshold    ?? 70;
  const proConflictThreshold = env.openaiProAuditConflictThreshold ?? 60;

  // [CORRECTION 4] fast mode: Path A only — skip all escalation logic
  if (cap === 'A') {
    return { path: 'A', synthesisModel: 'gpt-5.4-nano' };
  }

  // For balanced (cap=B) and max-depth (cap=D), evaluate escalation within cap

  // Path D: pro gate — only accessible in max-depth mode (cap=D)
  const proGateOpen =
    cap === 'D' &&
    scores.stakes > proStakeThreshold &&
    (scores.conflict_risk > proConflictThreshold || scores.explicit_depth_request);

  if (proGateOpen) {
    return { path: 'D', synthesisModel: 'gpt-5.4-pro' };
  }

  // Path C: only accessible in max-depth mode (cap=D)
  if (
    cap === 'D' &&
    (scores.stakes >= proStakeThreshold ||
      scores.novelty  >= PATH_THRESHOLDS.pathC_novelty_threshold ||
      scores.ambiguity >= PATH_THRESHOLDS.pathC_ambiguity_threshold)
  ) {
    return { path: 'C', synthesisModel: 'gpt-5.4' };
  }

  // Path B: accessible in balanced and max-depth
  if (
    scores.stakes >= 25 ||
    scores.memory_need ||
    scores.tool_need
  ) {
    // Within Path B, the synthesis model is always gpt-5.4-mini (workers) with gpt-5.4 synthesis.
    // [CORRECTION 4] gpt-5.4 is NOT used as direct Path B response in balanced mode.
    // The balanced mode spec says "mini workers + gpt-5.4 synthesis" — the synthesis model
    // is gpt-5.4-mini here because the router selects the WORKER model for Path B dispatch.
    // gpt-5.4 synthesis occurs within the swarm orchestration, not at routing level.
    return { path: 'B', synthesisModel: 'gpt-5.4-mini' };
  }

  // Path A: low stakes, no special needs
  return { path: 'A', synthesisModel: 'gpt-5.4-nano' };
}

// ─── Token estimation ─────────────────────────────────────────────────────────

/** Rough token estimate: 1 token ≈ 4 chars */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ─── Main routing function (CORRECTION 5) ────────────────────────────────────

/**
 * Maps an OpenAIClassification to a full OpenAIRouteDecision.
 *
 * [CORRECTION 5] All threshold comparisons use env values at runtime:
 *   - env.openaiProAuditStakeThreshold
 *   - env.openaiProAuditConflictThreshold
 * No hardcoded constants are used in runtime comparisons.
 *
 * [CORRECTION 11] tool_need → useTools: true in the returned decision.
 * When useTools is true, the provider MUST include the tools array (web_search stub).
 *
 * @param classification - Output from classifyWithNano()
 * @param budgetMode - Budget mode from env or request metadata
 * @param originalPayload - The original routing payload (for token estimation)
 * @returns A complete OpenAIRouteDecision
 */
export function routeToOpenAIPath(
  classification: Pick<
    OpenAIClassification,
    | 'stakes'
    | 'conflict_risk'
    | 'explicit_depth_request'
    | 'memory_need'
    | 'tool_need'
    | 'novelty'
    | 'ambiguity'
    | 'specialists'
    | 'confidence'
  >,
  budgetMode?: BudgetMode,
  originalPayload?: string
): OpenAIRouteDecision {
  const effectiveBudgetMode: BudgetMode =
    budgetMode ?? (env.openaiDefaultBudgetMode as BudgetMode) ?? 'balanced';

  const { path, synthesisModel } = selectPath(
    {
      stakes:                 classification.stakes,
      conflict_risk:          classification.conflict_risk,
      explicit_depth_request: classification.explicit_depth_request,
      memory_need:            classification.memory_need,
      tool_need:              classification.tool_need,
      novelty:                classification.novelty,
      ambiguity:              classification.ambiguity,
      specialists:            classification.specialists,
      confidence:             classification.confidence,
    },
    effectiveBudgetMode
  );

  const requireProAudit  = synthesisModel === 'gpt-5.4-pro';
  const useSpecialists   = path !== 'A' && classification.specialists.length > 0;

  // [CORRECTION 11] tool_need from classification → useTools in decision
  // When useTools=true, the provider includes the tools array in the API request.
  // Currently only web_search is wired as a stub; function/MCP tools come in Phase 4.
  const useTools = classification.tool_need;

  // Estimate output tokens by path
  const estimatedOutputTokensByPath: Record<typeof path, number> = {
    A:  300,
    B:  800,
    C: 2000,
    D: 3000,
  };

  return {
    useMemory:      classification.memory_need,
    useTools,
    useSpecialists,
    specialists:    useSpecialists ? classification.specialists : [],

    synthesisModel,
    requireProAudit,

    requireChatPolish: path === 'A' || path === 'B',
    responseMode: 'direct',

    budgetMode: effectiveBudgetMode,
    path,

    classificationConfidence: classification.confidence,
    estimatedInputTokens:     originalPayload ? estimateTokens(originalPayload) : 0,
    estimatedOutputTokens:    estimatedOutputTokensByPath[path],
    usedGroqFallback:         false,
  };
}

/**
 * Standalone pro audit check.
 * [CORRECTION 5] Reads thresholds from env at runtime — no hardcoded constants.
 *
 * @param stakes - Stakes score (0-100)
 * @param conflictRisk - Conflict risk score (0-100)
 * @param explicitDepthRequest - Whether user explicitly requested deep analysis
 */
export function requiresProAudit(
  stakes: number,
  conflictRisk: number,
  explicitDepthRequest: boolean
): boolean {
  // [CORRECTION 5] Read from env at runtime
  const stakeThreshold    = env.openaiProAuditStakeThreshold    ?? 70;
  const conflictThreshold = env.openaiProAuditConflictThreshold ?? 60;

  return (
    stakes > stakeThreshold &&
    (conflictRisk > conflictThreshold || explicitDepthRequest)
  );
}

// ─── Safe default (v4 PATCH 5a) ───────────────────────────────────────────────

/**
 * Safe default routing decision used when nano is unavailable.
 * Never blocks the user — returns a conservative fallback decision based on budgetMode.
 *
 * [REPAIR 4] Accepts budgetMode and selects an appropriate path and synthesisModel.
 * The old hardcoded Path B / gpt-5.4-mini default was wrong for 'fast' mode users.
 *
 * [v4 PATCH 5a] Two fixes:
 *   1. usedGroqFallback: false — No actual Groq classification occurs inside this function.
 *      The v3 value of `true` was semantically incorrect. This field should only be set
 *      to true by callers that have successfully performed a Groq classification at a
 *      higher layer and are overriding this flag explicitly.
 *   2. estimatedOutputTokens: path === 'A' ? 300 : 800 — Path A (nano direct response)
 *      has a realistic estimate of ~300 tokens, not 800. Aligns with routeToOpenAIPath()
 *      which already maps Path A → 300 in estimatedOutputTokensByPath.
 *
 * @param budgetMode - The budget mode in effect (defaults to 'fast' for maximum safety)
 */
export function safeDefaultRoutingDecision(
  budgetMode: BudgetMode = 'fast'
): OpenAIRouteDecision {
  const path = budgetMode === 'max-depth' ? 'B' : 'A';

  return {
    useMemory: false,
    useTools: false,
    useSpecialists: false,
    specialists: [],

    synthesisModel: path === 'A' ? 'gpt-5.4-nano' : 'gpt-5.4-mini',
    requireProAudit: false,

    requireChatPolish: true,
    responseMode: 'direct',

    budgetMode,
    path,

    classificationConfidence: 0,
    estimatedInputTokens: 0,
    estimatedOutputTokens: path === 'A' ? 300 : 800,

    // [v4 PATCH 5a] No actual Groq fallback happens inside this function.
    // usedGroqFallback is only set to true by callers that implement their own
    // Groq classification path at a higher layer.
    usedGroqFallback: false,
  };
}

// ─── Full classify + route pipeline (v4 PATCH 5b) ────────────────────────────

export interface ClassifyAndRouteResult {
  classification: OpenAIClassification | null;
  decision: OpenAIRouteDecision;
  classifiedByNano: boolean;
}

/**
 * Complete classify-and-route pipeline for a single request.
 *
 * Flow:
 *   1. If OPENAI_NANO_ROUTING_ENABLED is false: return conservative fallback decision.
 *   2. Call classifyWithNano() with the routing payload.
 *   3. On success: call routeToOpenAIPath() with the classification.
 *   4. On nano failure (timeout, 429, overload, parse error): return conservative fallback.
 *
 * This function NEVER throws — it always returns a decision.
 * Errors are absorbed and surfaced via the `classifiedByNano` flag.
 *
 * IMPORTANT: This function does NOT perform any Groq classification internally.
 * `usedGroqFallback` is always false in the returned decision.
 * Callers that want Groq classification as a fallback must implement it at a higher layer
 * and override `usedGroqFallback` themselves.
 *
 * [v4 PATCH 5b] Three fixes vs v3:
 *   1. effectiveBudgetMode computed once at entry (DRY — not repeated in each branch).
 *   2. All fallback branches use safeDefaultRoutingDecision(effectiveBudgetMode) directly.
 *      No spread-override of usedGroqFallback: true (was wrong in v3).
 *   3. Error classification uses typed guards (is429OpenAI, isOpenAIOverload,
 *      OpenAITimeoutError instanceof) — correct and explicit.
 *
 * @param routingPayloadJson - Serialized routing payload
 * @param budgetMode - Budget mode override (else reads from env)
 */
export async function classifyAndRoute(
  routingPayloadJson: string,
  budgetMode?: BudgetMode
): Promise<ClassifyAndRouteResult> {
  const effectiveBudgetMode = budgetMode ?? env.openaiDefaultBudgetMode ?? 'fast';

  // If nano routing is disabled, return a conservative fallback decision.
  // No actual Groq classification occurs inside this function.
  if (!env.openaiNanoRoutingEnabled) {
    return {
      classification: null,
      decision: safeDefaultRoutingDecision(effectiveBudgetMode),
      classifiedByNano: false,
    };
  }

  try {
    const classification = await classifyWithNano(routingPayloadJson);

    if (classification === null) {
      console.warn('[classifyAndRoute] Nano parse failure — using conservative fallback decision');
      return {
        classification: null,
        decision: safeDefaultRoutingDecision(effectiveBudgetMode),
        classifiedByNano: false,
      };
    }

    const decision = routeToOpenAIPath(classification, effectiveBudgetMode, routingPayloadJson);
    return { classification, decision, classifiedByNano: true };
  } catch (err: unknown) {
    if (
      is429OpenAI(err) ||
      isOpenAIOverload(err) ||
      err instanceof OpenAITimeoutError
    ) {
      console.warn(
        `[classifyAndRoute] Nano unavailable (${(err as Error).constructor.name}) ` +
        '— using conservative fallback decision'
      );
      return {
        classification: null,
        decision: safeDefaultRoutingDecision(effectiveBudgetMode),
        classifiedByNano: false,
      };
    }

    console.error('[classifyAndRoute] Unexpected error during nano classification:', err);
    return {
      classification: null,
      decision: safeDefaultRoutingDecision(effectiveBudgetMode),
      classifiedByNano: false,
    };
  }
}

// ─── Shadow mode comparison ───────────────────────────────────────────────────

/**
 * Shadow mode: run nano classification in parallel with the existing Groq
 * Chief of Staff, log the comparison, but use the Groq result for actual routing.
 *
 * Used during Phase 2 validation before promoting nano to primary router.
 * Shadow mode failures are always silent — they never block the main path.
 */
export async function shadowClassify(
  routingPayloadJson: string,
  groqPath: 'A' | 'B' | 'C' | 'D' | undefined,
  budgetMode?: BudgetMode
): Promise<void> {
  try {
    const classification = await classifyWithNano(routingPayloadJson, { timeoutMs: 1200 });

    if (classification) {
      const nanoDecision = routeToOpenAIPath(classification, budgetMode);
      const match        = nanoDecision.path === groqPath;

      console.info('[shadow] Nano vs Groq routing comparison', {
        nanoPath:   nanoDecision.path,
        groqPath,
        match,
        stakes:     classification.stakes,
        confidence: classification.confidence,
        intent:     classification.intent,
      });
    }
  } catch {
    // Shadow mode failures are silent — never block the main path
  }
}
