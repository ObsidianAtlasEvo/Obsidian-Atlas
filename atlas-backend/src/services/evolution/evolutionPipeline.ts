import { EventEmitter } from 'node:events';
import { appendAtlasSftJsonl, appendApprovedSftExample } from './datasetWriter.js';
import { evaluateExchange } from './evalEngine.js';
import { saveEvolutionGap } from './gapStore.js';
import { evolvePolicyTelemetryFromEval } from '../autonomy/policyEvolver.js';
import { applyExplicitPolicyCorrections } from './policyStore.js';
import { extractMemoryCandidates } from '../memory/memoryExtractor.js';
import { saveMemory, saveTrace } from '../memory/memoryStore.js';
import type { ModelProvider } from '../model/modelProvider.js';
import { env } from '../../config/env.js';
import type { ChatRole } from '../../types/atlas.js';

export interface EvolutionJobPayload {
  traceId: string;
  userId: string;
  userMessage: string;
  assistantResponse: string;
  systemPrompt: string;
  requestMessages: Array<{ role: ChatRole; content: string }>;
  model: ModelProvider;
  /** Main chat model name (for logging / metadata). */
  chatModelLabel: string;
}

const pipelineEvents = new EventEmitter();

/** Subscribe to evolution lifecycle (optional metrics UI). */
export const evolutionBus = pipelineEvents;

/**
 * Non-blocking enqueue: runs Evaluate → Extract → Policy → Archive after the HTTP response is sent.
 */
export function scheduleEvolutionRun(job: EvolutionJobPayload): void {
  setImmediate(() => {
    void runEvolutionJob(job).catch((err) => {
      pipelineEvents.emit('error', { traceId: job.traceId, err });
      console.error('[evolution] job failed', job.traceId, err);
    });
  });
}

async function runEvolutionJob(job: EvolutionJobPayload): Promise<void> {
  const { traceId, userId, userMessage, assistantResponse, systemPrompt, requestMessages, model } = job;

  pipelineEvents.emit('start', { traceId, userId });

  applyExplicitPolicyCorrections(userId, userMessage);

  let candidates: Awaited<ReturnType<typeof extractMemoryCandidates>> = [];
  try {
    candidates = await extractMemoryCandidates(model, {
      userMessage,
      assistantMessage: assistantResponse,
    });
  } catch {
    candidates = [];
  }

  let evalResult: Awaited<ReturnType<typeof evaluateExchange>>;
  try {
    evalResult = await evaluateExchange(model, {
      userMessage,
      assistantResponse,
      memoryCandidates: candidates,
    });
  } catch {
    evalResult = await evaluateExchange(undefined, {
      userMessage,
      assistantResponse,
      memoryCandidates: candidates,
    });
  }

  if (evalResult.gapFlagged) {
    try {
      saveEvolutionGap({
        userId,
        traceId,
        reason: `combinedNormalized ${evalResult.combinedNormalized} < gapThreshold ${env.evalGapThreshold}`,
        evaluation: evalResult,
      });
    } catch {
      /* ignore gap write failure */
    }
  }

  try {
    evolvePolicyTelemetryFromEval(userId, evalResult);
  } catch {
    /* policy telemetry evolution is best-effort */
  }

  const memoriesPersisted: { id: string; summary: string }[] = [];
  for (const c of candidates) {
    if (c.confidence < env.memoryConfidenceThreshold) continue;
    try {
      const row = saveMemory({
        userId,
        kind: c.kind,
        summary: c.summary,
        detail: c.detail,
        confidence: c.confidence,
        sourceTraceId: traceId,
        tags: c.tags,
      });
      memoriesPersisted.push({ id: row.id, summary: row.summary });
    } catch {
      /* skip single memory failure */
    }
  }

  const createdAt = new Date().toISOString();
  try {
    saveTrace({
      id: traceId,
      userId,
      userMessage,
      assistantResponse,
      responseScore: evalResult.responseScore,
      memoryCandidates: candidates.length,
      datasetApproved: evalResult.datasetApproved,
      createdAt,
    });
  } catch {
    pipelineEvents.emit('trace_failed', { traceId });
    return;
  }

  if (evalResult.datasetApproved) {
    const sftMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: systemPrompt },
      ...requestMessages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'assistant', content: assistantResponse },
    ];

    try {
      appendAtlasSftJsonl(sftMessages);
    } catch {
      /* ignore */
    }

    try {
      appendApprovedSftExample({
        userId,
        exchangeTraceId: traceId,
        messages: sftMessages,
        evaluation: evalResult,
      });
    } catch {
      /* ignore */
    }
  }

  pipelineEvents.emit('complete', {
    traceId,
    userId,
    evalResult,
    memoriesPersisted,
    candidateCount: candidates.length,
    chatModel: job.chatModelLabel,
  });
}
