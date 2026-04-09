import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { getDb } from '../../db/sqlite.js';
import {
  simulationForgeReviewSchema,
  simulationForgeStatusSchema,
  type SimulationForgeReview,
} from '../../types/strategicLayer.js';
import { listActiveConstitutionClauses } from './constitutionalCoreService.js';
import { listActiveTwinTraits } from './cognitiveTwinService.js';
import { listDecisions } from './decisionLedgerService.js';
import { recordGovernanceAudit } from './governanceAudit.js';
import { formatTruthLedgerForPrompt, listActiveClaims } from './truthEvidenceLedgerService.js';
import { summarizeAtlasGraphForPrompt } from './atlasRealityGraphService.js';
import { completeGroqChat } from '../intelligence/universalAdapter.js';

function nowIso(): string {
  return new Date().toISOString();
}

function stripJsonFence(raw: string): string {
  const t = raw.trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)```$/m);
  return (m ? m[1] : t).trim();
}

const FORGE_SYSTEM = `You are the Atlas Strategic Simulation Forge — a pre-consequence reasoning environment.

You receive structured context: constitution, epistemic claims, recent decisions, cognitive twin traits, and (when present) the user's reality graph summary.

Produce exactly ONE JSON object (no markdown fences) with this shape:
{
  "executive_summary": string,
  "scenario_axes": string[],
  "pathways": {
    "label": string,
    "path_summary": string,
    "emotional_driver_score": number (0-1),
    "strategic_driver_score": number (0-1),
    "short_term_relief_vs_long_term_cost": string,
    "second_order_effects": string[],
    "delayed_consequences": string[],
    "reversibility": string,
    "reputational_risk": string,
    "identity_impact": string,
    "likely_reactions": { "actor": string, "reaction": string }[],
    "hidden_tradeoffs": string[],
    "downside_stress_notes": string,
    "opportunity_notes": string,
    "emotional_vs_strategic_diagnosis": string
  }[],
  "recommended_further_tests": string[],
  "narrative_divergence_flags": string[]
}

Rules:
- Model 3–5 distinct plausible pathways (not generic pros/cons).
- Use twin traits to bias likely emotional avoidance, impulsivity, and framing — without ridicule.
- Separate short-term relief from long-term structural cost explicitly.
- Name second-order and delayed consequences where plausible.
- Flag where the user may be choosing a path for emotional comfort vs strategic fit.
- Stay specific; preserve nuance; avoid theatrical tone.`;

export interface SimulationContextBundle {
  constitution_excerpt: string;
  truth_ledger_excerpt: string;
  decisions_excerpt: string;
  twin_excerpt: string;
  reality_graph_excerpt: string;
  domain_tags: string[];
}

export function buildSimulationContextBundle(userId: string, domainTags: string[]): SimulationContextBundle {
  const constitutionRows = listActiveConstitutionClauses(userId, 24);
  const constitution_excerpt =
    constitutionRows.length === 0
      ? '(no constitution clauses)'
      : constitutionRows
          .map((c) => `- [${c.clause_type}] ${c.title}: ${c.body.slice(0, 400)}`)
          .join('\n');

  const truth_ledger_excerpt =
    listActiveClaims(userId, 1).length === 0
      ? '(no epistemic claims)'
      : formatTruthLedgerForPrompt(userId, 16);

  const decisions = listDecisions(userId, 12);
  const decisions_excerpt =
    decisions.length === 0
      ? '(no decision ledger rows)'
      : decisions
          .map((d) => `- ${d.statement.slice(0, 280)} [${d.status}]`)
          .join('\n');

  const traits = listActiveTwinTraits(userId).slice(0, 36);
  const twin_excerpt =
    traits.length === 0
      ? '(no cognitive twin traits)'
      : traits.map((t) => `- [${t.domain}/${t.trait_key}] (${t.source}) ${t.value.slice(0, 220)}`).join('\n');

  return {
    constitution_excerpt,
    truth_ledger_excerpt,
    decisions_excerpt,
    twin_excerpt,
    reality_graph_excerpt: summarizeAtlasGraphForPrompt(userId, 40),
    domain_tags: domainTags,
  };
}

export function createSimulationForge(input: {
  userId: string;
  title: string;
  situationSummary: string;
  domainTags?: string[];
  scenarioDecomposition?: string[];
  linkedDecisionIds?: string[];
}): string {
  const db = getDb();
  const id = randomUUID();
  const ts = nowIso();
  const tags = input.domainTags ?? [];
  const decomp = input.scenarioDecomposition ?? [];
  const bundle = buildSimulationContextBundle(input.userId, tags);

  db.prepare(
    `INSERT INTO simulation_forges (
      id, user_id, title, situation_summary, domain_tags_json, scenario_decomposition_json,
      status, context_bundle_json, pathways_json, actionable_review_json, linked_decision_ids_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, '[]', NULL, ?, ?, ?)`
  ).run(
    id,
    input.userId,
    input.title.trim().slice(0, 500),
    input.situationSummary.trim().slice(0, 50_000),
    JSON.stringify(tags),
    JSON.stringify(decomp),
    JSON.stringify(bundle),
    JSON.stringify(input.linkedDecisionIds ?? []),
    ts,
    ts
  );

  recordGovernanceAudit({
    userId: input.userId,
    action: 'simulation_forge_create',
    entityType: 'simulation_forge',
    entityId: id,
  });

  return id;
}

export function updateSimulationForgeDecomposition(
  userId: string,
  forgeId: string,
  scenarioDecomposition: string[]
): void {
  const db = getDb();
  const r = db
    .prepare(
      `UPDATE simulation_forges SET scenario_decomposition_json = ?, updated_at = ? WHERE id = ? AND user_id = ?`
    )
    .run(JSON.stringify(scenarioDecomposition), nowIso(), forgeId, userId);
  if (r.changes === 0) throw new Error('forge_not_found');
}

function persistForgeRun(
  forgeId: string,
  userId: string,
  review: SimulationForgeReview,
  status: 'complete' | 'failed'
): void {
  const db = getDb();
  db.prepare(
    `UPDATE simulation_forges SET
      pathways_json = ?,
      actionable_review_json = ?,
      status = ?,
      updated_at = ?
    WHERE id = ? AND user_id = ?`
  ).run(JSON.stringify(review.pathways), JSON.stringify(review), status, nowIso(), forgeId, userId);
}

/**
 * Runs Groq JSON completion; refreshes context bundle first, then persists structured review + pathways.
 */
export async function runSimulationForge(forgeId: string, userId: string): Promise<SimulationForgeReview> {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM simulation_forges WHERE id = ? AND user_id = ?`)
    .get(forgeId, userId) as
    | {
        title: string;
        situation_summary: string;
        domain_tags_json: string;
        scenario_decomposition_json: string;
        linked_decision_ids_json: string;
      }
    | undefined;
  if (!row) throw new Error('forge_not_found');

  const domainTags = JSON.parse(row.domain_tags_json) as string[];
  const bundle = buildSimulationContextBundle(userId, domainTags);
  db.prepare(`UPDATE simulation_forges SET context_bundle_json = ?, status = 'running', updated_at = ? WHERE id = ?`)
    .run(JSON.stringify(bundle), nowIso(), forgeId);

  const apiKey = env.groqApiKey?.trim() || env.cloudOpenAiApiKey?.trim();
  if (!apiKey) {
    const fallback: SimulationForgeReview = {
      executive_summary:
        'Simulation Forge LLM unavailable (no Groq key). Context bundle was captured; configure GROQ_API_KEY to generate pathways.',
      scenario_axes: ['Model unavailable'],
      pathways: [],
      recommended_further_tests: ['Configure API keys and re-run runSimulationForge.'],
      narrative_divergence_flags: [],
    };
    persistForgeRun(forgeId, userId, fallback, 'failed');
    return fallback;
  }

  const userMsg = [
    `FORGE_TITLE: ${row.title}`,
    '',
    'SITUATION (user narrative):',
    row.situation_summary,
    '',
    'SCENARIO_DECOMPOSITION (axes / sub-questions):',
    row.scenario_decomposition_json,
    '',
    'DOMAIN_TAGS:',
    row.domain_tags_json,
    '',
    'LINKED_DECISION_IDS:',
    row.linked_decision_ids_json,
    '',
    '--- CONTEXT_BUNDLE ---',
    JSON.stringify(bundle, null, 2),
  ].join('\n');

  const model = env.consensusGroqAnalystModel || env.groqDelegateModel || 'llama-3.3-70b-versatile';
  const { text: raw } = await completeGroqChat({
    model,
    messages: [
      { role: 'system', content: FORGE_SYSTEM },
      { role: 'user', content: userMsg.slice(0, 120_000) },
    ],
    temperature: 0.35,
    timeoutMs: 120_000,
  });

  let parsed: SimulationForgeReview;
  try {
    parsed = simulationForgeReviewSchema.parse(JSON.parse(stripJsonFence(raw)));
  } catch {
    const fallback: SimulationForgeReview = {
      executive_summary: 'Model output was not valid JSON for SimulationForgeReview schema.',
      scenario_axes: [],
      pathways: [],
      recommended_further_tests: ['Re-run with shorter situation text or inspect raw model output in logs.'],
      narrative_divergence_flags: ['parse_error'],
    };
    persistForgeRun(forgeId, userId, fallback, 'failed');
    return fallback;
  }

  persistForgeRun(forgeId, userId, parsed, 'complete');
  recordGovernanceAudit({
    userId,
    action: 'simulation_forge_run_complete',
    entityType: 'simulation_forge',
    entityId: forgeId,
  });
  return parsed;
}

export function completeSimulationForgeManual(
  userId: string,
  forgeId: string,
  review: SimulationForgeReview
): void {
  simulationForgeReviewSchema.parse(review);
  persistForgeRun(forgeId, userId, review, 'complete');
  recordGovernanceAudit({
    userId,
    action: 'simulation_forge_manual_complete',
    entityType: 'simulation_forge',
    entityId: forgeId,
  });
}

export function listSimulationForges(userId: string, limit = 40) {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, title, situation_summary, domain_tags_json, status, created_at, updated_at
       FROM simulation_forges WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?`
    )
    .all(userId, limit) as {
    id: string;
    title: string;
    situation_summary: string;
    domain_tags_json: string;
    status: string;
    created_at: string;
    updated_at: string;
  }[];
}

export function getSimulationForge(userId: string, forgeId: string) {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM simulation_forges WHERE id = ? AND user_id = ?`)
    .get(forgeId, userId) as Record<string, unknown> | undefined;
  if (!row) return null;
  const status = simulationForgeStatusSchema.safeParse(row.status);
  return {
    ...row,
    status: status.success ? status.data : 'draft',
    domain_tags: JSON.parse(String(row.domain_tags_json ?? '[]')),
    scenario_decomposition: JSON.parse(String(row.scenario_decomposition_json ?? '[]')),
    context_bundle: row.context_bundle_json ? JSON.parse(String(row.context_bundle_json)) : null,
    pathways: JSON.parse(String(row.pathways_json ?? '[]')),
    actionable_review: row.actionable_review_json ? JSON.parse(String(row.actionable_review_json)) : null,
    linked_decision_ids: JSON.parse(String(row.linked_decision_ids_json ?? '[]')),
  };
}

export function formatSimulationForgeForPrompt(userId: string, limit = 2): string {
  const rows = listSimulationForges(userId, limit);
  if (rows.length === 0) return '(no simulation forges on file)';
  return rows
    .map((r) => {
      const full = getSimulationForge(userId, r.id);
      const review = full?.actionable_review as SimulationForgeReview | null;
      const summary = review?.executive_summary?.slice(0, 600) ?? '(no review yet)';
      return `### ${r.title} [${r.status}]\n${summary}`;
    })
    .join('\n\n');
}
