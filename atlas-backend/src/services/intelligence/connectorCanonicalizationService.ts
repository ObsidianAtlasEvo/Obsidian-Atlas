/**
 * connectorCanonicalizationService.ts — Phase 0.986 PURE canonicalization.
 *
 * No async, no Supabase. Given raw records from a connector and its schema,
 * returns canonicalized `{ entity_type, canonical_id, fields, source_connector_id, confidence }`
 * entries. Duplicates across connectors are merged by trust-score priority.
 */

export interface ConnectorFieldMapping {
  /** Raw field name in the connector payload. */
  source: string;
  /** Canonical field name in Atlas. */
  target: string;
}

export interface ConnectorSchema {
  connector_id: string;
  /** Canonical Atlas entity type this connector produces. */
  entity_type: string;
  /** Name of the raw field that uniquely identifies the record in the source system. */
  external_id_field: string;
  /** Field mappings from source -> target. */
  mappings: ConnectorFieldMapping[];
  /** Numeric trust score (0–1) used to break ties when merging duplicates. */
  trust_score: number;
}

export interface CanonicalEntity {
  entity_type: string;
  canonical_id: string;
  fields: Record<string, unknown>;
  source_connector_id: string;
  confidence: number;
  external_id: string;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function applyMapping(
  raw: Record<string, unknown>,
  mappings: ConnectorFieldMapping[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const m of mappings) {
    if (m.source in raw) out[m.target] = raw[m.source];
  }
  return out;
}

/** Pure: canonicalize a single connector's payload. Dedupes on external_id. */
export function canonicalizeEntities(
  raw: unknown[],
  schema: ConnectorSchema,
): CanonicalEntity[] {
  const seen = new Map<string, CanonicalEntity>();
  for (const item of raw) {
    const record = toRecord(item);
    if (!record) continue;
    const externalId = record[schema.external_id_field];
    if (typeof externalId !== 'string' || externalId.length === 0) continue;
    const fields = applyMapping(record, schema.mappings);
    const entity: CanonicalEntity = {
      entity_type: schema.entity_type,
      canonical_id: `${schema.connector_id}:${externalId}`,
      external_id: externalId,
      fields,
      source_connector_id: schema.connector_id,
      confidence: Math.max(0, Math.min(1, schema.trust_score)),
    };
    // Same external_id in same payload => keep first; discard later duplicates.
    if (!seen.has(entity.canonical_id)) seen.set(entity.canonical_id, entity);
  }
  return Array.from(seen.values());
}

/**
 * Pure: merge canonicalized entities from multiple connectors.
 * Overlapping entities (same external_id across different connectors) are merged
 * with field-level priority: higher trust_score wins per field. The resulting
 * entity keeps the canonical_id of the highest-trust source and records all
 * contributing sources in metadata.
 */
export function mergeCrossSourceEntities(
  perConnector: CanonicalEntity[][],
): CanonicalEntity[] {
  const grouped = new Map<string, CanonicalEntity[]>();
  for (const list of perConnector) {
    for (const ent of list) {
      const key = `${ent.entity_type}::${ent.external_id}`;
      const bucket = grouped.get(key) ?? [];
      bucket.push(ent);
      grouped.set(key, bucket);
    }
  }

  const merged: CanonicalEntity[] = [];
  for (const group of grouped.values()) {
    if (group.length === 1 && group[0]) {
      merged.push(group[0]);
      continue;
    }
    // Sort descending by confidence so higher-trust sources win on field conflicts.
    group.sort((a, b) => b.confidence - a.confidence);
    const winner = group[0]!;
    const fields: Record<string, unknown> = {};
    for (const ent of [...group].reverse()) {
      for (const [k, v] of Object.entries(ent.fields)) {
        fields[k] = v;
      }
    }
    // Now layer the top-trust source on top for final conflict resolution.
    for (const [k, v] of Object.entries(winner.fields)) {
      fields[k] = v;
    }
    merged.push({
      entity_type: winner.entity_type,
      canonical_id: winner.canonical_id,
      external_id: winner.external_id,
      fields: {
        ...fields,
        _sources: group.map((g) => ({
          connector_id: g.source_connector_id,
          confidence: g.confidence,
        })),
      },
      source_connector_id: winner.source_connector_id,
      confidence: winner.confidence,
    });
  }
  return merged;
}

/** Pure: compute a stable hash of a canonical payload so delta sync can skip identical fetches. */
export function computePayloadHash(raw: unknown[]): string {
  try {
    const json = JSON.stringify(raw);
    let hash = 0;
    for (let i = 0; i < json.length; i++) {
      hash = (Math.imul(31, hash) + json.charCodeAt(i)) | 0;
    }
    return `h${(hash >>> 0).toString(16)}_${json.length}`;
  } catch {
    return 'h0_0';
  }
}
