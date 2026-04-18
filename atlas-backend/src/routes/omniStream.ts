// Atlas-Audit: [EXEC-OMNI] Verified — omni-stream body accepts lineOfInquiry (Home + Resonance); echoed on routing/done so clients retain provenance; posture no longer silently dropped for validated callers.
// Atlas-Audit: [IX] Verified
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../config/env.js';
import { touchChronosActivity } from '../services/autonomy/chronos.js';
import { triggerEvolutionAfterOmniResponse } from '../services/autonomy/evolutionTrigger.js';
import { getVerifiedUserEmail } from '../services/auth/requestAuth.js';
import { getPolicyProfile } from '../services/evolution/policyStore.js';
import { CognitiveQuotaError, assertChatQuotaAllows, recordChatTokenUsage } from '../services/governance/quotaStore.js';
import { TIER_MODEL_ACCESS, type SubscriptionTier } from '../services/intelligence/groundwork/v4/subscriptionSchema.js';
import { getSubscriptionStatus } from '../services/intelligence/groundwork/v4/stripeService.js';
import { getDb } from '../db/sqlite.js';
import { supabaseRest } from '../db/supabase.js';
import { applyOverseerLens } from '../services/governance/overseerService.js';
import { enqueueGpuTask, newGpuRequestId } from '../services/inference/queueManager.js';
import { runMaximumClarityTrack } from '../services/intelligence/maximumClarityPipeline.js';
import {
  executeLocalOllama,
  injectAtlasRoutingIntoMessages,
  resolveOmniComputeLane,
  resolveOmniRouting,
} from '../services/intelligence/omniRouter.js';
import {
  executeGroqGeminiDualConsensus,
  executeSwarmPipeline,
  planSwarmExecution,
  planUsesLocalOllama,
  swarmPlanToGroqRoutingDecision,
} from '../services/intelligence/swarmOrchestrator.js';
import { getRegistryEntry, mapModelRegistryIdToSwarm } from '../services/intelligence/llmRegistry.js';
import {
  QuotaExceededError,
  SystemDeepResearchUnavailableError,
} from '../services/intelligence/quotaManager.js';
import { mirrorforgeStateSchema } from '../services/intelligence/telemetryTranslator.js';
import { isSovereignOwnerEmail } from '../services/intelligence/router.js';
import { TRANSIENT_USER_MESSAGE } from '../services/intelligence/universalAdapter.js';
import type { ChatRole } from '../types/atlas.js';

// ---------------------------------------------------------------------------
// Legacy model migration — stored preferences may contain deprecated model IDs
// ---------------------------------------------------------------------------

const MODEL_MIGRATION_MAP: Record<string, string> = {
  'gpt-4o':               'gpt-5.4',
  'gpt-4o-mini':          'gpt-5.4-mini',
  'openai/gpt-4o':        'gpt-5.4',
  'openai/gpt-4o-mini':   'gpt-5.4-mini',
  'gpt-3.5-turbo':        'gpt-5.4-nano',
  'openai/gpt-3.5-turbo': 'gpt-5.4-nano',
};

/** Migrate a stored preferred model to its gpt-5.4 family equivalent. */
function migratePreferredModel(stored: string | null | undefined): string | null {
  if (!stored) return null;
  return MODEL_MIGRATION_MAP[stored] ?? stored;
}

/** Replace raw API error strings (e.g. [GoogleGenerativeAI Error]) with a clean user-facing message. */
function sanitizeErrorMessage(msg: string): string {
  if (
    msg.includes('[GoogleGenerativeAI Error]') ||
    msg.includes('GoogleGenerativeAI') ||
    (msg.includes('503') && (msg.includes('Service Unavailable') || msg.includes('overloaded'))) ||
    msg.includes('high demand') ||
    (msg.includes('429') && (msg.includes('Rate limit') || msg.includes('Too Many Requests'))) ||
    msg.includes('RESOURCE_EXHAUSTED')
  ) {
    return TRANSIENT_USER_MESSAGE;
  }
  return msg;
}

export const omniBodySchema = z.object({
  userId: z.string().min(1).optional(), // AUDIT FIX: userId is now optional — session is authoritative
  requestId: z.string().uuid().optional(),
  /** 1–5: concise → deep synthesis (Section IX posture scale). Omitted → inferred from line of inquiry. */
  posture: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).optional(),
  /**
   * Client routing provenance: e.g. auto-classified (Home inferInquiryPosture), manual-posture, resonance-chamber.
   * Does not replace server mode inference from user text; surfaced in SSE for continuity and ops honesty.
   */
  lineOfInquiry: z.string().max(64).optional(),
  /** Optional override for structured context pack (see sovereigntyResponseRouter). */
  sovereignResponseMode: z.string().max(64).optional(),
  /** Maximum Clarity: Tavily + Groq/Gemini dual lanes + Gemini judge (public lane). */
  maximumClarity: z.boolean().optional(),
  /** Consensus Mode: Groq + Gemini parallel + Gemini judge, no Tavily (public lane). Ignored when maximumClarity is true. */
  consensusMode: z.boolean().optional(),
  /** Optional Mirrorforge snapshot from the Resonance Chamber UI. */
  mirrorforge: mirrorforgeStateSchema.partial().optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(['system', 'user', 'assistant']),
        content: z.string(),
      })
    )
    .min(1),
});

/** Safety net: strip duplicate numbered section headers (e.g. ## 1. appearing twice). */
function deduplicateSections(text: string): string {
  const lines = text.split('\n');
  const seenHeaders = new Set<string>();
  const result: string[] = [];
  let skipUntilNextHeader = false;

  for (const line of lines) {
    const isHeader = /^#{1,3}\s+\d+[\.\)]/.test(line) || /^\*\*\d+[\.\)]/.test(line);
    if (isHeader) {
      const normalized = line.trim().toLowerCase().replace(/\s+/g, ' ');
      if (seenHeaders.has(normalized)) {
        skipUntilNextHeader = true;
        continue;
      }
      seenHeaders.add(normalized);
      skipUntilNextHeader = false;
    }
    if (!skipUntilNextHeader) {
      result.push(line);
    }
  }
  return result.join('\n');
}

function passesQualityGate(
  query: string,
  response: string
): { pass: boolean; issues: string[] } {
  const issues: string[] = [];
  const wordCount = response.trim().split(/\s+/).length;
  const queryWordCount = query.trim().split(/\s+/).length;
  if (queryWordCount > 8 && wordCount < 60) {
    issues.push(`Shallow response: ${wordCount} words for ${queryWordCount}-word query`);
  }
  const sycCount = [
    /great (point|question)/i,
    /you'?re (absolutely|totally) right/i,
    /\bbrilliant\b/i,
    /excellent (point|question)/i,
    /couldn'?t agree more/i,
  ].filter((p) => p.test(response)).length;
  if (sycCount >= 2) issues.push(`Sycophancy: ${sycCount} flattery patterns detected`);
  return { pass: issues.length === 0, issues };
}

function lastUserContent(messages: { role: string; content: string }[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role === 'user') return messages[i]!.content;
  }
  return '';
}

function sseWrite(raw: { write: (s: string) => boolean }, event: string, data: unknown): void {
  raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** Run an async task while emitting SSE heartbeats every 15 s to prevent client watchdog timeouts during silent processing. */
async function withHeartbeat<T>(
  raw: { write: (s: string) => boolean },
  task: () => Promise<T>,
): Promise<T> {
  const hb = setInterval(() => sseWrite(raw, 'heartbeat', { ts: Date.now() }), 15_000);
  try {
    return await task();
  } finally {
    clearInterval(hb);
  }
}

/** Strip provider prefix from a model ID for bare-ID comparisons (e.g. 'openai/gpt-4o' → 'gpt-4o'). */
function toBareModelId(id: string): string {
  const slash = id.indexOf('/');
  return slash >= 0 ? id.slice(slash + 1) : id;
}

/** Resolve the user's preferred model from Supabase, validated against their tier. */
async function resolvePreferredModel(
  userId: string,
  tier: SubscriptionTier,
): Promise<string | null> {
  try {
    const result = await supabaseRest<{ preferred_model?: string | null }[]>(
      'GET',
      `atlas_evolution_profiles?user_id=eq.${encodeURIComponent(userId)}&select=preferred_model`,
    );
    if (!result.ok || !result.data || result.data.length === 0) return null;

    const raw = result.data[0]?.preferred_model;
    // Apply migration map: legacy IDs (gpt-4o, openai/gpt-4o, etc.) → gpt-5.4 family
    const preferred = migratePreferredModel(raw);
    if (!preferred) return null;

    // Validate against tier — compare using bare model IDs (no openai/ prefix)
    const allowed = TIER_MODEL_ACCESS[tier]?.modelIds ?? [];
    const barePreferred = toBareModelId(preferred);
    const tierMatch = allowed.some((id) => toBareModelId(id) === barePreferred);
    if (!tierMatch) return null;

    return preferred;
  } catch (err) {
    console.warn('[omniStream] Failed to resolve preferred model:', err); // AUDIT FIX: P1-6 log silent failure
    return null; // non-fatal — fall back to auto-selection
  }
}

/**
 * Maps a UI-level preferred model (modelRegistry ID like 'openai/gpt-4o')
 * to a swarm-level llmRegistry ID (like 'gpt-4o'), validated against the
 * swarm registry. Returns null if no valid mapping exists.
 */
function resolveSwarmModelFromPreferred(preferredModel: string | null): string | null {
  if (!preferredModel) return null;
  const swarmId = mapModelRegistryIdToSwarm(preferredModel);
  if (!swarmId) return null;
  const entry = getRegistryEntry(swarmId);
  return entry ? swarmId : null;
}

/**
 * Resonance Chamber: SSE stream with routing status → token deltas → done (+ evolution scheduled).
 */
export function registerOmniStreamRoutes(app: FastifyInstance): void {
  app.post('/v1/chat/omni-stream', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const parsed = omniBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }

    const {
      messages,
      requestId: bodyRequestId,
      mirrorforge,
      maximumClarity,
      consensusMode,
      posture: bodyPosture,
      lineOfInquiry,
      sovereignResponseMode: bodySovereignMode,
    } = parsed.data;
    const traceId = randomUUID();
    const requestId = bodyRequestId ?? newGpuRequestId();
    const userId = request.atlasAuthUser!.databaseUserId;
    const verifiedEmail = getVerifiedUserEmail(request);

    touchChronosActivity(userId);

    let stripeTier: SubscriptionTier | undefined;
    try {
      const subStatus = await getSubscriptionStatus(userId, getDb(), verifiedEmail ?? undefined);
      stripeTier = subStatus?.tier ?? undefined;
    } catch (err) {
      console.warn('[omniStream] Failed to resolve subscription tier:', err); // AUDIT FIX: P1-6 log silent failure
      // non-fatal — fall back to flat quota
    }

    try {
      assertChatQuotaAllows(userId, stripeTier);
    } catch (e) {
      if (e instanceof CognitiveQuotaError) {
        return reply.status(429).send({ error: e.code, message: e.message });
      }
      throw e;
    }

    // Resolve user's preferred model (non-blocking — falls back to auto on failure)
    // Use session userId (Google sub from JWT) — authoritative, matches what
    // userPreferencesRoutes.ts writes.  Fall back to body userId if no session.
    const preferenceUserId = request.atlasSession?.userId ?? userId;
    const preferredModel = stripeTier
      ? await resolvePreferredModel(preferenceUserId, stripeTier).catch((err) => { console.warn('[omniStream] Failed to resolve preferred model:', err); return null; }) // AUDIT FIX: P1-6 log silent failure
      : null;

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const raw = reply.raw;

    // Declared outside `try` so the `catch` block can inspect accumulated
    // tokens when deciding whether to send a partial-recovery `done` vs an
    // `error` event.  PR #68 added a `fullText.length` check inside `catch`
    // but left the declaration inside `try`, making it a ReferenceError that
    // silently killed the error handler — the root cause of the infinite-
    // thinking regression.
    let fullText = '';
    const onDelta = (t: string) => {
      fullText += t;
      sseWrite(raw, 'delta', { text: t });
    };

    try {
      // verifiedEmail resolved above (before hijack)
      const lane = env.disableLocalOllama ? 'public_swarm' : resolveOmniComputeLane(verifiedEmail);

      sseWrite(raw, 'status', {
        phase: 'routing',
        message:
          lane === 'sovereign_local'
            ? 'Sovereign compute lane: local Ollama (God Mode)…'
            : 'Atlas is routing cognitive load…',
      });
      await new Promise<void>((resolve) => setImmediate(resolve));

      const userPrompt = lastUserContent(messages);
      const routing = resolveOmniRouting(userPrompt, {
        posture: bodyPosture,
        sovereignResponseMode: bodySovereignMode,
      });
      const messagesWithRouting = injectAtlasRoutingIntoMessages(messages, routing);

      sseWrite(raw, 'routing', {
        mode: routing.mode,
        posture: routing.posture,
        lineOfInquiry: lineOfInquiry ?? null,
      });

      const snippet = messages
        .slice(-6)
        .map((m) => `${m.role}: ${m.content.slice(0, 500)}`)
        .join('\n');

      const policyProfile = getPolicyProfile(userId);

      let result: { fullText: string; surface: string; model: string };

      if (lane === 'sovereign_local') {
        if (maximumClarity === true) {
          sseWrite(raw, 'status', {
            phase: 'god_mode',
            message: 'Maximum Clarity cloud track bypassed — streaming from local Ollama.',
          });
          await new Promise<void>((resolve) => setImmediate(resolve));
        }

        sseWrite(raw, 'route', {
          strategy: 'god_mode_local',
          legacyTarget: 'local_gpu',
          rationale: 'sovereign_ollama_bypass',
          plan: null,
          mode: routing.mode,
          posture: routing.posture,
          lineOfInquiry: lineOfInquiry ?? null,
        });
        try {
          result = await executeLocalOllama({
            userId,
            messages,
            onDelta,
            routing,
            timeoutMs:
              maximumClarity === true
                ? Math.max(env.omniLocalTimeoutMs, 300_000)
                : env.omniLocalTimeoutMs,
          });
        } catch (localErr) {
          const aborted =
            (localErr instanceof Error && localErr.name === 'AbortError') ||
            (typeof localErr === 'object' &&
              localErr !== null &&
              'name' in localErr &&
              (localErr as { name?: string }).name === 'AbortError');
          if (aborted) {
            request.log.info(
              { err: localErr },
              'Local Ollama timed out or was aborted; falling back to public swarm lane'
            );
          } else {
            request.log.warn(localErr, 'Local Ollama failed; falling back to public swarm lane');
          }
          sseWrite(raw, 'status', {
            phase: 'fallback',
            message: 'Local Ollama unavailable. Falling back to cloud synthesis lane…',
          });

          const sovereignEligible = isSovereignOwnerEmail(verifiedEmail);
          const fallbackSwarmHint = resolveSwarmModelFromPreferred(preferredModel);
          let plan = await planSwarmExecution({
            userPrompt,
            conversationSnippet: snippet,
            sovereignEligible,
            policyProfile,
            mirrorforge,
            preferredModel: fallbackSwarmHint ?? undefined,
            userTier: stripeTier ?? 'free',
          });
          // Apply preferred model to fallback plan (mapped to swarm registry ID)
          if (
            fallbackSwarmHint &&
            (plan.strategy === 'direct' || plan.strategy === 'delegate')
          ) {
            plan = { ...plan, model: fallbackSwarmHint } as typeof plan;
          }
          const legacy = swarmPlanToGroqRoutingDecision(plan);
          sseWrite(raw, 'route', {
            strategy: plan.strategy,
            legacyTarget: legacy.target,
            rationale: 'sovereign_local_fallback',
            plan,
          });
          const runPipeline = () =>
            withHeartbeat(raw, () => executeSwarmPipeline({
              userId,
              plan,
              messages: messagesWithRouting,
              onDelta,
              onSwarmTicker: (evt) => sseWrite(raw, 'swarm_ticker', evt),
              timeoutMs: 180_000,
              userTier: stripeTier,
            }));
          const useGpuQueue = planUsesLocalOllama(plan) && sovereignEligible;
          const pipeResult = useGpuQueue
            ? await enqueueGpuTask(userId, requestId, runPipeline)
            : await runPipeline();
          result = pipeResult;
        }
      } else {
        const sovereignEligible = isSovereignOwnerEmail(verifiedEmail);

        if (maximumClarity === true) {
          sseWrite(raw, 'status', {
            phase: 'maximum_clarity',
            message: 'Maximum Clarity: Tavily deep research → Groq + Gemini (shared context) → Gemini Judge…',
          });
          await new Promise<void>((resolve) => setImmediate(resolve));

          sseWrite(raw, 'route', {
            strategy: 'maximum_clarity',
            legacyTarget: 'multi_agent',
            rationale: 'maximum_clarity_track',
            plan: null,
          });

          const clarityOut = await runMaximumClarityTrack({
            userId,
            userPrompt,
            onTerminal: (message) => sseWrite(raw, 'clarity_terminal', { message }),
            onDelta,
            timeoutMs: 240_000,
          });
          result = {
            fullText: clarityOut.fullText,
            surface: 'maximum_clarity',
            model: clarityOut.modelLabel,
          };
        } else if (consensusMode === true) {
          sseWrite(raw, 'status', {
            phase: 'consensus',
            message: 'Consensus Mode: Groq Llama 3.3 70B + Gemini 1.5 Pro → Gemini Chief Judge…',
          });
          await new Promise<void>((resolve) => setImmediate(resolve));

          sseWrite(raw, 'route', {
            strategy: 'cloud_consensus',
            legacyTarget: 'multi_agent',
            rationale: 'consensus_mode_dual_cloud',
            plan: null,
          });

          result = await executeGroqGeminiDualConsensus({
            userId,
            clientMessages: messagesWithRouting,
            evidenceBlock: '',
            onDelta,
            onSwarmTicker: (evt) => sseWrite(raw, 'swarm_ticker', evt),
            timeoutMs: 240_000,
            userTier: stripeTier,
          });
        } else {
          const mainSwarmHint = resolveSwarmModelFromPreferred(preferredModel);
          let plan = await planSwarmExecution({
            userPrompt,
            conversationSnippet: snippet,
            sovereignEligible,
            policyProfile,
            mirrorforge,
            preferredModel: mainSwarmHint ?? undefined,
            userTier: stripeTier ?? 'free',
          });

          // Apply user's preferred model if set and the plan uses a direct/delegate strategy
          const swarmModel = mainSwarmHint;
          if (
            swarmModel &&
            (plan.strategy === 'direct' || plan.strategy === 'delegate')
          ) {
            plan = { ...plan, model: swarmModel } as typeof plan;
          }

          const legacy = swarmPlanToGroqRoutingDecision(plan);

          sseWrite(raw, 'route', {
            strategy: plan.strategy,
            legacyTarget: legacy.target,
            rationale: 'reason' in plan ? plan.reason ?? null : null,
            plan,
          });

          const runPipeline = () =>
            withHeartbeat(raw, () => executeSwarmPipeline({
              userId,
              plan,
              messages: messagesWithRouting,
              onDelta,
              onSwarmTicker: (evt) => sseWrite(raw, 'swarm_ticker', evt),
              timeoutMs: 180_000,
              userTier: stripeTier,
            }));

          const useGpuQueue = planUsesLocalOllama(plan) && sovereignEligible;
          const pipeResult = useGpuQueue
            ? await enqueueGpuTask(userId, requestId, runPipeline)
            : await runPipeline();
          result = pipeResult;
        }
      }

      recordChatTokenUsage(userId, undefined, undefined);

      // Deduplication safety net: strip duplicate numbered section headers
      result.fullText = deduplicateSections(result.fullText);

      // Quality gate: append note if issues detected (non-blocking)
      const qg = passesQualityGate(userPrompt, result.fullText);
      if (!qg.pass) {
        result.fullText += `\n\n*[Quality note: ${qg.issues.join('; ')}]*`;
      }

      const requestMessages = messages.filter(
        (m): m is { role: ChatRole; content: string } => m.role !== 'system'
      );

      const cloudSwarm =
        result.surface !== 'god_mode_local' &&
        !result.surface.startsWith('god_mode');

      // Overseer ordering: For swarm strategies, the gpt-5.4 Overseer synthesis is
      // the LAST step inside executeSwarmPipeline (collect-then-stream). For direct/delegate,
      // no multi-output synthesis is needed — single model streams directly.
      // The governance Overseer annotation (applyOverseerLens) below is a post-hoc quality
      // check, not the synthesis layer.
      sseWrite(raw, 'done', {
        traceId,
        requestId,
        reply: result.fullText,
        surface: result.surface,
        model: result.model,
        evolution: 'scheduled',
        cloudSwarm,
        routing: {
          mode: routing.mode,
          posture: routing.posture,
          lineOfInquiry: lineOfInquiry ?? null,
        },
      });

      // ── Overseer annotation: run concurrently with stream end, emit before closing ────────────
      // Start Overseer immediately (was already accumulating in parallel during streaming).
      // Await with a tight budget so we never hold the stream open indefinitely.
      const OVERSEER_SSE_TIMEOUT_MS = 5_000;
      let overseerResult: import('../services/governance/overseerService.js').OverseerResult | null = null;
      try {
        const overseerPromise = applyOverseerLens(userId, result.fullText, {
          query: userPrompt,
          mode: routing.mode ?? 'default',
          userId,
          conversationId: traceId,
          modelOutputs: [],
        });
        // Race against timeout so we never block user delivery by more than OVERSEER_SSE_TIMEOUT_MS
        overseerResult = await Promise.race([
          overseerPromise,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), OVERSEER_SSE_TIMEOUT_MS)),
        ]);
      } catch (err) {
        console.error('[omniStream] Overseer failed:', err); // AUDIT FIX: P1-6 log silent failure
        overseerResult = null;
      }

      if (overseerResult) {
        sseWrite(raw, 'overseer_annotation', {
          constitutional_check: overseerResult.constitutionalFlags,
          gap_summary: overseerResult.gapsFound,
          synthesis_notes: overseerResult.synthesisNotes,
          was_personalized: overseerResult.wasPersonalized,
          degraded: overseerResult.degraded,
        });
      }

      raw.end();

      // Trigger evolution pipeline with the (potentially overseer-refined) response
      const finalResponse = overseerResult?.response ?? result.fullText;
      Promise.resolve().then(() => {
        triggerEvolutionAfterOmniResponse({
          traceId,
          userId,
          userMessage: userPrompt,
          assistantResponse: finalResponse,
          requestMessages,
          verifiedEmail,
        });
      }).catch((err) => { console.warn('[omniStream] Evolution pipeline failed:', err); }); // AUDIT FIX: P1-6 log silent failure
    } catch (e) {
      const rawMessage = e instanceof Error ? e.message : String(e);
      request.log.error(e);

      // If tokens have already been streamed, send a done event with the
      // accumulated partial text instead of replacing the visible response
      // with an error message.  The user already saw content — preserving it
      // is far better than flashing "overloaded" over a half-read answer.
      if (fullText.length > 0) {
        request.log.warn(
          { partialLen: fullText.length },
          'Error after partial stream; sending accumulated text as done',
        );
        sseWrite(raw, 'done', {
          traceId,
          requestId,
          reply: fullText,
          surface: 'partial_recovery',
          model: 'unknown',
          partial: true,
        });
        raw.end();
        return;
      }

      const code =
        e instanceof QuotaExceededError
          ? e.code
          : e instanceof SystemDeepResearchUnavailableError
            ? e.code
            : 'internal_error';
      sseWrite(raw, 'error', { message: sanitizeErrorMessage(rawMessage), code });
      raw.end();
    }
  });
}
