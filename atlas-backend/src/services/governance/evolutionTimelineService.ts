import { createHash, randomUUID } from 'node:crypto';
import { getDb } from '../../db/sqlite.js';
import type { EvolutionEventType } from '../../types/longitudinal.js';
import { evolutionEventTypeSchema } from '../../types/longitudinal.js';
import { recordGovernanceAudit } from './governanceAudit.js';

export function computePatternFingerprint(text: string): string {
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
  return createHash('sha256').update(normalized).digest('hex').slice(0, 32);
}

function nowIso(): string {
  return new Date().toISOString();
}

export interface RecordEvolutionEventInput {
  userId: string;
  eventType: EvolutionEventType;
  title: string;
  body: string;
  significance?: number;
  evidenceRefs?: unknown[];
  patternFingerprint?: string | null;
  userDeclared?: boolean;
  narratedSelfImageRisk?: number | null;
  genuineImprovementScore?: number | null;
  relatedDomain?: string | null;
}

export function recordEvolutionEvent(input: RecordEvolutionEventInput): string {
  evolutionEventTypeSchema.parse(input.eventType);
  const db = getDb();
  const id = randomUUID();
  const ts = nowIso();
  const fp = input.patternFingerprint ?? computePatternFingerprint(`${input.title}\n${input.body}`);
  db.prepare(
    `INSERT INTO evolution_timeline_events (
      id, user_id, event_type, title, body, significance, evidence_refs_json, pattern_fingerprint,
      user_declared, narrated_self_image_risk, genuine_improvement_score, related_domain, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.userId,
    input.eventType,
    input.title.trim(),
    input.body.trim(),
    Math.max(0, Math.min(1, input.significance ?? 0.5)),
    JSON.stringify(input.evidenceRefs ?? []),
    fp,
    input.userDeclared ? 1 : 0,
    input.narratedSelfImageRisk ?? null,
    input.genuineImprovementScore ?? null,
    input.relatedDomain?.trim() || null,
    ts
  );
  recordGovernanceAudit({
    userId: input.userId,
    action: 'evolution_event_create',
    entityType: 'evolution_timeline_event',
    entityId: id,
    payload: { eventType: input.eventType },
  });
  return id;
}

export function linkEvolutionToEntity(
  evolutionEventId: string,
  entityType: string,
  entityId: string,
  linkRole = 'context'
): void {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO evolution_entity_links (id, evolution_event_id, entity_type, entity_id, link_role, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, evolutionEventId, entityType, entityId, linkRole, nowIso());
}

export function listEvolutionEventsSince(userId: string, sinceIso: string, limit = 500): unknown[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM evolution_timeline_events
       WHERE user_id = ? AND created_at >= ?
       ORDER BY created_at ASC
       LIMIT ?`
    )
    .all(userId, sinceIso, limit);
}

function windowStartMonthsAgo(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString();
}

export interface DevelopmentalWindowSummary {
  months: 3 | 6 | 12;
  since: string;
  eventCount: number;
  byType: Record<string, number>;
  avgGenuineImprovement: number | null;
  avgNarratedRisk: number | null;
  userDeclaredRatio: number;
  topFingerprints: { fingerprint: string; count: number }[];
  narrative: string;
}

/**
 * Aggregates evolution events for 3 / 6 / 12 month windows — not chat replay.
 */
export function summarizeDevelopmentalWindows(userId: string): { windows: DevelopmentalWindowSummary[] } {
  const db = getDb();
  const windows: DevelopmentalWindowSummary[] = [];

  for (const months of [3, 6, 12] as const) {
    const since = windowStartMonthsAgo(months);
    const rows = db
      .prepare(
        `SELECT event_type, pattern_fingerprint, user_declared, genuine_improvement_score, narrated_self_image_risk
         FROM evolution_timeline_events WHERE user_id = ? AND created_at >= ?`
      )
      .all(userId, since) as {
      event_type: string;
      pattern_fingerprint: string | null;
      user_declared: number;
      genuine_improvement_score: number | null;
      narrated_self_image_risk: number | null;
    }[];

    const byType: Record<string, number> = {};
    let sumG = 0,
      nG = 0,
      sumN = 0,
      nN = 0,
      declared = 0;
    const fpCount = new Map<string, number>();

    for (const r of rows) {
      byType[r.event_type] = (byType[r.event_type] ?? 0) + 1;
      if (r.user_declared) declared++;
      if (r.genuine_improvement_score != null) {
        sumG += r.genuine_improvement_score;
        nG++;
      }
      if (r.narrated_self_image_risk != null) {
        sumN += r.narrated_self_image_risk;
        nN++;
      }
      if (r.pattern_fingerprint) {
        fpCount.set(r.pattern_fingerprint, (fpCount.get(r.pattern_fingerprint) ?? 0) + 1);
      }
    }

    const topFingerprints = [...fpCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([fingerprint, count]) => ({ fingerprint, count }));

    const avgGenuineImprovement = nG > 0 ? sumG / nG : null;
    const avgNarratedRisk = nN > 0 ? sumN / nN : null;
    const userDeclaredRatio = rows.length > 0 ? declared / rows.length : 0;

    const parts: string[] = [];
    parts.push(`Window: last ${months} months (${rows.length} structured evolution events).`);
    if (rows.length === 0) {
      parts.push('No evolution events recorded in this window — not inferable from chat alone.');
    } else {
      const strongTypes = Object.entries(byType)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([k, v]) => `${k}:${v}`)
        .join(', ');
      parts.push(`Event mix: ${strongTypes}.`);
      if (avgGenuineImprovement != null && avgNarratedRisk != null) {
        if (avgGenuineImprovement > avgNarratedRisk + 0.15) {
          parts.push('Signals suggest more recorded genuine improvement than high narrated-self-image risk.');
        } else if (avgNarratedRisk > avgGenuineImprovement + 0.15) {
          parts.push('Signals suggest narrated self-image / growth claims may dominate recorded improvement scores — treat with epistemic caution.');
        } else {
          parts.push('Recorded improvement vs narrated-risk signals are mixed — avoid flattening into a single story.');
        }
      }
      if (topFingerprints.some((t) => t.count >= 2)) {
        parts.push(
          `Recurring thematic fingerprints (possible same pattern under different titles): ${topFingerprints
            .filter((t) => t.count >= 2)
            .map((t) => `${t.fingerprint.slice(0, 8)}…×${t.count}`)
            .join('; ')}.`
        );
      }
      parts.push(`User-declared share of events: ${(userDeclaredRatio * 100).toFixed(0)}%.`);
    }

    windows.push({
      months,
      since,
      eventCount: rows.length,
      byType,
      avgGenuineImprovement,
      avgNarratedRisk,
      userDeclaredRatio,
      topFingerprints,
      narrative: parts.join(' '),
    });
  }

  return { windows };
}

export function formatEvolutionSummaryForPrompt(userId: string): string {
  const { windows } = summarizeDevelopmentalWindows(userId);
  return windows.map((w) => `--- ${w.months}M ---\n${w.narrative}`).join('\n\n');
}
