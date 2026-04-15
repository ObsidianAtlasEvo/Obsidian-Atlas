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
import { getDb } from '../../db/sqlite.js';
import type { ModelProvider } from '../model/modelProvider.js';
import { createOllamaModelProvider } from '../model/ollamaClient.js';
import { createGroqModelProvider } from '../model/groqModelProvider.js';
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

/**
 * Build a real governance context string for Chronos dispatch actions.
 * Reads from SQLite governance tables and composes a summary for LLM consumption.
 */
function buildGovernanceContextForChronos(userId: string): { userMessage: string; assistantResponse: string } {
  try {
    const db = getDb();

    // Recent unfinished business
    const unfinished = db
      .prepare(
        `SELECT title, kind, composite_score FROM unfinished_business_items
         WHERE user_id = ? AND status = 'open'
         ORDER BY composite_score DESC LIMIT 5`
      )
      .all(userId) as Array<{ title: string; kind: string; composite_score: number }>;

    // Open contradictions
    const contradictions = db
      .prepare(
        `SELECT contradiction_strength, created_at FROM claim_contradictions
         WHERE user_id = ? AND status = 'open'
         ORDER BY contradiction_strength DESC LIMIT 5`
      )
      .all(userId) as Array<{ contradiction_strength: number; created_at: string }>;

    // Recent memories
    const memories = listRecentMemories(userId, 5);

    // Recent evolution gaps
    const gaps = listRecentEvolutionGaps(userId, 4);

    const parts: string[] = ['[GOVERNANCE CONTEXT — Chronos Synthesis Task]'];

    if (unfinished.length > 0) {
      parts.push('\nOpen unfinished business:');
      unfinished.forEach((u) => parts.push(`  - [${u.kind}] ${u.title} (score=${u.composite_score.toFixed(2)})`));
    }

    if (contradictions.length > 0) {
      parts.push('\nOpen epistemic contradictions:');
      contradictions.forEach((c) =>
        parts.push(`  - strength=${c.contradiction_strength.toFixed(2)} since ${c.created_at.slice(0, 10)}`)
      );
    }

    if (memories.length > 0) {
      parts.push('\nRecent memory signals:');
      memories.forEach((m) => parts.push(`  - [${m.kind}] ${m.summary} (conf=${m.confidence.toFixed(2)})`));
    }

    if (gaps.length > 0) {
      parts.push('\nEvolution gaps:');
      gaps.forEach((g) => parts.push(`  - ${g.reason.slice(0, 120)}`));
    }

    const userMessage = parts.join('\n');
    // Use the governance context as both user message and assistant context
    return { userMessage, assistantResponse: userMessage };
  } catch {
    // Tables may not exist — return minimal context
    return {
      userMessage: '[Chronos synthesis — governance state unavailable]',
      assistantResponse: '[governance_context_unavailable]',
    };
  }
}

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
        const graphCtx = buildGovernanceContextForChronos(userId);
        scheduleRun({
          traceId: `chronos-graph-${Date.now()}`,
          userId,
          userMessage: graphCtx.userMessage,
          assistantResponse: graphCtx.assistantResponse,
          systemPrompt: 'You are synthesizing the user\'s cognitive graph. Identify and bridge disconnected knowledge nodes from the governance context provided.',
          requestMessages: [
            { role: 'system', content: 'Cognitive graph synthesis task.' },
            { role: 'user', content: graphCtx.userMessage },
          ],
          model: createModel2(),
          chatModelLabel: 'chronos_graph_synthesis',
        });
        break;
      }
      case 'deep_research': {
        const { scheduleEvolutionRun: scheduleDeep } = await import('../evolution/evolutionPipeline.js');
        const { createOllamaModelProvider: createModel3 } = await import('../model/ollamaClient.js');
        const researchCtx = buildGovernanceContextForChronos(userId);
        // Fire Tavily research if API key is configured
        const { env: envCfg } = await import('../../config/env.js');
        if (envCfg.tavilyApiKey || envCfg.systemTavilyApiKey) {
          try {
            const { runSovereignTavilyResearch } = await import('../intelligence/researchAgent.js');
            // Extract the most salient gap as the research query
            const queryMatch = researchCtx.userMessage.match(/\n  - (.+?)(?:\n|$)/);
            const query = queryMatch ? queryMatch[1].trim() : 'synthesize recent knowledge gaps';
            runSovereignTavilyResearch({
              userPrompt: query,
              tavilyApiKey: (envCfg.systemTavilyApiKey || envCfg.tavilyApiKey)!,
            }).catch((e: unknown) => console.warn('[Chronos] Tavily research failed:', e));
          } catch {
            // researchAgent may not be available — fall through to evolution run
          }
        }
        scheduleDeep({
          traceId: `chronos-research-${Date.now()}`,
          userId,
          userMessage: researchCtx.userMessage,
          assistantResponse: researchCtx.assistantResponse,
          systemPrompt: 'You are conducting a deep research pass on the epistemic gaps identified in the governance context. Surface what is unknown or contradictory.',
          requestMessages: [
            { role: 'system', content: 'Deep research task.' },
            { role: 'user', content: researchCtx.userMessage },
          ],
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
export function startChronosScheduler(model: ModelProvider = createGroqModelProvider()): void {
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
