import { randomUUID } from 'node:crypto';
import { getDb } from '../../db/sqlite.js';
import type { TrajectoryDomainBand } from '../../types/intelligenceChambers.js';
import { trajectoryHorizonSchema } from '../../types/intelligenceChambers.js';
import { listStructuralTensionEdges } from './atlasRealityGraphService.js';
import { listActiveTwinTraits } from './cognitiveTwinService.js';
import { listDecisions } from './decisionLedgerService.js';
import { assessIdentityBehaviorGap } from './identityActionBridgeService.js';
import { listOpenUnfinishedRanked } from './unfinishedBusinessService.js';
import { recordGovernanceAudit } from './governanceAudit.js';

function nowIso(): string {
  return new Date().toISOString();
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function evolutionTypeHistogram(userId: string, days: number): Record<string, number> {
  const db = getDb();
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const rows = db
    .prepare(
      `SELECT event_type, COUNT(*) as c FROM evolution_timeline_events
       WHERE user_id = ? AND created_at >= ? GROUP BY event_type`
    )
    .all(userId, since) as { event_type: string; c: number }[];
  const out: Record<string, number> = {};
  for (const r of rows) out[r.event_type] = r.c;
  return out;
}

/**
 * Deterministic trajectory synthesis from governance substrate (no LLM).
 * Distinguishes fluctuation vs drift via multi-signal agreement and thresholds.
 */
export function computeTrajectorySnapshot(userId: string, horizon: 'near' | 'medium'): {
  overall_classification: string;
  confidence: number;
  summary_text: string;
  domains: TrajectoryDomainBand[];
  contributing_factors: string[];
  drift_warnings: string[];
  projections: { if_unchanged: string; if_corrected: string };
  correction_leverage: string[];
  explanation_text: string;
  signal_bundle: Record<string, unknown>;
} {
  trajectoryHorizonSchema.parse(horizon);
  const windowDays = horizon === 'near' ? 45 : 120;
  const unfinished = listOpenUnfinishedRanked(userId, 20);
  const decisions = listDecisions(userId, 50);
  const twin = listActiveTwinTraits(userId);
  const tensions = listStructuralTensionEdges(userId, 40);
  const idGap = assessIdentityBehaviorGap(userId);
  const evo = evolutionTypeHistogram(userId, windowDays);

  const draftRatio =
    decisions.length === 0 ? 0 : decisions.filter((d) => d.status === 'draft').length / decisions.length;
  const unfinishedAvg =
    unfinished.length === 0 ? 0 : unfinished.reduce((s, u) => s + u.composite_score, 0) / unfinished.length;
  const twinInf = twin.filter((t) => t.source === 'system_inferred');
  const twinConfAvg =
    twinInf.length === 0 ? 0.6 : twinInf.reduce((s, t) => s + t.confidence, 0) / twinInf.length;
  const improvementN = (evo.developmental_improvement ?? 0) + (evo.goal_completed ?? 0);
  const degradN =
    (evo.recurring_failure_pattern ?? 0) +
    (evo.goal_abandoned ?? 0) +
    (evo.goal_drift ?? 0) +
    (evo.unresolved_internal_conflict ?? 0);

  const domains: TrajectoryDomainBand[] = [];

  const identityMomentum = clamp(
    0.55 -
      idGap.filter((g) => g.behaviorCount < 2).length * 0.12 +
      (idGap.some((g) => g.protocolCount > 0) ? 0.15 : 0),
    -1,
    1
  );
  domains.push({
    domain: 'identity_alignment',
    label: 'Identity alignment',
    classification:
      identityMomentum > 0.25 ? 'improving' : identityMomentum < -0.15 ? 'degrading' : 'stable',
    momentum: identityMomentum,
    markers: idGap.filter((g) => g.behaviorCount < 2).map(() => 'low_behavioral_specificity'),
    explanation:
      idGap.length === 0
        ? 'No active identity goals on file — trajectory here is undefined until goals exist.'
        : `Protocols cover ${idGap.filter((g) => g.protocolCount > 0).length}/${idGap.length} goals; behavioral specificity varies.`,
  });

  const decisionMom = clamp(0.4 - draftRatio * 1.2 + (decisions.some((d) => d.status === 'committed') ? 0.2 : 0), -1, 1);
  domains.push({
    domain: 'decision_quality',
    label: 'Decision quality',
    classification: decisionMom < -0.2 ? 'stagnating' : decisionMom > 0.2 ? 'improving' : 'stable',
    momentum: decisionMom,
    markers: draftRatio > 0.45 ? ['high_draft_backlog'] : [],
    explanation: `Draft share of recent decisions ≈ ${(draftRatio * 100).toFixed(0)}%.`,
  });

  const clarityMom = clamp(twinConfAvg - 0.45 + (twin.length > 8 ? 0.05 : -0.05), -1, 1);
  domains.push({
    domain: 'cognitive_clarity',
    label: 'Cognitive clarity',
    classification: clarityMom < -0.15 ? 'degrading' : clarityMom > 0.2 ? 'improving' : 'stable',
    momentum: clarityMom,
    markers: twinConfAvg < 0.42 ? ['low_confidence_inferred_traits'] : [],
    explanation: `Twin calibration: mean inferred-trait confidence ≈ ${twinConfAvg.toFixed(2)}.`,
  });

  const contraN = getDb()
    .prepare(`SELECT COUNT(1) as c FROM claim_contradictions WHERE user_id = ? AND status = 'open'`)
    .get(userId) as { c: number };
  const standardsMom = clamp(0.35 - Math.min(contraN.c, 8) * 0.08, -1, 1);
  domains.push({
    domain: 'standards_consistency',
    label: 'Standards consistency',
    classification: standardsMom < -0.2 ? 'degrading' : 'stable',
    momentum: standardsMom,
    markers: contraN.c > 0 ? ['open_epistemic_contradictions'] : [],
    explanation: `${contraN.c} open contradiction(s) among registered claims.`,
  });

  const projectMom = clamp(0.15 - unfinishedAvg * 0.35, -1, 1);
  domains.push({
    domain: 'project_momentum',
    label: 'Execution momentum',
    classification: projectMom < -0.25 ? 'degrading' : projectMom > 0.2 ? 'improving' : 'stagnating',
    momentum: projectMom,
    markers: unfinishedAvg > 0.62 ? ['heavy_unfinished_load'] : [],
    explanation: `Open-loop composite pressure (avg) ≈ ${unfinishedAvg.toFixed(2)}.`,
  });

  const stressMarkers = (evo.unresolved_internal_conflict ?? 0) + (evo.cross_domain_tension ?? 0);
  const stressMom = clamp(0.22 - stressMarkers * 0.07, -1, 1);
  domains.push({
    domain: 'emotional_stability_under_pressure',
    label: 'Stability under pressure',
    classification: stressMom < -0.12 ? 'degrading' : stressMom > 0.15 ? 'improving' : 'stable',
    momentum: stressMom,
    markers: stressMarkers > 2 ? ['tension_and_conflict_events_in_window'] : [],
    explanation:
      'Proxy from evolution taxonomy (internal conflict + cross-domain tension counts). Weak prior — no biometric layer.',
  });

  const disciplineMom = clamp(0.45 - unfinishedAvg * 0.4 + (unfinished.some((u) => u.recurrence_score > 0.4) ? -0.2 : 0.1), -1, 1);
  domains.push({
    domain: 'discipline_follow_through',
    label: 'Discipline & follow-through',
    classification: disciplineMom < -0.2 ? 'degrading' : disciplineMom > 0.2 ? 'improving' : 'stagnating',
    momentum: disciplineMom,
    markers: unfinished.some((u) => u.recurrence_score > 0.35) ? ['recurring_open_loops'] : [],
    explanation: 'Recurrence scores on unfinished business indicate loop closure discipline.',
  });

  const stratMom = clamp(0.35 - Math.min(tensions.length, 12) * 0.04, -1, 1);
  domains.push({
    domain: 'strategic_coherence',
    label: 'Strategic coherence',
    classification: stratMom < -0.2 ? 'degrading' : stratMom > 0.15 ? 'improving' : 'stable',
    momentum: stratMom,
    markers: tensions.length > 6 ? ['graph_tension_density'] : [],
    explanation: `${tensions.length} structural tension edge(s) in the reality graph.`,
  });

  const longMom = clamp((improvementN - degradN) * 0.08 + 0.1, -1, 1);
  domains.push({
    domain: 'long_term_aim_alignment',
    label: 'Long-term aim alignment',
    classification:
      longMom > 0.2 ? 'improving' : longMom < -0.15 ? 'degrading' : improvementN > 0 && degradN > 0 ? 'split_signal' : 'stable',
    momentum: longMom,
    markers: degradN > improvementN ? ['negative_evolution_skew'] : [],
    explanation: `Evolution window: improvement-like events ${improvementN}, strain-like events ${degradN}.`,
  });

  const neg = domains.filter((d) => d.momentum < -0.12).length;
  const pos = domains.filter((d) => d.momentum > 0.15).length;
  let overall = 'coherent_hold';
  if (neg >= 5) overall = 'broad_drift';
  else if (pos >= 5 && neg <= 2) overall = 'compounding_coherence';
  else if (pos >= 3 && neg >= 3) overall = 'split_trajectory';
  else if (neg >= 3) overall = 'silent_decline_risk';

  const confidence = clamp(0.45 + (twin.length > 0 ? 0.12 : 0) + (decisions.length > 2 ? 0.1 : 0) + (unfinished.length > 0 ? 0.08 : 0), 0.35, 0.92);

  const contributing_factors: string[] = [];
  if (unfinishedAvg > 0.55) contributing_factors.push('Elevated unfinished-business composite scores');
  if (draftRatio > 0.4) contributing_factors.push('Large share of decisions still in draft');
  if (tensions.length > 5) contributing_factors.push('Dense structural tensions in the graph');
  if (contraN.c > 0) contributing_factors.push('Unresolved epistemic contradictions');
  if (idGap.some((g) => g.behaviorCount < 2 && g.protocolCount > 0)) contributing_factors.push('Identity protocols with thin observable behaviors');

  const drift_warnings: string[] = [];
  if (overall === 'split_trajectory') drift_warnings.push('One subsystem improves while others deteriorate — easy to narrate progress falsely.');
  if (unfinishedAvg > 0.6) drift_warnings.push('High-significance open loops may compound into identity drift.');
  if (twinConfAvg < 0.4) drift_warnings.push('Cognitive twin is under-calibrated; directional read is noisier.');

  const projections = {
    if_unchanged:
      overall === 'broad_drift'
        ? 'If patterns hold, expect mounting loop load, slower commitments, and narrative–structure divergence.'
        : overall === 'compounding_coherence'
          ? 'If patterns hold, standards and execution likely reinforce each other over the next horizon.'
          : 'Mixed signals: some domains stabilize while others require explicit intervention.',
    if_corrected:
      'Closing one high-leverage loop, committing one deferred decision, or tightening one identity protocol often shifts multiple domains together.',
  };

  const correction_leverage: string[] = [];
  const topUnfinished = unfinished[0];
  if (topUnfinished) correction_leverage.push(`Explicitly close or renegotiate: “${topUnfinished.title.slice(0, 80)}…”`);
  if (draftRatio > 0.35) correction_leverage.push('Promote the highest-stakes draft decision to committed or consciously deferred with a rule.');
  if (idGap.find((g) => g.behaviorCount < 2)) correction_leverage.push('Add 2–3 observable behaviors to the weakest identity protocol.');
  if (tensions[0]) correction_leverage.push('Resolve or reframe one graph tension edge to reduce strategic drag.');

  const explanation_text = [
    `Overall: ${overall.replace(/_/g, ' ')} (confidence ${confidence.toFixed(2)}).`,
    `Signals agree most on: ${contributing_factors.slice(0, 3).join('; ') || 'sparse substrate — add more structured artifacts'}.`,
    'This is a directional instrument, not prophecy: it weights durable records over chat tone.',
  ].join(' ');

  const summary_text = `${overall.replace(/_/g, ' ')} · ${pos} strengthening / ${neg} weakening domain signals (horizon ${horizon}).`;

  const signal_bundle = {
    windowDays,
    draftRatio,
    unfinishedAvg,
    twinConfAvg,
    tensionCount: tensions.length,
    openContradictions: contraN.c,
    evolutionHistogram: evo,
  };

  return {
    overall_classification: overall,
    confidence,
    summary_text,
    domains,
    contributing_factors,
    drift_warnings,
    projections,
    correction_leverage,
    explanation_text,
    signal_bundle,
  };
}

export function persistTrajectorySnapshot(userId: string, horizon: 'near' | 'medium'): string {
  const snap = computeTrajectorySnapshot(userId, horizon);
  const db = getDb();
  const id = randomUUID();
  const ts = nowIso();
  db.prepare(
    `INSERT INTO trajectory_observatory_snapshots (
      id, user_id, horizon, overall_classification, confidence, summary_text,
      domains_json, contributing_factors_json, drift_warnings_json, projections_json,
      correction_leverage_json, explanation_text, signal_bundle_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    userId,
    horizon,
    snap.overall_classification,
    snap.confidence,
    snap.summary_text,
    JSON.stringify(snap.domains),
    JSON.stringify(snap.contributing_factors),
    JSON.stringify(snap.drift_warnings),
    JSON.stringify(snap.projections),
    JSON.stringify(snap.correction_leverage),
    snap.explanation_text,
    JSON.stringify(snap.signal_bundle),
    ts
  );
  recordGovernanceAudit({
    userId,
    action: 'trajectory_snapshot_persist',
    entityType: 'trajectory_observatory_snapshot',
    entityId: id,
  });
  return id;
}

export function listTrajectorySnapshots(userId: string, limit = 24) {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, horizon, overall_classification, confidence, summary_text, created_at
       FROM trajectory_observatory_snapshots WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`
    )
    .all(userId, limit) as Record<string, unknown>[];
}

export function getTrajectorySnapshot(userId: string, snapshotId: string) {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM trajectory_observatory_snapshots WHERE id = ? AND user_id = ?`)
    .get(snapshotId, userId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    ...row,
    domains: JSON.parse(String(row.domains_json ?? '[]')),
    contributing_factors: JSON.parse(String(row.contributing_factors_json ?? '[]')),
    drift_warnings: JSON.parse(String(row.drift_warnings_json ?? '[]')),
    projections: JSON.parse(String(row.projections_json ?? '{}')),
    correction_leverage: JSON.parse(String(row.correction_leverage_json ?? '[]')),
    signal_bundle: row.signal_bundle_json ? JSON.parse(String(row.signal_bundle_json)) : null,
  };
}
