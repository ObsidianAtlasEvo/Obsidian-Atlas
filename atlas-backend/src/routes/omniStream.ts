/**
 * omniStream.ts — V1.0 transport shell
 *
 * Responsibilities (only):
 *   1. Parse + validate request body
 *   2. Authenticate session, resolve subscription tier, resolve preferred model
 *   3. Set up SSE transport
 *   4. Call cognitiveOrchestrator.conductRequest()
 *   5. Serialize conductor SSE events to the raw stream
 *   6. Emit final done / overseer_annotation / error events
 *   7. Trigger async evolution aftermath
 *
 * ALL orchestration logic (lane resolution, mode/posture, context assembly,
 * execution planning, overseer sequencing) lives in cognitiveOrchestrator.ts.
 *
 * Atlas-Audit: [EXEC-OMNI] Verified — omni-stream body accepts lineOfInquiry
 * (Home + Resonance); echoed on routing/done so clients retain provenance.
 * Atlas-Audit: [IX] Verified
 */

import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../config/env.js';
import { touchChronosActivity } from '../services/autonomy/chronos.js';
import { triggerEvolutionAfterOmniResponse } from '../services/autonomy/evolutionTrigger.js';
import { getVerifiedUserEmail } from '../services/auth/requestAuth.js';
import { CognitiveQuotaError, assertChatQuotaAllows, recordChatTokenUsage } from '../services/governance/quotaStore.js';
import { conductRequest } from '../services/governance/cognitiveOrchestrator.js';
import { TIER_MODEL_ACCESS, type SubscriptionTier } from '../services/intelligence/groundwork/v4/subscriptionSchema.js';
import { getSubscriptionStatus } from '../services/intelligence/groundwork/v4/stripeService.js';
import { getDb } from '../db/sqlite.js';
import { supabaseRest } from '../db/supabase.js';
import { newGpuRequestId } from '../services/inference/queueManager.js';
import { mirrorforgeStateSchema } from '../services/intelligence/telemetryTranslator.js';
import {
  QuotaExceededError,
  SystemDeepResearchUnavailableError,
} from '../services/intelligence/quotaManager.js';
import { TRANSIENT_USER_MESSAGE } from '../services/intelligence/universalAdapter.js';
import { mapModelRegistryIdToSwarm } from '../services/intelligence/llmRegistry.js';
import type { ChatRole } from '../types/atlas.js';

// ── Legacy model migration ─────────────────────────────────────────────────

const MODEL_MIGRATION_MAP: Record<string, string> = {
  'gpt-4o':               'gpt-5.4',
  'gpt-4o-mini':          'gpt-5.4-mini',
  'openai/gpt-4o':        'gpt-5.4',
  'openai/gpt-4o-mini':   'gpt-5.4-mini',
  'gpt-3.5-turbo':        'gpt-5.4-nano',
  'openai/gpt-3.5-turbo': 'gpt-5.4-nano',
};

function migratePreferredModel(stored: string | null | undefined): string | null {
  if (!stored) return null;
  return MODEL_MIGRATION_MAP[stored] ?? stored;
}

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

    const preferred = migratePreferredModel(result.data[0]?.preferred_model);
    if (!preferred) return null;

    const allowed = TIER_MODEL_ACCESS[tier]?.modelIds ?? [];
    const tierMatch = allowed.some((id) => toBareModelId(id) === toBareModelId(preferred));
    if (!tierMatch) return null;

    return preferred;
  } catch (err) {
    console.warn('[omniStream] Failed to resolve preferred model:', err);
    return null;
  }
}

/** Replace raw API error strings with a clean user-facing message. */
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

/** Strip duplicate numbered section headers (deduplication safety net). */
function deduplicateSections(text: string): string {
  const lines = text.split('\n');
  const seenHeaders = new Set<string>();
  const result: string[] = [];
  let skipUntilNextHeader = false;

  for (const line of lines) {
    const isHeader = /^#{1,3}\s+\d+[\.)]/.test(line) || /^\*\*\d+[\.)]/.test(line);
    if (isHeader) {
      const normalized = line.trim().toLowerCase().replace(/\s+/g, ' ');
      if (seenHeaders.has(normalized)) {
        skipUntilNextHeader = true;
        continue;
      }
      seenHeaders.add(normalized);
      skipUntilNextHeader = false;
    }
    if (!skipUntilNextHeader) result.push(line);
  }
  return result.join('\n');
}

function passesQualityGate(query: string, response: string): { pass: boolean; issues: string[] } {
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

function sseWrite(raw: { write: (s: string) => boolean }, event: string, data: unknown): void {
  raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// ── Request schema ─────────────────────────────────────────────────────────

export const omniBodySchema = z.object({
  userId: z.string().min(1).optional(),
  requestId: z.string().uuid().optional(),
  /** 1–5 posture scale (Section IX). Omitted → inferred from line of inquiry. */
  posture: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).optional(),
  /**
   * Client routing provenance: e.g. auto-classified (Home inferInquiryPosture),
   * manual-posture, resonance-chamber. Surfaced in SSE for ops honesty.
   */
  lineOfInquiry: z.string().max(64).optional(),
  sovereignResponseMode: z.string().max(64).optional(),
  maximumClarity: z.boolean().optional(),
  consensusMode: z.boolean().optional(),
  mirrorforge: mirrorforgeStateSchema.partial().optional(),
  messages: z
    .array(z.object({ role: z.enum(['system', 'user', 'assistant']), content: z.string() }))
    .min(1),
});

// ── Route registration ─────────────────────────────────────────────────────

export function registerOmniStreamRoutes(app: FastifyInstance): void {
  app.post('/v1/chat/omni-stream', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {

    // ── 1. Parse + validate ───────────────────────────────────────────────
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

    const requestId = bodyRequestId ?? newGpuRequestId();
    const userId = request.atlasAuthUser!.databaseUserId;
    const supabaseUserId = request.atlasAuthUser!.supabaseId;
    const verifiedEmail = getVerifiedUserEmail(request);
    touchChronosActivity(userId);

    // ── 2. Subscription tier ──────────────────────────────────────────────
    let stripeTier: SubscriptionTier | undefined;
    try {
      const subStatus = await getSubscriptionStatus(userId, getDb(), verifiedEmail ?? undefined);
      stripeTier = subStatus?.tier ?? undefined;
    } catch (err) {
      console.warn('[omniStream] Failed to resolve subscription tier:', err);
    }

    // ── 3. Quota check ────────────────────────────────────────────────────
    try {
      assertChatQuotaAllows(userId, stripeTier);
    } catch (e) {
      if (e instanceof CognitiveQuotaError) {
        return reply.status(429).send({ error: e.code, message: e.message });
      }
      throw e;
    }

    // ── 4. Preferred model resolution ─────────────────────────────────────
    const preferenceUserId = request.atlasSession?.userId ?? userId;
    const preferredModel = stripeTier
      ? await resolvePreferredModel(preferenceUserId, stripeTier).catch((err) => {
          console.warn('[omniStream] Failed to resolve preferred model:', err);
          return null;
        })
      : null;

    // Map preferred model to swarm registry ID
    const preferredSwarmModel = preferredModel
      ? (mapModelRegistryIdToSwarm(preferredModel) ?? null)
      : null;

    // ── 5. SSE transport setup ────────────────────────────────────────────
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const raw = reply.raw;
    let fullText = '';

    const onDelta = (t: string) => {
      fullText += t;
      sseWrite(raw, 'delta', { text: t });
    };

    const onSseEvent = (event: string, data: unknown) => {
      sseWrite(raw, event, data);
    };

    // ── 6. Conductor call ─────────────────────────────────────────────────
    try {
      const result = await conductRequest({
        userId,
        supabaseUserId,
        verifiedEmail,
        stripeTier,
        requestId,
        messages,
        posture: bodyPosture,
        lineOfInquiry,
        sovereignResponseMode: bodySovereignMode,
        maximumClarity,
        consensusMode,
        mirrorforge,
        preferredSwarmModel,
        signal: request.signal,
        onDelta,
        onSseEvent,
      });

      // Deduplication + quality gate
      result.fullText = deduplicateSections(result.fullText);
      const qg = passesQualityGate(result.profile.intent, result.fullText);
      if (!qg.pass) {
        result.fullText += `\n\n*[Quality note: ${qg.issues.join('; ')}]*`;
      }

      recordChatTokenUsage(userId, undefined, undefined);

      const cloudSwarm =
        result.surface !== 'god_mode_local' &&
        !result.surface.startsWith('god_mode');

      // ── 7. SSE done ───────────────────────────────────────────────────
      sseWrite(raw, 'done', {
        traceId: result.traceId,
        requestId: result.requestId,
        reply: result.fullText,
        surface: result.surface,
        model: result.model,
        evolution: 'scheduled',
        cloudSwarm,
        routing: {
          mode: result.profile.intent,
          posture: result.profile.gravity,
          lineOfInquiry: lineOfInquiry ?? null,
        },
      });

      // ── 8. Overseer annotation ────────────────────────────────────────
      if (result.overseerResult) {
        sseWrite(raw, 'overseer_annotation', {
          constitutional_check: result.overseerResult.constitutionalFlags,
          gap_summary: result.overseerResult.gapsFound,
          synthesis_notes: result.overseerResult.synthesisNotes,
          was_personalized: result.overseerResult.wasPersonalized,
          degraded: result.overseerResult.degraded,
        });
      }

      raw.end();

      // ── 9. Async aftermath (Stage 8) ──────────────────────────────────
      const userPrompt = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
      const finalResponse = result.overseerResult?.response ?? result.fullText;
      const requestMessages = messages.filter(
        (m): m is { role: ChatRole; content: string } => m.role !== 'system',
      );

      Promise.resolve()
        .then(() => {
          triggerEvolutionAfterOmniResponse({
            traceId: result.traceId,
            userId,
            userMessage: userPrompt,
            assistantResponse: finalResponse,
            requestMessages,
            verifiedEmail,
          });
        })
        .catch((err) => { console.warn('[omniStream] Evolution pipeline failed:', err); });

    } catch (e) {
      const rawMessage = e instanceof Error ? e.message : String(e);
      request.log.error(e);

      // Partial recovery: if tokens were already streamed, preserve what the user saw
      if (fullText.length > 0) {
        request.log.warn(
          { partialLen: fullText.length },
          'Error after partial stream; sending accumulated text as done',
        );
        sseWrite(raw, 'done', {
          traceId: randomUUID(),
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
