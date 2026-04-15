// Atlas-Audit: [EXEC-OMNI] Verified — omni-stream body accepts lineOfInquiry (Home + Resonance); echoed on routing/done so clients retain provenance; posture no longer silently dropped for validated callers.
// Atlas-Audit: [IX] Verified
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../config/env.js';
import { touchChronosActivity } from '../services/autonomy/chronos.js';
import { triggerEvolutionAfterOmniResponse } from '../services/autonomy/evolutionTrigger.js';
import { attachAtlasSession } from '../services/auth/authProvider.js';
import { getVerifiedUserEmail } from '../services/auth/requestAuth.js';
import { getPolicyProfile } from '../services/evolution/policyStore.js';
import { CognitiveQuotaError, assertChatQuotaAllows, recordChatTokenUsage } from '../services/governance/quotaStore.js';
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
import {
  QuotaExceededError,
  SystemDeepResearchUnavailableError,
} from '../services/intelligence/quotaManager.js';
import { mirrorforgeStateSchema } from '../services/intelligence/telemetryTranslator.js';
import { isSovereignOwnerEmail } from '../services/intelligence/router.js';
import type { ChatRole } from '../types/atlas.js';

const omniBodySchema = z.object({
  userId: z.string().min(1),
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

/**
 * Resonance Chamber: SSE stream with routing status → token deltas → done (+ evolution scheduled).
 */
export function registerOmniStreamRoutes(app: FastifyInstance): void {
  app.post('/v1/chat/omni-stream', async (request, reply) => {
    const parsed = omniBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }

    const {
      userId,
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

    touchChronosActivity(userId);

    try {
      assertChatQuotaAllows(userId);
    } catch (e) {
      if (e instanceof CognitiveQuotaError) {
        return reply.status(429).send({ error: e.code, message: e.message });
      }
      throw e;
    }

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const raw = reply.raw;

    try {
      await attachAtlasSession(request);
      const verifiedEmail = getVerifiedUserEmail(request);
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

      let fullText = '';
      const onDelta = (t: string) => {
        fullText += t;
        sseWrite(raw, 'delta', { text: t });
      };

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
          const plan = await planSwarmExecution({
            userPrompt,
            conversationSnippet: snippet,
            sovereignEligible,
            policyProfile,
            mirrorforge,
          });
          const legacy = swarmPlanToGroqRoutingDecision(plan);
          sseWrite(raw, 'route', {
            strategy: plan.strategy,
            legacyTarget: legacy.target,
            rationale: 'sovereign_local_fallback',
            plan,
          });
          const runPipeline = () =>
            executeSwarmPipeline({
              userId,
              plan,
              messages: messagesWithRouting,
              onDelta,
              onSwarmTicker: (evt) => sseWrite(raw, 'swarm_ticker', evt),
              timeoutMs: 180_000,
            });
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
          });
        } else {
          const plan = await planSwarmExecution({
            userPrompt,
            conversationSnippet: snippet,
            sovereignEligible,
            policyProfile,
            mirrorforge,
          });

          const legacy = swarmPlanToGroqRoutingDecision(plan);

          sseWrite(raw, 'route', {
            strategy: plan.strategy,
            legacyTarget: legacy.target,
            rationale: 'reason' in plan ? plan.reason ?? null : null,
            plan,
          });

          const runPipeline = () =>
            executeSwarmPipeline({
              userId,
              plan,
              messages: messagesWithRouting,
              onDelta,
              onSwarmTicker: (evt) => sseWrite(raw, 'swarm_ticker', evt),
              timeoutMs: 180_000,
            });

          const useGpuQueue = planUsesLocalOllama(plan) && sovereignEligible;
          const pipeResult = useGpuQueue
            ? await enqueueGpuTask(userId, requestId, runPipeline)
            : await runPipeline();
          result = pipeResult;
        }
      }

      recordChatTokenUsage(userId, undefined, undefined);

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

      // Send done immediately with the raw LLM response — user receives it without waiting for Overseer
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
      } catch {
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
      }).catch(() => { /* non-fatal */ });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      request.log.error(e);
      const code =
        e instanceof QuotaExceededError
          ? e.code
          : e instanceof SystemDeepResearchUnavailableError
            ? e.code
            : 'internal_error';
      sseWrite(raw, 'error', { message, code });
      raw.end();
    }
  });
}
