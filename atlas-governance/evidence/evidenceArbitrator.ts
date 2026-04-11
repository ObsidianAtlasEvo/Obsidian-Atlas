/**
 * Atlas Evidence Arbitrator
 * Phase 2 Governance
 *
 * Tracks claim provenance, distinguishes inference from evidence,
 * resolves contradictions between sources, and decays stale information.
 */

export type ClaimType = 'evidence' | 'inference' | 'speculation' | 'user_stated' | 'model_output';
export type ClaimStatus = 'active' | 'contradicted' | 'superseded' | 'expired' | 'retracted';

export interface Claim {
  id: string;
  userId: string;
  content: string;
  type: ClaimType;
  source: string;
  sourceModel?: string; // which LLM generated it, if model_output
  confidence: number; // 0–1
  status: ClaimStatus;
  createdAt: string;
  expiresAt?: string; // optional TTL
  contradicts?: string[]; // IDs of claims this supersedes
  supportedBy?: string[]; // IDs of claims that support this
  uncertaintyDisclosed: boolean;
}

export interface ContradictionReport {
  claimA: string;
  claimB: string;
  resolution: 'keep_newer' | 'keep_higher_confidence' | 'keep_evidence_over_inference' | 'manual';
  resolvedAt: string;
  winner: string; // claim ID
}

const claimStore: Map<string, Claim[]> = new Map();
const contradictionLog: ContradictionReport[] = [];

// Default TTL by claim type (ms)
const DEFAULT_TTL: Record<ClaimType, number | null> = {
  evidence: null, // evidence doesn't expire automatically
  inference: 1000 * 60 * 60 * 24 * 30, // 30 days
  speculation: 1000 * 60 * 60 * 24 * 7, // 7 days
  user_stated: null,
  model_output: 1000 * 60 * 60 * 24 * 14, // 14 days
};

function uid(): string {
  return `clm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getUserClaims(userId: string): Claim[] {
  if (!claimStore.has(userId)) claimStore.set(userId, []);
  return claimStore.get(userId)!;
}

/**
 * Register a new claim and check for contradictions with active claims.
 */
export function registerClaim(
  userId: string,
  content: string,
  type: ClaimType,
  source: string,
  confidence: number,
  options: {
    sourceModel?: string;
    supportedBy?: string[];
    uncertaintyDisclosed?: boolean;
    ttlOverrideMs?: number;
  } = {}
): Claim {
  const defaultTtl = DEFAULT_TTL[type];
  const ttl = options.ttlOverrideMs ?? defaultTtl;

  const claim: Claim = {
    id: uid(),
    userId,
    content,
    type,
    source,
    sourceModel: options.sourceModel,
    confidence: Math.min(1, Math.max(0, confidence)),
    status: 'active',
    createdAt: new Date().toISOString(),
    expiresAt: ttl ? new Date(Date.now() + ttl).toISOString() : undefined,
    supportedBy: options.supportedBy,
    uncertaintyDisclosed: options.uncertaintyDisclosed ?? (confidence < 0.7),
  };

  const existing = getUserClaims(userId);

  // Contradiction detection via content similarity (simplified — production should use embeddings)
  const potentialContradictions = existing.filter(
    (c) =>
      c.status === 'active' &&
      c.content.toLowerCase().split(' ').filter((w) => w.length > 4).some(
        (word) => claim.content.toLowerCase().includes(word)
      ) &&
      c.id !== claim.id
  );

  if (potentialContradictions.length > 0) {
    claim.contradicts = [];
    for (const prior of potentialContradictions) {
      const resolution = resolveContradiction(claim, prior);
      claim.contradicts.push(prior.id);
      contradictionLog.push(resolution);
    }
  }

  existing.push(claim);
  return claim;
}

function resolveContradiction(incoming: Claim, existing: Claim): ContradictionReport {
  let resolution: ContradictionReport['resolution'];
  let winner: string;

  // Evidence beats inference beats speculation
  const typeRank: Record<ClaimType, number> = {
    evidence: 4,
    user_stated: 3,
    model_output: 2,
    inference: 1,
    speculation: 0,
  };

  if (typeRank[incoming.type] > typeRank[existing.type]) {
    resolution = 'keep_evidence_over_inference';
    winner = incoming.id;
    existing.status = 'contradicted';
  } else if (typeRank[existing.type] > typeRank[incoming.type]) {
    resolution = 'keep_evidence_over_inference';
    winner = existing.id;
    incoming.status = 'contradicted';
  } else if (incoming.confidence > existing.confidence) {
    resolution = 'keep_higher_confidence';
    winner = incoming.id;
    existing.status = 'superseded';
  } else if (incoming.confidence < existing.confidence) {
    resolution = 'keep_higher_confidence';
    winner = existing.id;
    incoming.status = 'contradicted';
  } else {
    // Same type and confidence — keep newer
    resolution = 'keep_newer';
    winner = incoming.id;
    existing.status = 'superseded';
  }

  return {
    claimA: incoming.id,
    claimB: existing.id,
    resolution,
    resolvedAt: new Date().toISOString(),
    winner,
  };
}

/**
 * Expire claims past their TTL.
 */
export function expireStaleClams(userId: string): number {
  const claims = getUserClaims(userId);
  const now = new Date().toISOString();
  let expiredCount = 0;
  for (const claim of claims) {
    if (claim.status === 'active' && claim.expiresAt && claim.expiresAt < now) {
      claim.status = 'expired';
      expiredCount++;
    }
  }
  return expiredCount;
}

export function getActiveClaims(userId: string): Claim[] {
  return getUserClaims(userId).filter((c) => c.status === 'active');
}

export function getContradictionLog(): ContradictionReport[] {
  return [...contradictionLog];
}

/**
 * Generate an uncertainty-aware context string for injection into Atlas.
 */
export function buildEvidenceContext(userId: string): string {
  const active = getActiveClaims(userId);
  if (active.length === 0) return '';

  const highConf = active.filter((c) => c.confidence >= 0.75 && c.type !== 'speculation');
  const uncertain = active.filter((c) => c.confidence < 0.75 || c.type === 'speculation');

  const parts: string[] = [];
  if (highConf.length > 0) {
    parts.push(`Established: ${highConf.map((c) => c.content).join('; ')}`);
  }
  if (uncertain.length > 0) {
    parts.push(`Uncertain (disclose): ${uncertain.map((c) => `${c.content} [~${Math.round(c.confidence * 100)}%]`).join('; ')}`);
  }
  return parts.join('\n');
}
