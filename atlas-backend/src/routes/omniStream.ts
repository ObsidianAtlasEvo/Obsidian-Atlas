// Atlas-Audit: [EXEC-OMNI] Verified — omni-stream body accepts lineOfInquiry (Home + Resonance); echoed on routing/done so clients retain provenance; posture no longer silently dropped for validated callers.
// Atlas-Audit: [IX] Verified
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../config/env.js';
import { EvolutionRepository } from '../db/evolutionRepository.js';
import { getFailureModeDoctrine } from '../resilience/failureModeDoctrine.js';
import { touchChronosActivity } from '../services/autonomy/chronos.js';
import { triggerEvolutionAfterOmniResponse } from '../services/autonomy/evolutionTrigger.js';
import { attachAtlasSession } from '../services/auth/authProvider.js';
import { getVerifiedUserEmail } from '../services/auth/requestAuth.js';
import { getPolicyProfile } from '../services/evolution/policyStore.js';
import { CognitiveQuotaError, assertChatQuotaAllows, recordChatTokenUsage } from '../services/governance/quotaStore.js';
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
import { streamGroqChat } from '../services/intelligence/universalAdapter.js';
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

function lastUserContent(messages: { role: string; content: string }[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role === 'user') return messages[i]!.content;
  }
  return '';
}

async function loadEvolutionProfileForOmni(userId: string) {
  if (!env.evolutionEnabled || !env.supabaseUrl || !env.supabaseServiceKey) {
    return null;
  }
  const doctrine = getFailureModeDoctrine();
  const repo = new EvolutionRepository(env.supabaseUrl, env.supabaseServiceKey);
  return doctrine.withFallback(
    'supabase',
    () => repo.getProfile(userId),
    async () => null,
    { userId },
  );
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
      const evolutionProfile = await loadEvolutionProfileForOmni(userId);

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
            evolutionProfile,
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
        } else if (env.directGroqMode) {
          sseWrite(raw, 'route', {
            strategy: 'direct',
            legacyTarget: 'groq',
            rationale: 'direct_groq_mode',
            plan: null,
          });

          const directOut = await streamGroqChat({
            model: env.cloudChatModel,
            messages: messagesWithRouting as { role: 'system' | 'user' | 'assistant'; content: string }[],
            onDelta,
            timeoutMs: 120_000,
          });
          result = { ...directOut, surface: 'direct_groq' };
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

      const requestMessages = messages.filter(
        (m): m is { role: ChatRole; content: string } => m.role !== 'system'
      );

      if (!result.fullText.trim()) {
        request.log.warn(
          {
            userId,
            surface: result.surface,
            model: result.model,
            promptPreview: userPrompt.slice(0, 200),
          },
          'omni_stream_empty_reply',
        );
        sseWrite(raw, 'error', {
          code: 'empty_reply',
          message:
            'Atlas returned no text. Often: Ollama hit context/token limits after a long thread, model unloaded, or OLLAMA_BASE_URL misconfigured (use http://host:11434/api). Try a fresh question, shorter thread, or restart Ollama; check pm2 logs for omni_stream_empty_reply.',
        });
        raw.end();
        return;
      }

      triggerEvolutionAfterOmniResponse({
        traceId,
        userId,
        userMessage: userPrompt,
        assistantResponse: result.fullText,
        requestMessages,
        verifiedEmail,
      });

      const cloudSwarm =
        result.surface !== 'god_mode_local' &&
        !result.surface.startsWith('god_mode');

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
      raw.end();
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
