/**
 * Chronos: sovereign autonomy heartbeat. Runs on a fixed tick while the user is idle
 * (no recent API activity), asks the local LLM for a strictly validated JSON decision,
 * logs the outcome — downstream policy/graph evolvers consume the same decision types.
 */

import { z } from 'zod';
import { env } from '../../config/env.js';
import { getSemanticLocalIndex } from '../../db/vectorStore.js';
import { listRecentMemories, listRecentTraces } from '../memory/memoryStore.js';
import { getPolicyProfile } from '../evolution/policyStore.js';
import { listRecentEvolutionGaps } from '../evolution/gapStore.js';
import type { ModelProvider } from '../model/modelProvider.js';
import { createOllamaModelProvider } from '../model/ollamaClient.js';
import { appendAutonomyLog } from './autonomyLog.js';

// ---------------------------------------------------------------------------
// Zod: autonomous decision contract (fail-closed → treat as idle)
// ---------------------------------------------------------------------------

export const autonomyActionSchema = z.enum([
  'synthesize_graph',
  'deep_research',
  'refine_policy',
  'idle',
]);

export type AutonomyAction = z.infer<typeof autonomyActionSchema>;

/**
 * Single structured decision from the telemetry pass. All fields required so the model
 * cannot omit accountability; use target "none" / reasoning explaining skip when idle.
 */
export const chronosDecisionSchema = z.object({
  action: autonomyActionSchema,
  /** Focus entity: gap theme, policy knob, graph pair ids, or "none" when idle. */
  target: z.string().min(1).max(500),
  reasoning: z.string().min(1).max(4000),
});

export type ChronosDecision = z.infer<typeof chronosDecisionSchema>;

export function parseChronosDecisionJson(raw: string): ChronosDecision | null {
  let data: unknown;
  try {
    data = JSON.parse(raw.trim());
  } catch {
    return null;
  }
  const parsed = chronosDecisionSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

// ---------------------------------------------------------------------------
// Activity gate (in-memory): user must have hit the API at least once before Chronos runs
// ---------------------------------------------------------------------------

const MAX_ACTIVITY_ENTRIES = 1000;
const lastUserActivityMs = new Map<string, number>();

/** Mark recent user-driven API activity (e.g. chat) so Chronos skips while they work. */
export function touchChronosActivity(userId: string): void {
  // Evict oldest 10% when at capacity to prevent unbounded growth.
  if (lastUserActivityMs.size >= MAX_ACTIVITY_ENTRIES) {
    const toDelete = Math.floor(MAX_ACTIVITY_ENTRIES * 0.1);
    let deleted = 0;
    for (const k of lastUserActivityMs.keys()) {
      if (deleted >= toDelete) break;
      lastUserActivityMs.delete(k);
      deleted++;
    }
  }
  lastUserActivityMs.set(userId, Date.now());
}

/** True if we have seen this user and they have been inactive for at least `idleMs`. */
export function isUserIdleForChronos(userId: string, idleMs: number): boolean {
  const t = lastUserActivityMs.get(userId);
  if (t === undefined) return false;
  return Date.now() - t >= idleMs;
}

/** Pick one user who is idle; optional env filter for single-tenant installs. */
export function nextIdleChronosUser(): string | null {
  const idle = getIdleUserIds();
  if (idle.length === 0) return null;
  return idle[0] ?? null;
}

/** Return all idle user IDs (respects env filter). */
export function getIdleUserIds(): string[] {
  const idle = [...lastUserActivityMs.keys()].filter((uid) =>
    isUserIdleForChronos(uid, env.chronosIdleMs)
  );
  const only = env.chronosUserId;
  if (only) {
    return idle.filter((u) => u === only);
  }
  return idle;
}

// ---------------------------------------------------------------------------
// Telemetry bundle → prompt
// ---------------------------------------------------------------------------

export type SystemTelemetrySnapshot = {
  generatedAtIso: string;
  userId: string;
  policySummary: string;
  recentTracesSummary: string;
  recentMemoriesSummary: string;
  evolutionGapsSummary: string;
  vectorIndexItems: number;
};

async function buildSystemTelemetry(userId: string): Promise<SystemTelemetrySnapshot> {
  const traces = listRecentTraces(userId, 5);
  const memories = listRecentMemories(userId, 8);
  const gaps = listRecentEvolutionGaps(userId, 6);
  const policy = getPolicyProfile(userId);

  let vectorItems = 0;
  try {
    const idx = await getSemanticLocalIndex();
    const stats = await idx.getIndexStats();
    vectorItems = stats.items;
  } catch {
    vectorItems = -1;
  }

  const tracesSummary = traces.length
    ? traces
        .map(
          (t) =>
            `- ${t.createdAt.slice(0, 19)} score=${t.responseScore.toFixed(2)} user="${t.userMessage.slice(0, 120)}${t.userMessage.length > 120 ? '…' : ''}"`
        )
        .join('\n')
    : '(no recent traces)';

  const memoriesSummary = memories.length
    ? memories
        .map((m) => `- [${m.kind}] ${m.summary} (conf=${m.confidence.toFixed(2)})`)
        .join('\n')
    : '(no recent memories)';

  const gapsSummary = gaps.length
    ? gaps.map((g) => `- ${g.createdAt.slice(0, 19)} ${g.reason.slice(0, 160)}`).join('\n')
    : '(no evolution gaps recorded)';

  const policySummary = `verbosity=${policy.verbosity} tone=${policy.tone} structure=${policy.structurePreference} truthStrict=${policy.truthFirstStrictness.toFixed(2)} writingStyle=${policy.writingStyleEnabled}`;

  return {
    generatedAtIso: new Date().toISOString(),
    userId,
    policySummary,
    recentTracesSummary: tracesSummary,
    recentMemoriesSummary: memoriesSummary,
    evolutionGapsSummary: gapsSummary,
    vectorIndexItems: vectorItems,
  };
}

const CHRONOS_SYSTEM_PROMPT = `You are Chronos, the autonomous discretion layer of Obsidian Atlas (local sovereign AI).
You NEVER modify source code. You ONLY output one JSON object describing what background work should run next.

Rules:
- Prefer "idle" if there is nothing substantive to improve or risk of busy-work.
- "synthesize_graph": bridge disconnected knowledge (vector + memories) into a coherent artifact.
- "deep_research": user or system has an epistemic gap worth a focused research pass (use target = short gap label).
- "refine_policy": recent user corrections or patterns suggest adjusting interaction policy (verbosity/tone/strictness).
- Be conservative: false positives waste GPU and user trust.

Output MUST be a single JSON object with keys exactly: "action", "target", "reasoning".
action must be one of: "synthesize_graph", "deep_research", "refine_policy", "idle".
No markdown, no code fences, no extra keys.`;

function telemetryUserMessage(snap: SystemTelemetrySnapshot): string {
  return `## SystemTelemetry

**now (ISO):** ${snap.generatedAtIso}
**user_id:** ${snap.userId}

### Policy (SQLite policy_profiles)
${snap.policySummary}

### Recent conversation traces (last 5)
${snap.recentTracesSummary}

### Recent memories (last 8)
${snap.recentMemoriesSummary}

### Evolution / epistemic gaps (last 6)
${snap.evolutionGapsSummary}

### Semantic index (Vectra)
vector_chunks_indexed: ${snap.vectorIndexItems}

---

Decide the next autonomous step. Return ONLY the JSON object.`;
}

// ---------------------------------------------------------------------------
// Heartbeat execution (sequential, one flight)
// ---------------------------------------------------------------------------

let chronosInFlight = false;
let schedulerHandle: ReturnType<typeof setInterval> | null = null;

export type ChronosHeartbeatResult =
  | { ok: true; decision: ChronosDecision; rawText: string }
  | { ok: false; reason: string; rawText?: string };

export async function runChronosHeartbeat(
  model: ModelProvider,
  userId: string
): Promise<ChronosHeartbeatResult> {
  if (chronosInFlight) {
    return { ok: false, reason: 'chronos_busy' };
  }
  chronosInFlight = true;
  try {
    const snap = await buildSystemTelemetry(userId);
    const userMsg = telemetryUserMessage(snap);

    const gen = await model.generate({
      userId,
      messages: [{ role: 'user', content: userMsg }],
      systemPrompt: CHRONOS_SYSTEM_PROMPT,
      jsonMode: true,
      modelOverride: env.ollamaEvolutionModel,
      temperature: 0.2,
      timeoutMs: env.evolutionLlmTimeoutMs,
    });

    const decision = parseChronosDecisionJson(gen.text);
    if (!decision) {
      appendAutonomyLog({
        userId,
        kind: 'chronos',
        message: 'Decision JSON failed Zod validation or parse',
        decisionJson: gen.text.slice(0, 8000),
        status: 'error',
      });
      return { ok: false, reason: 'invalid_decision_json', rawText: gen.text };
    }

    appendAutonomyLog({
      userId,
      kind: 'chronos',
      message: `action=${decision.action} target=${decision.target.slice(0, 120)}`,
      decisionJson: JSON.stringify(decision),
      status: 'autonomous_draft',
    });

    return { ok: true, decision, rawText: gen.text };
  } finally {
    chronosInFlight = false;
  }
}

async function dispatchChronosAction(userId: string, decision: string): Promise<void> {
  try {
    switch (decision) {
      case 'refine_policy': {
        const { scheduleEvolutionRun } = await import('../evolution/evolutionPipeline.js');
        const { createOllamaModelProvider: createModel } = await import('../model/ollamaClient.js');
        scheduleEvolutionRun({
          traceId: `chronos-${Date.now()}`,
          userId,
          userMessage: '[Chronos scheduled policy refinement]',
          assistantResponse: '',
          systemPrompt: '',
          requestMessages: [],
          model: createModel(),
          chatModelLabel: 'chronos_scheduled',
        });
        break;
      }
      case 'synthesize_graph': {
        const { scheduleEvolutionRun: scheduleRun } = await import('../evolution/evolutionPipeline.js');
        const { createOllamaModelProvider: createModel2 } = await import('../model/ollamaClient.js');
        scheduleRun({
          traceId: `chronos-graph-${Date.now()}`,
          userId,
          userMessage: '[Chronos graph synthesis]',
          assistantResponse: '',
          systemPrompt: '',
          requestMessages: [],
          model: createModel2(),
          chatModelLabel: 'chronos_graph_synthesis',
        });
        break;
      }
      case 'deep_research': {
        const { scheduleEvolutionRun: scheduleDeep } = await import('../evolution/evolutionPipeline.js');
        const { createOllamaModelProvider: createModel3 } = await import('../model/ollamaClient.js');
        scheduleDeep({
          traceId: `chronos-research-${Date.now()}`,
          userId,
          userMessage: '[Chronos deep research]',
          assistantResponse: '',
          systemPrompt: '',
          requestMessages: [],
          model: createModel3(),
          chatModelLabel: 'chronos_deep_research',
        });
        break;
      }
      case 'idle':
      default:
        break;
    }
  } catch (err) {
    console.error(`[Chronos] dispatchChronosAction failed for user ${userId}:`, err);
  }
}

async function processUserTick(model: ModelProvider, userId: string): Promise<void> {
  try {
    const result = await runChronosHeartbeat(model, userId);
    if (result.ok) {
      await dispatchChronosAction(userId, result.decision.action);
    } else if (result.reason !== 'chronos_busy') {
      console.warn('[chronos] heartbeat skipped or failed:', result.reason);
    }
  } catch (e) {
    console.warn('[chronos] tick error', e);
    appendAutonomyLog({
      userId,
      kind: 'chronos',
      message: e instanceof Error ? e.message : String(e),
      status: 'error',
    });
  }
}

async function chronosTick(model: ModelProvider): Promise<void> {
  const idleUsers = getIdleUserIds();
  const batch = idleUsers.slice(0, 3);
  if (batch.length === 0) return;
  await Promise.allSettled(batch.map((uid) => processUserTick(model, uid)));
}

/** Start interval worker; no overlap thanks to chronosInFlight + idle gate. */
export function startChronosScheduler(model: ModelProvider = createOllamaModelProvider()): void {
  if (schedulerHandle) return;
  schedulerHandle = setInterval(() => {
    void chronosTick(model);
  }, env.chronosTickMs);
}

export function stopChronosScheduler(): void {
  if (schedulerHandle) {
    clearInterval(schedulerHandle);
    schedulerHandle = null;
  }
}
