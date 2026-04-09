import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { getDb } from '../../db/sqlite.js';
import type { TruthChamberOutput } from '../../types/longitudinal.js';
import { chamberStatusSchema, truthChamberOutputSchema } from '../../types/longitudinal.js';
import { listActiveTwinTraits } from './cognitiveTwinService.js';
import { recordGovernanceAudit } from './governanceAudit.js';
import { completeGroqChat } from '../intelligence/universalAdapter.js';

function nowIso(): string {
  return new Date().toISOString();
}

function stripJsonFence(raw: string): string {
  const t = raw.trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)```$/m);
  return (m ? m[1] : t).trim();
}

const CHAMBER_SYSTEM = `You are the Atlas Adversarial Truth Chamber — disciplined reality pressure, not performance contrarianism.

Rules:
- Be exacting, specific, and calm. No theatrical aggression.
- Preserve ambiguity; do not flatten contradictions into false certainty.
- Output exactly ONE JSON object matching this shape (no markdown fences):
{
  "unsupported_claims": string[],
  "contradiction_map": { "claim_a": string, "claim_b": string, "relation": string }[],
  "strongest_opposing_interpretation": string,
  "missing_evidence": string[],
  "likely_distortion_flags": string[],
  "cost_of_error_analysis": string,
  "confidence_downgrade_recommendation": string,
  "pressure_points": string[]
}

Test for: rationalization, omission, emotional distortion, narrative inflation, false certainty, false binaries, ego-protective reading, principle-behavior mismatch, hidden costs of error.`;

export function createChamberSession(input: {
  userId: string;
  targetText: string;
  targetClaimId?: string | null;
  constitutionClauseIds?: string[];
  evidenceIds?: string[];
  decisionIds?: string[];
}): string {
  const db = getDb();
  const id = randomUUID();
  const ts = nowIso();
  const traits = listActiveTwinTraits(input.userId);
  const twinSnap = JSON.stringify(
    traits.slice(0, 40).map((t) => ({ d: t.domain, k: t.trait_key, v: t.value.slice(0, 400), src: t.source }))
  );

  db.prepare(
    `INSERT INTO adversarial_chamber_sessions (
      id, user_id, target_text, target_claim_id, status, structured_output_json,
      constitution_clause_ids_json, evidence_ids_json, decision_ids_json, twin_snapshot_json, created_at, completed_at
    ) VALUES (?, ?, ?, ?, 'running', NULL, ?, ?, ?, ?, ?, NULL)`
  ).run(
    id,
    input.userId,
    input.targetText.trim().slice(0, 50_000),
    input.targetClaimId ?? null,
    JSON.stringify(input.constitutionClauseIds ?? []),
    JSON.stringify(input.evidenceIds ?? []),
    JSON.stringify(input.decisionIds ?? []),
    twinSnap,
    ts
  );

  recordGovernanceAudit({
    userId: input.userId,
    action: 'truth_chamber_session_start',
    entityType: 'adversarial_chamber_session',
    entityId: id,
  });

  return id;
}

/**
 * Runs Groq JSON completion to fill structured truth-pressure fields; persists on success.
 */
export async function runTruthChamberAnalysis(sessionId: string, userId: string): Promise<TruthChamberOutput> {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM adversarial_chamber_sessions WHERE id = ? AND user_id = ?`)
    .get(sessionId, userId) as {
    target_text: string;
    twin_snapshot_json: string | null;
    constitution_clause_ids_json: string;
  } | undefined;
  if (!row) throw new Error('chamber_session_not_found');

  const apiKey = env.groqApiKey?.trim() || env.cloudOpenAiApiKey?.trim();
  if (!apiKey) {
    const fallback: TruthChamberOutput = {
      unsupported_claims: [],
      contradiction_map: [],
      strongest_opposing_interpretation:
        'Truth Chamber LLM unavailable (no Groq key). Re-run with GROQ_API_KEY or supply structured output via API.',
      missing_evidence: ['External model pass not configured'],
      likely_distortion_flags: [],
      cost_of_error_analysis: 'Unknown — analysis not executed.',
      confidence_downgrade_recommendation: 'Hold confidence until a configured model run completes.',
      pressure_points: ['Configure GROQ_API_KEY or POST structured output manually.'],
    };
    persistChamberOutput(sessionId, userId, fallback, 'failed');
    return fallback;
  }

  const userMsg = [
    'TARGET (claims / narrative / plan to pressure-test):',
    row.target_text,
    '',
    'CONSTITUTION_CLAUSE_IDS (context only):',
    row.constitution_clause_ids_json,
    '',
    'TWIN_SNAPSHOT (analytic model — use to calibrate challenge, not to ridicule):',
    (row.twin_snapshot_json ?? '[]').slice(0, 12_000),
  ].join('\n');

  const model = env.consensusGroqAnalystModel || env.groqDelegateModel || 'llama-3.3-70b-versatile';
  const { text } = await completeGroqChat({
    model,
    messages: [
      { role: 'system', content: CHAMBER_SYSTEM },
      { role: 'user', content: userMsg },
    ],
    temperature: 0.15,
    timeoutMs: 90_000,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFence(text));
  } catch {
    const bad: TruthChamberOutput = {
      unsupported_claims: [],
      contradiction_map: [],
      strongest_opposing_interpretation: '(Chamber JSON parse failed — raw model output preserved in audit.)',
      missing_evidence: [],
      likely_distortion_flags: ['model_non_json'],
      cost_of_error_analysis: text.slice(0, 2000),
      confidence_downgrade_recommendation: 'Do not treat failed parse as verified analysis.',
      pressure_points: ['Re-run chamber or paste structured JSON via API.'],
    };
    persistChamberOutput(sessionId, userId, bad, 'failed');
    return bad;
  }

  const out = truthChamberOutputSchema.parse(parsed);
  persistChamberOutput(sessionId, userId, out, 'complete');
  return out;
}

function persistChamberOutput(
  sessionId: string,
  userId: string,
  output: TruthChamberOutput,
  status: 'complete' | 'failed'
): void {
  chamberStatusSchema.parse(status);
  const db = getDb();
  const ts = nowIso();
  db.prepare(
    `UPDATE adversarial_chamber_sessions SET structured_output_json = ?, status = ?, completed_at = ? WHERE id = ? AND user_id = ?`
  ).run(JSON.stringify(output), status, ts, sessionId, userId);
  recordGovernanceAudit({
    userId,
    action: 'truth_chamber_session_complete',
    entityType: 'adversarial_chamber_session',
    entityId: sessionId,
    payload: { status },
  });
}

/** Persist client-supplied structured output (e.g. human-reviewed or external pipeline). */
export function completeChamberSessionManual(
  userId: string,
  sessionId: string,
  output: TruthChamberOutput
): void {
  truthChamberOutputSchema.parse(output);
  persistChamberOutput(sessionId, userId, output, 'complete');
}

export function getChamberSession(userId: string, sessionId: string): unknown {
  const db = getDb();
  return db.prepare(`SELECT * FROM adversarial_chamber_sessions WHERE id = ? AND user_id = ?`).get(sessionId, userId);
}

export function listChamberSessions(userId: string, limit = 20): unknown[] {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM adversarial_chamber_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`)
    .all(userId, limit);
}
