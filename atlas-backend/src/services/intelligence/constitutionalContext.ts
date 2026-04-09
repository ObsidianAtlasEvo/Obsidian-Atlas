import { getDb } from '../../db/sqlite.js';
import { formatConstitutionBlockForPrompt, listActiveConstitutionClauses } from '../governance/constitutionalCoreService.js';
import { formatCognitiveTwinForPrompt } from '../governance/cognitiveTwinService.js';
import { formatEvolutionSummaryForPrompt } from '../governance/evolutionTimelineService.js';
import { formatUnfinishedBusinessForPrompt, listOpenUnfinishedRanked } from '../governance/unfinishedBusinessService.js';
import { summarizeAtlasGraphForPrompt } from '../governance/atlasRealityGraphService.js';
import { formatSimulationForgeForPrompt } from '../governance/simulationForgeService.js';
import { formatIdentityBridgeForPrompt } from '../governance/identityActionBridgeService.js';
import { formatSelfRevisionForPrompt } from '../governance/selfRevisionService.js';
import {
  formatTruthLedgerForPrompt,
  listActiveClaims,
  listOpenContradictions,
} from '../governance/truthEvidenceLedgerService.js';
import { listDecisions } from '../governance/decisionLedgerService.js';
import { listChamberSessions } from '../governance/truthChamberService.js';
import { truthChamberOutputSchema } from '../../types/longitudinal.js';
import { formatLegacyArtifactsForPrompt } from '../governance/legacyArtifactService.js';
import { formatDistortionObservationsForPrompt } from '../governance/distortionObservationService.js';
import type { SovereignResponseMode } from './sovereigntyResponseRouter.js';
import { sovereignModeDirective } from './sovereigntyResponseRouter.js';

function buildLegacyTruthLedgerBlock(userId: string, limit = 20): string {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT statement, status, confidence FROM truth_entries
       WHERE user_id = ? AND status != 'superseded'
       ORDER BY updated_at DESC LIMIT ?`
    )
    .all(userId, limit) as { statement: string; status: string; confidence: number }[];
  if (rows.length === 0) return '(no legacy truth_entries on file)';
  return rows
    .map((t) => `- [${t.status} conf=${t.confidence.toFixed(2)}] ${t.statement}`)
    .join('\n');
}

function buildLegacyDoctrineBlock(userId: string, limit = 24): string {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT layer, title, body, priority FROM doctrine_nodes
       WHERE user_id = ?
       ORDER BY priority DESC, updated_at DESC
       LIMIT ?`
    )
    .all(userId, limit) as { layer: string; title: string; body: string; priority: number }[];
  if (rows.length === 0) return '(no legacy doctrine_nodes on file)';
  return rows
    .map(
      (r) =>
        `### [${r.layer}] ${r.title} (priority ${r.priority})\n${r.body.slice(0, 2000)}${r.body.length > 2000 ? '…' : ''}`
    )
    .join('\n\n');
}

/**
 * Epistemic ledger (claims) + legacy truth_entries — structured first, legacy appended.
 */
export function buildTruthLedgerBlock(userId: string, limit = 20): string {
  try {
    const parts: string[] = [];
    if (listActiveClaims(userId, 1).length > 0) {
      parts.push('--- EPISTEMIC_CLAIMS (structured) ---\n' + formatTruthLedgerForPrompt(userId, limit));
    }
    parts.push('--- LEGACY_TRUTH_ENTRIES ---\n' + buildLegacyTruthLedgerBlock(userId, limit));
    return parts.join('\n\n');
  } catch {
    return '(truth ledger unavailable)';
  }
}

/**
 * Constitutional Core (versioned clauses) + legacy doctrine_nodes.
 */
export function buildAtlasConstitutionBlock(userId: string, limit = 24): string {
  try {
    const parts: string[] = [];
    if (listActiveConstitutionClauses(userId, 1).length > 0) {
      parts.push('--- CONSTITUTION_CLAUSES (governing layer) ---\n' + formatConstitutionBlockForPrompt(userId, limit));
    }
    parts.push('--- LEGACY_DOCTRINE_NODES ---\n' + buildLegacyDoctrineBlock(userId, limit));
    return parts.join('\n\n');
  } catch {
    return '(constitution / doctrine unavailable)';
  }
}

function clipBlock(s: string, maxChars: number): string {
  if (s.length <= maxChars) return s;
  return `${s.slice(0, maxChars)}\n…(truncated for token budget)`;
}

/** Durable self-authored doctrine (distinct from ephemeral chat). */
export function buildLegacyCodexBlock(userId: string): string {
  try {
    return clipBlock(formatLegacyArtifactsForPrompt(userId, 12), 12_000);
  } catch {
    return '(legacy codex unavailable)';
  }
}

export function buildAdversarialChamberDigestBlock(userId: string): string {
  try {
    const sessions = listChamberSessions(userId, 2) as {
      status: string;
      structured_output_json: string | null;
      created_at: string;
    }[];
    if (sessions.length === 0) return '(no adversarial truth chamber sessions on file)';
    const lines: string[] = [];
    for (const s of sessions) {
      if (!s.structured_output_json) {
        lines.push(`- [${s.status}] session ${s.created_at.slice(0, 16)} — no structured output yet`);
        continue;
      }
      let raw: unknown;
      try {
        raw = JSON.parse(s.structured_output_json);
      } catch {
        lines.push(`- [${s.status}] invalid_json`);
        continue;
      }
      const parsed = truthChamberOutputSchema.safeParse(raw);
      if (!parsed.success) {
        lines.push(`- [${s.status}] parse_error`);
        continue;
      }
      const o = parsed.data;
      lines.push(
        `- Chamber ${s.created_at.slice(0, 16)}: opposing read — ${o.strongest_opposing_interpretation.slice(0, 320)}${o.strongest_opposing_interpretation.length > 320 ? '…' : ''}`
      );
      if (o.pressure_points.length) {
        lines.push(`  Pressure: ${o.pressure_points.slice(0, 3).join(' | ')}`);
      }
    }
    return lines.join('\n');
  } catch {
    return '(chamber digest unavailable)';
  }
}

export function buildDecisionLedgerSnippetBlock(userId: string): string {
  try {
    const rows = listDecisions(userId, 8);
    if (rows.length === 0) return '(no decision_ledger rows)';
    return rows
      .map((d) => `- [${d.status}] ${d.statement.slice(0, 220)}${d.statement.length > 220 ? '…' : ''}`)
      .join('\n');
  } catch {
    return '(decision ledger unavailable)';
  }
}

export function buildOpenContradictionsBlock(userId: string): string {
  try {
    const rows = listOpenContradictions(userId) as { id: string; claim_a_id: string; claim_b_id: string }[];
    if (rows.length === 0) return '(no open claim_contradictions)';
    return rows
      .slice(0, 12)
      .map((r) => `- open contradiction id=${r.id} claims ${r.claim_a_id} vs ${r.claim_b_id}`)
      .join('\n');
  } catch {
    return '(contradictions unavailable)';
  }
}

/**
 * Pre-consequence simulations, relational graph substrate, identity operationalization, cognition refinement.
 */
export function buildStrategicModelingBlock(userId: string): string {
  try {
    const parts: string[] = [];
    parts.push('### SIMULATION_FORGE (recent consequence-preview runs)\n' + formatSimulationForgeForPrompt(userId, 2));
    parts.push('### ATLAS_REALITY_GRAPH (structural summary)\n' + summarizeAtlasGraphForPrompt(userId, 36));
    parts.push('### IDENTITY_TO_ACTION (active goals → protocols)\n' + formatIdentityBridgeForPrompt(userId, 5));
    parts.push('### RECURSIVE_SELF_REVISION (open improvement pathways)\n' + formatSelfRevisionForPrompt(userId, 6));
    return parts.join('\n\n');
  } catch {
    return '(strategic modeling context unavailable)';
  }
}

export function buildLongitudinalContextBlock(userId: string): string {
  try {
    const parts: string[] = [];
    parts.push('### EVOLUTION_TIMELINE (3/6/12 month structured summaries)\n' + formatEvolutionSummaryForPrompt(userId));
    parts.push('### COGNITIVE_TWIN (analytic traits)\n' + formatCognitiveTwinForPrompt(userId));
    if (listOpenUnfinishedRanked(userId, 1).length > 0) {
      parts.push('### UNFINISHED_BUSINESS (ranked open loops)\n' + formatUnfinishedBusinessForPrompt(userId, 10));
    } else {
      parts.push('### UNFINISHED_BUSINESS\n(no open items recorded)');
    }
    return parts.join('\n\n');
  } catch {
    return '(longitudinal context unavailable)';
  }
}

export function buildConstitutionalVerificationBundle(userId: string): {
  truthLedger: string;
  atlasConstitution: string;
  longitudinalContext: string;
  strategicModelingContext: string;
  legacyCodex: string;
  adversarialDigest: string;
} {
  return {
    truthLedger: buildTruthLedgerBlock(userId),
    atlasConstitution: buildAtlasConstitutionBlock(userId),
    longitudinalContext: buildLongitudinalContextBlock(userId),
    strategicModelingContext: buildStrategicModelingBlock(userId),
    legacyCodex: buildLegacyCodexBlock(userId),
    adversarialDigest: buildAdversarialChamberDigestBlock(userId),
  };
}

/**
 * Structured governance substrate injected into standard chat (not a chat transcript).
 */
export function buildSovereignChatContextPack(userId: string, mode: SovereignResponseMode): string {
  const parts: string[] = [];
  parts.push('=== SOVEREIGN_RESPONSE_CONTRACT ===');
  parts.push(sovereignModeDirective(mode));
  parts.push('');
  parts.push('=== ATLAS_CONSTITUTION_AND_LEGACY_DOCTRINE ===');
  parts.push(clipBlock(buildAtlasConstitutionBlock(userId), 10_000));
  parts.push('');
  parts.push('=== TRUTH_AND_EVIDENCE_LEDGER ===');
  parts.push(clipBlock(buildTruthLedgerBlock(userId), 8000));
  parts.push('');
  parts.push('=== LEGACY_CODEX (durable artifacts) ===');
  parts.push(clipBlock(buildLegacyCodexBlock(userId), 6000));
  parts.push('');
  parts.push('=== DECISION_LEDGER_SNIPPET ===');
  parts.push(clipBlock(buildDecisionLedgerSnippetBlock(userId), 3000));
  parts.push('');
  parts.push('=== ADVERSARIAL_CHAMBER_DIGEST ===');
  parts.push(clipBlock(buildAdversarialChamberDigestBlock(userId), 3500));
  parts.push('');
  parts.push('=== OPEN_CONTRADICTIONS ===');
  parts.push(buildOpenContradictionsBlock(userId));

  if (
    mode === 'decision_support' ||
    mode === 'future_simulation' ||
    mode === 'unfinished_surface' ||
    mode === 'truth_pressure'
  ) {
    parts.push('');
    parts.push('=== LONGITUDINAL_AND_OPEN_LOOPS ===');
    parts.push(clipBlock(buildLongitudinalContextBlock(userId), 8000));
  }

  if (mode === 'future_simulation' || mode === 'decision_support' || mode === 'truth_pressure') {
    parts.push('');
    parts.push('=== STRATEGIC_MODELING ===');
    parts.push(clipBlock(buildStrategicModelingBlock(userId), 7000));
  }

  if (mode === 'truth_pressure' || mode === 'self_revision' || mode === 'identity_operationalization') {
    parts.push('');
    parts.push('=== DISTORTION_OBSERVATIONS ===');
    parts.push(clipBlock(formatDistortionObservationsForPrompt(userId, 8), 3000));
  }

  if (mode === 'identity_operationalization') {
    parts.push('');
    parts.push('=== IDENTITY_PROTOCOLS ===');
    parts.push(clipBlock(formatIdentityBridgeForPrompt(userId, 8), 4000));
  }

  if (mode === 'legacy_extraction') {
    parts.push('');
    parts.push('=== EVOLUTION_TIMELINE ===');
    parts.push(clipBlock(formatEvolutionSummaryForPrompt(userId), 5000));
  }

  if (mode === 'self_revision') {
    parts.push('');
    parts.push('=== SELF_REVISION_OPEN ===');
    parts.push(clipBlock(formatSelfRevisionForPrompt(userId, 10), 4000));
  }

  return parts.join('\n');
}
