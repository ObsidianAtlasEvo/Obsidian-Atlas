import { randomUUID } from 'node:crypto';
import { getDb } from '../../db/sqlite.js';
import type { TwinDomain, TwinSource } from '../../types/longitudinal.js';
import { twinDomainSchema, twinSourceSchema } from '../../types/longitudinal.js';
import { recordGovernanceAudit } from './governanceAudit.js';

function nowIso(): string {
  return new Date().toISOString();
}

function stableVersionGroupId(userId: string, domain: string, traitKey: string): string {
  return `twin:${userId}:${domain}:${traitKey}`.replace(/\s+/g, '_').slice(0, 200);
}

export interface TwinTraitRow {
  id: string;
  user_id: string;
  domain: string;
  trait_key: string;
  value: string;
  source: string;
  confidence: number;
  version_group_id: string;
  version: number;
  supersedes_trait_id: string | null;
  created_at: string;
  archived_at: string | null;
}

/**
 * Set or revise a trait: archives prior active row in the same version_group, inserts new version.
 */
export function setTwinTrait(input: {
  userId: string;
  domain: TwinDomain;
  traitKey: string;
  value: string;
  source: TwinSource;
  confidence: number;
}): TwinTraitRow {
  twinDomainSchema.parse(input.domain);
  twinSourceSchema.parse(input.source);
  const db = getDb();
  const versionGroupId = stableVersionGroupId(input.userId, input.domain, input.traitKey);
  const ts = nowIso();

  const prior = db
    .prepare(
      `SELECT id, version FROM cognitive_twin_traits
       WHERE user_id = ? AND version_group_id = ? AND archived_at IS NULL
       ORDER BY version DESC LIMIT 1`
    )
    .get(input.userId, versionGroupId) as { id: string; version: number } | undefined;

  const nextVersion = prior ? prior.version + 1 : 1;
  if (prior) {
    db.prepare(`UPDATE cognitive_twin_traits SET archived_at = ? WHERE id = ?`).run(ts, prior.id);
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO cognitive_twin_traits (
      id, user_id, domain, trait_key, value, source, confidence, version_group_id, version,
      supersedes_trait_id, created_at, archived_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
  ).run(
    id,
    input.userId,
    input.domain,
    input.traitKey.trim().slice(0, 200),
    input.value.trim().slice(0, 20_000),
    input.source,
    Math.max(0, Math.min(1, input.confidence)),
    versionGroupId,
    nextVersion,
    prior?.id ?? null,
    ts
  );

  recordGovernanceAudit({
    userId: input.userId,
    action: 'cognitive_twin_trait_set',
    entityType: 'cognitive_twin_trait',
    entityId: id,
    payload: { domain: input.domain, traitKey: input.traitKey, version: nextVersion },
  });

  return db.prepare(`SELECT * FROM cognitive_twin_traits WHERE id = ?`).get(id) as TwinTraitRow;
}

export function listActiveTwinTraits(userId: string): TwinTraitRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM cognitive_twin_traits
       WHERE user_id = ? AND archived_at IS NULL
       ORDER BY domain ASC, trait_key ASC`
    )
    .all(userId) as TwinTraitRow[];
}

export function getTwinTraitHistory(userId: string, versionGroupId: string): TwinTraitRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM cognitive_twin_traits
       WHERE user_id = ? AND version_group_id = ?
       ORDER BY version ASC`
    )
    .all(userId, versionGroupId) as TwinTraitRow[];
}

/** Compare latest vs previous version in a group (structural delta for calibration). */
export function compareTwinTraitToPrior(userId: string, versionGroupId: string): {
  prior: TwinTraitRow | null;
  current: TwinTraitRow | null;
  summary: string;
} {
  const hist = getTwinTraitHistory(userId, versionGroupId);
  if (hist.length === 0) {
    return { prior: null, current: null, summary: '(no trait history for this group)' };
  }
  const current = hist[hist.length - 1]!;
  const prior = hist.length > 1 ? hist[hist.length - 2]! : null;
  if (!prior) {
    return { prior: null, current, summary: 'First version — no prior twin state to compare.' };
  }
  const confDelta = current.confidence - prior.confidence;
  return {
    prior,
    current,
    summary: `Trait "${current.trait_key}" (${current.domain}): prior confidence ${prior.confidence.toFixed(2)} → ${current.confidence.toFixed(2)} (Δ ${confDelta >= 0 ? '+' : ''}${confDelta.toFixed(2)}). Source shifted ${prior.source} → ${current.source}. Revise framing if inference confidence dropped.`,
  };
}

export function formatCognitiveTwinForPrompt(userId: string): string {
  const traits = listActiveTwinTraits(userId);
  if (traits.length === 0) {
    return '(no cognitive_twin_traits on file — do not simulate a detailed psychological model)';
  }
  return traits
    .map(
      (t) =>
        `- [${t.domain}/${t.trait_key}] source=${t.source} conf=${t.confidence.toFixed(2)} v${t.version}\n  ${t.value.slice(0, 1200)}${t.value.length > 1200 ? '…' : ''}`
    )
    .join('\n');
}
