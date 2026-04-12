import { getDb } from '../../db/sqlite.js';

/**
 * Compact cross-system snapshot for sovereign UI / status strips — not a chat log.
 */
export function getSovereignOverview(userId: string) {
  const db = getDb();

  const constitutionActive = (
    db.prepare(`SELECT COUNT(1) as c FROM constitution_clauses WHERE user_id = ? AND archived_at IS NULL`).get(userId) as {
      c: number;
    }
  ).c;

  const claimsActive = (
    db.prepare(`SELECT COUNT(1) as c FROM epistemic_claims WHERE user_id = ? AND superseded_by_id IS NULL`).get(userId) as {
      c: number;
    }
  ).c;

  const evidenceCount = (
    db.prepare(`SELECT COUNT(1) as c FROM epistemic_evidence WHERE user_id = ?`).get(userId) as { c: number }
  ).c;

  const openContradictions = (
    db
      .prepare(`SELECT COUNT(1) as c FROM claim_contradictions WHERE user_id = ? AND status = 'open'`)
      .get(userId) as { c: number }
  ).c;

  const decisionsTotal = (
    db.prepare(`SELECT COUNT(1) as c FROM decision_ledger WHERE user_id = ?`).get(userId) as { c: number }
  ).c;

  const decisionsDraft = (
    db.prepare(`SELECT COUNT(1) as c FROM decision_ledger WHERE user_id = ? AND status = 'draft'`).get(userId) as {
      c: number;
    }
  ).c;

  const evolutionEvents = (
    db.prepare(`SELECT COUNT(1) as c FROM evolution_timeline_events WHERE user_id = ?`).get(userId) as { c: number }
  ).c;

  const twinTraits = (
    db
      .prepare(`SELECT COUNT(1) as c FROM cognitive_twin_traits WHERE user_id = ? AND archived_at IS NULL`)
      .get(userId) as { c: number }
  ).c;

  const chamberSessions = (
    db.prepare(`SELECT COUNT(1) as c FROM adversarial_chamber_sessions WHERE user_id = ?`).get(userId) as { c: number }
  ).c;

  const unfinishedOpen = (
    db
      .prepare(`SELECT COUNT(1) as c FROM unfinished_business_items WHERE user_id = ? AND status = 'open'`)
      .get(userId) as { c: number }
  ).c;

  const forges = (
    db.prepare(`SELECT COUNT(1) as c FROM simulation_forges WHERE user_id = ?`).get(userId) as { c: number }
  ).c;

  const graphNodes = (
    db.prepare(`SELECT COUNT(1) as c FROM atlas_rg_nodes WHERE user_id = ?`).get(userId) as { c: number }
  ).c;

  const graphEdges = (
    db.prepare(`SELECT COUNT(1) as c FROM atlas_rg_edges WHERE user_id = ?`).get(userId) as { c: number }
  ).c;

  const identityGoals = (
    db.prepare(`SELECT COUNT(1) as c FROM identity_goals WHERE user_id = ? AND status = 'active'`).get(userId) as {
      c: number;
    }
  ).c;

  const selfRevisionOpen = (
    db
      .prepare(`SELECT COUNT(1) as c FROM self_revision_records WHERE user_id = ? AND status = 'open'`)
      .get(userId) as { c: number }
  ).c;

  const legacyActive = (
    db
      .prepare(
        `SELECT COUNT(1) as c FROM legacy_artifacts WHERE user_id = ? AND status = 'active' AND archived_at IS NULL`
      )
      .get(userId) as { c: number }
  ).c;

  const distortions = (
    db
      .prepare(`SELECT COUNT(1) as c FROM cognitive_distortion_observations WHERE user_id = ? AND archived_at IS NULL`)
      .get(userId) as { c: number }
  ).c;

  const traces = (
    db.prepare(`SELECT COUNT(1) as c FROM traces WHERE user_id = ?`).get(userId) as { c: number }
  ).c;

  let sovereignConsoleGapsOpen = 0;
  let sovereignConsoleChangesPending = 0;
  let sovereignConsoleAuditEvents = 0;
  try {
    sovereignConsoleGapsOpen = (
      db
        .prepare(
          `SELECT COUNT(1) as c FROM governance_gaps WHERE user_id = ? AND status NOT IN ('repaired', 'failed_repair')`
        )
        .get(userId) as { c: number }
    ).c;
    sovereignConsoleChangesPending = (
      db
        .prepare(
          `SELECT COUNT(1) as c FROM governance_changes WHERE user_id = ? AND status IN ('proposed', 'pending', 'approved', 'testing')`
        )
        .get(userId) as { c: number }
    ).c;
    sovereignConsoleAuditEvents = (
      db.prepare(`SELECT COUNT(1) as c FROM governance_audit_logs WHERE user_id = ?`).get(userId) as { c: number }
    ).c;
  } catch {
    /* governance console tables not present on legacy DB */
  }

  return {
    userId,
    constitutionalClausesActive: constitutionActive,
    epistemicClaimsActive: claimsActive,
    evidenceItems: evidenceCount,
    openContradictions,
    decisionsTotal,
    decisionsDraft,
    evolutionEventsRecorded: evolutionEvents,
    cognitiveTwinTraitsActive: twinTraits,
    adversarialChamberSessions: chamberSessions,
    unfinishedBusinessOpen: unfinishedOpen,
    simulationForges: forges,
    realityGraphNodes: graphNodes,
    realityGraphEdges: graphEdges,
    identityGoalsActive: identityGoals,
    selfRevisionOpen,
    legacyArtifactsActive: legacyActive,
    distortionObservationsActive: distortions,
    /** Raw dialogue turns stored separately from structured cognition. */
    chatTracesStored: traces,
    /** Sovereign Console tabs (SQLite governance_*), when tables exist. */
    sovereignConsoleGapsOpen,
    sovereignConsoleChangesPending,
    sovereignConsoleAuditEvents,
  };
}
