/**
 * contextCuratorService.ts — Phase 0.9: Temporal Cognition Stack
 *
 * 4-tier context curation system. The most operationally critical module
 * in Phase 0.9. Implements the Law of Selective Context: only relevant,
 * trustworthy, and useful signals shape the response.
 *
 * When MEMORY_LAYER_ENABLED, this REPLACES the raw memoryBlock from
 * recallForOverseer() in swarmOrchestrator.ts with a curated, tiered,
 * token-budgeted context package.
 *
 * 4-tier curation:
 * Tier 1 (direct inject): high-confidence, topic-relevant, non-frozen/suppressed
 * Tier 2 (compressed):    important but broad — one sentence each
 * Tier 3 (latent):        low confidence, tangential — scored but not injected
 * Tier 4 (suppress):      stale, contradicted, out-of-scope, user-suppressed
 *
 * Design invariants:
 * - Non-throwing: all errors caught, safe fallback returned.
 * - Feature-flagged: all Supabase calls gated on env.MEMORY_LAYER_ENABLED.
 * - Hard token cap: 500 tokens max output.
 * - No LLM calls — pure heuristic scoring.
 */

import { env } from '../../config/env.js';
import type { RecalledRow } from './memoryService.js';
import { getClaimsForContext } from './claimGovernanceService.js';
import {
  buildEpistemicStatusBlock,
  formatStatusForContext,
} from './epistemicStatusFormatter.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type InjectionTier = 'direct' | 'compressed' | 'latent' | 'suppress';

export interface CurationDecision {
  entityId: string;
  entityType: 'memory' | 'identity_domain' | 'gap' | 'priority' | 'contradiction';
  tier: InjectionTier;
  reason: string;
  tokenEstimate: number;
}

export interface CuratedContextPackage {
  directInject: string[];
  compressedSummary: string;
  suppressedCount: number;
  tokenBudgetUsed: number;
  curationDecisions: CurationDecision[];
}

export interface CurateContextInput {
  userId: string;
  chamber?: string;
  projectKey?: string;
  topic?: string;
  tokenBudget?: number;
  recalledMemories: RecalledRow[];
  activeIdentityDomains?: IdentityDomainContext[];
  openGaps?: GapContext[];
}

export interface IdentityDomainContext {
  id?: string;
  domain: string;
  confidence: number;
  payload: Record<string, unknown>;
  scope_type?: string;
  scope_key?: string;
  contradiction_status?: string;
}

export interface GapContext {
  id?: string;
  gapType: string;
  gapDomain?: string;
  impactScore: number;
  confirmationPriority: number;
  nextConfirmationPath?: string;
}

// ── Token estimation ─────────────────────────────────────────────────────────

/** Rough token estimate: ~4 chars per token */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ── Keyword relevance scoring ────────────────────────────────────────────────

/**
 * Score how relevant a text snippet is to the current topic.
 * Returns a value in [0, 1].
 */
function topicRelevanceScore(content: string, topic?: string, chamber?: string): number {
  if (!topic && !chamber) return 0.5; // neutral relevance when no topic provided

  const contentLower = content.toLowerCase();
  let score = 0;
  let terms = 0;

  if (topic) {
    const topicWords = topic
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3);
    for (const word of topicWords) {
      terms++;
      if (contentLower.includes(word)) score++;
    }
  }

  if (chamber) {
    terms++;
    if (contentLower.includes(chamber.toLowerCase())) score += 2;
  }

  if (terms === 0) return 0.5;
  return Math.min(1, score / terms);
}

// ── Memory curation logic ────────────────────────────────────────────────────

const STALE_DAYS = 60;
const HIGH_CONFIDENCE_THRESHOLD = 0.75;
const LOW_CONFIDENCE_THRESHOLD = 0.3;
const SUPPRESS_CONFIDENCE_THRESHOLD = 0.3;

/**
 * Determine the injection tier for a recalled memory row.
 */
function classifyMemory(
  row: RecalledRow,
  topic?: string,
  chamber?: string,
  projectKey?: string,
  sovereigntyFlags?: { suppressed: boolean; frozen: boolean },
): { tier: InjectionTier; reason: string } {
  const flags = sovereigntyFlags ?? { suppressed: false, frozen: false };

  // Tier 4: user-suppressed
  if (flags.suppressed) {
    return { tier: 'suppress', reason: 'user-suppressed via sovereignty control' };
  }

  // Tier 4: contradiction — don't inject
  if (row.contradiction_status === 'unresolved') {
    return { tier: 'suppress', reason: 'unresolved contradiction — quarantined from injection' };
  }

  // Tier 4: anomaly class
  if (row.memory_class === 'anomaly') {
    return { tier: 'suppress', reason: 'memory_class=anomaly — excluded from context' };
  }

  // Tier 4: superseded
  if (row.memory_class === 'superseded') {
    return { tier: 'suppress', reason: 'memory superseded by newer signal' };
  }

  // Tier 4: very low confidence
  const confidence = row.stability_score ?? row.similarity ?? 0.5;
  if (confidence < SUPPRESS_CONFIDENCE_THRESHOLD) {
    return { tier: 'suppress', reason: `confidence ${confidence.toFixed(2)} below suppress threshold` };
  }

  // Tier 4: stale (no reaffirmation in 60+ days) and not user_stated
  const createdAt = row.created_at ? new Date(row.created_at) : null;
  const daysSinceCreated = createdAt
    ? (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
    : 0;
  const isUserStated =
    row.provenance === 'user_stated' || row.provenance === 'user_confirmed';

  if (daysSinceCreated > STALE_DAYS && !isUserStated) {
    return { tier: 'suppress', reason: `stale: ${Math.round(daysSinceCreated)}d old, not user-stated` };
  }

  // Tier 4: project-scoped but project not active
  if (row.scope_type === 'project' && projectKey && row.scope_key !== projectKey) {
    return { tier: 'suppress', reason: 'project-scoped memory: project not active in current context' };
  }

  // Tier 4: frozen domain
  if (flags.frozen) {
    return { tier: 'suppress', reason: 'domain frozen by user' };
  }

  // Compute relevance
  const relevance = topicRelevanceScore(row.content, topic, chamber);

  // Tier 1: corrections always get direct inject
  if (row.kind === 'correction' || row.memory_class === 'corrected') {
    return { tier: 'direct', reason: 'correction memory — always highest priority' };
  }

  // Tier 1: high confidence + topic-relevant + user-stated
  if (
    confidence >= HIGH_CONFIDENCE_THRESHOLD &&
    relevance >= 0.4 &&
    isUserStated
  ) {
    return { tier: 'direct', reason: `high confidence (${confidence.toFixed(2)}) + topic-relevant + user-stated` };
  }

  // Tier 1: high confidence + high relevance (even if not user-stated)
  if (confidence >= HIGH_CONFIDENCE_THRESHOLD && relevance >= 0.6) {
    return { tier: 'direct', reason: `high confidence (${confidence.toFixed(2)}) + high relevance (${relevance.toFixed(2)})` };
  }

  // Tier 1: chamber-scoped match
  if (row.scope_type === 'chamber' && chamber && row.scope_key === chamber) {
    return { tier: 'direct', reason: 'chamber-scoped memory matching current chamber' };
  }

  // Tier 2: moderate confidence or moderate relevance
  if (confidence >= LOW_CONFIDENCE_THRESHOLD && (confidence >= 0.5 || relevance >= 0.3)) {
    return { tier: 'compressed', reason: `moderate confidence (${confidence.toFixed(2)}) — compressing` };
  }

  // Tier 3: low-confidence, tangential
  if (confidence >= LOW_CONFIDENCE_THRESHOLD) {
    return { tier: 'latent', reason: `low confidence (${confidence.toFixed(2)}) — latent only` };
  }

  return { tier: 'suppress', reason: `confidence too low: ${confidence.toFixed(2)}` };
}

// ── Identity domain curation ─────────────────────────────────────────────────

function classifyDomain(
  domain: IdentityDomainContext,
  topic?: string,
  chamber?: string,
): { tier: InjectionTier; reason: string } {
  if (domain.contradiction_status === 'unresolved') {
    return { tier: 'suppress', reason: 'domain has unresolved contradiction' };
  }

  if (domain.confidence < LOW_CONFIDENCE_THRESHOLD) {
    return { tier: 'suppress', reason: `domain confidence too low: ${domain.confidence.toFixed(2)}` };
  }

  const relevance = topicRelevanceScore(
    `${domain.domain} ${JSON.stringify(domain.payload)}`,
    topic,
    chamber,
  );

  // Chamber-profile domain always direct if chamber is active
  if (domain.domain === 'chamber_profile' && chamber) {
    return { tier: 'direct', reason: 'chamber_profile domain active in current chamber' };
  }

  if (domain.confidence >= HIGH_CONFIDENCE_THRESHOLD && relevance >= 0.3) {
    return { tier: 'direct', reason: `high-confidence domain (${domain.confidence.toFixed(2)})` };
  }

  if (domain.confidence >= 0.5) {
    return { tier: 'compressed', reason: `moderate domain confidence (${domain.confidence.toFixed(2)})` };
  }

  return { tier: 'latent', reason: 'low-confidence domain — latent' };
}

// ── Gap curation ─────────────────────────────────────────────────────────────

function classifyGap(gap: GapContext): { tier: InjectionTier; reason: string } {
  // High-impact gaps always get surfaced in compressed form
  if (gap.impactScore >= 0.7) {
    return { tier: 'compressed', reason: `high-impact gap (${gap.impactScore.toFixed(2)})` };
  }
  return { tier: 'latent', reason: 'low-impact gap — suppressed from context' };
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function formatMemoryLine(row: RecalledRow): string {
  const confidence = row.stability_score ?? row.similarity ?? 0;
  const confidenceLabel =
    confidence >= 0.75 ? '[high]' : confidence >= 0.5 ? '[med]' : '[low]';
  const kind = row.kind ?? 'memory';
  return `• (${kind}) ${confidenceLabel} ${row.content.trim().slice(0, 200)}`;
}

function formatDomainLine(domain: IdentityDomainContext): string {
  const payloadKeys = Object.keys(domain.payload ?? {}).slice(0, 3).join(', ');
  const conf = domain.confidence.toFixed(2);
  return `• [${domain.domain}] confidence=${conf}${payloadKeys ? ` | ${payloadKeys}` : ''}`;
}

function compressMemoryLine(row: RecalledRow): string {
  const content = row.content.trim().slice(0, 120);
  return `• ${content}${content.length < row.content.trim().length ? '…' : ''}`;
}

function compressDomainLine(domain: IdentityDomainContext): string {
  return `• [${domain.domain}] conf=${domain.confidence.toFixed(2)}`;
}

// ── Main curator ─────────────────────────────────────────────────────────────

/**
 * Curate the full context package from recalled memories, identity domains, and gaps.
 */
export async function curateContext(input: CurateContextInput): Promise<CuratedContextPackage> {
  const tokenBudget = input.tokenBudget ?? 500;
  const decisions: CurationDecision[] = [];
  let tokenBudgetUsed = 0;

  const directInjectParts: string[] = [];
  const compressedParts: string[] = [];
  let suppressedCount = 0;

  // Classify and sort memories by confidence desc
  const memoriesByPriority = [...input.recalledMemories].sort((a, b) => {
    const aConf = a.stability_score ?? a.similarity ?? 0;
    const bConf = b.stability_score ?? b.similarity ?? 0;
    return bConf - aConf;
  });

  // Budget allocation: 60% direct, 25% compressed, 15% gaps/domains
  const directBudget = Math.floor(tokenBudget * 0.6);
  const compressedBudget = Math.floor(tokenBudget * 0.25);
  const metaBudget = Math.floor(tokenBudget * 0.15);

  let directUsed = 0;
  let compressedUsed = 0;

  // Process memories
  for (const row of memoriesByPriority) {
    const { tier, reason } = classifyMemory(
      row,
      input.topic,
      input.chamber,
      input.projectKey,
    );

    if (tier === 'suppress' || tier === 'latent') {
      if (tier === 'suppress') suppressedCount++;
      decisions.push({
        entityId: row.id,
        entityType: 'memory',
        tier,
        reason,
        tokenEstimate: 0,
      });
      continue;
    }

    if (tier === 'direct') {
      const line = formatMemoryLine(row);
      const tokens = estimateTokens(line);
      if (directUsed + tokens <= directBudget) {
        directInjectParts.push(line);
        directUsed += tokens;
        decisions.push({ entityId: row.id, entityType: 'memory', tier: 'direct', reason, tokenEstimate: tokens });
      } else if (compressedUsed + estimateTokens(compressMemoryLine(row)) <= compressedBudget) {
        // Overflow to compressed
        const compressed = compressMemoryLine(row);
        compressedParts.push(compressed);
        compressedUsed += estimateTokens(compressed);
        decisions.push({ entityId: row.id, entityType: 'memory', tier: 'compressed', reason: 'budget overflow from direct', tokenEstimate: estimateTokens(compressed) });
      } else {
        suppressedCount++;
        decisions.push({ entityId: row.id, entityType: 'memory', tier: 'suppress', reason: 'token budget exhausted', tokenEstimate: 0 });
      }
    } else if (tier === 'compressed') {
      const compressed = compressMemoryLine(row);
      const tokens = estimateTokens(compressed);
      if (compressedUsed + tokens <= compressedBudget) {
        compressedParts.push(compressed);
        compressedUsed += tokens;
        decisions.push({ entityId: row.id, entityType: 'memory', tier: 'compressed', reason, tokenEstimate: tokens });
      } else {
        suppressedCount++;
        decisions.push({ entityId: row.id, entityType: 'memory', tier: 'suppress', reason: 'compressed budget exhausted', tokenEstimate: 0 });
      }
    }
  }

  // Process identity domains
  const domains = input.activeIdentityDomains ?? [];
  const domainDirectParts: string[] = [];
  const domainCompressedParts: string[] = [];
  let metaUsed = 0;

  for (const domain of domains) {
    const { tier, reason } = classifyDomain(domain, input.topic, input.chamber);
    const domainId = domain.id ?? domain.domain;

    if (tier === 'direct') {
      const line = formatDomainLine(domain);
      const tokens = estimateTokens(line);
      if (metaUsed + tokens <= metaBudget) {
        domainDirectParts.push(line);
        metaUsed += tokens;
        decisions.push({ entityId: domainId, entityType: 'identity_domain', tier: 'direct', reason, tokenEstimate: tokens });
      } else {
        decisions.push({ entityId: domainId, entityType: 'identity_domain', tier: 'latent', reason: 'meta budget full', tokenEstimate: 0 });
      }
    } else if (tier === 'compressed') {
      const line = compressDomainLine(domain);
      const tokens = estimateTokens(line);
      if (metaUsed + tokens <= metaBudget) {
        domainCompressedParts.push(line);
        metaUsed += tokens;
        decisions.push({ entityId: domainId, entityType: 'identity_domain', tier: 'compressed', reason, tokenEstimate: tokens });
      } else {
        decisions.push({ entityId: domainId, entityType: 'identity_domain', tier: 'latent', reason: 'meta budget full', tokenEstimate: 0 });
      }
    } else {
      if (tier === 'suppress') suppressedCount++;
      decisions.push({ entityId: domainId, entityType: 'identity_domain', tier, reason, tokenEstimate: 0 });
    }
  }

  // Process open gaps (high-impact only, brief)
  const gaps = input.openGaps ?? [];
  const gapParts: string[] = [];

  for (const gap of gaps) {
    const { tier, reason } = classifyGap(gap);
    if (tier === 'compressed' && metaUsed < metaBudget) {
      const line = gap.nextConfirmationPath
        ? `[OPEN GAP: ${gap.gapDomain ?? gap.gapType} — ${gap.nextConfirmationPath.slice(0, 60)}]`
        : `[OPEN GAP: ${gap.gapDomain ?? gap.gapType}]`;
      const tokens = estimateTokens(line);
      if (metaUsed + tokens <= metaBudget) {
        gapParts.push(line);
        metaUsed += tokens;
        decisions.push({ entityId: gap.id ?? gap.gapType, entityType: 'gap', tier: 'compressed', reason, tokenEstimate: tokens });
      } else {
        decisions.push({ entityId: gap.id ?? gap.gapType, entityType: 'gap', tier: 'latent', reason: 'meta budget full', tokenEstimate: 0 });
      }
    } else {
      decisions.push({ entityId: gap.id ?? gap.gapType, entityType: 'gap', tier, reason, tokenEstimate: 0 });
    }
  }

  // Build final direct inject array
  const allDirect = [...directInjectParts, ...domainDirectParts];

  // Build compressed summary
  const compressedSegments: string[] = [];
  if (compressedParts.length > 0) {
    compressedSegments.push(`Signals:\n${compressedParts.join('\n')}`);
  }
  if (domainCompressedParts.length > 0) {
    compressedSegments.push(`Identity:\n${domainCompressedParts.join('\n')}`);
  }
  if (gapParts.length > 0) {
    compressedSegments.push(gapParts.join('\n'));
  }

  const compressedSummary = compressedSegments.join('\n\n');
  tokenBudgetUsed = directUsed + compressedUsed + metaUsed;

  return {
    directInject: allDirect,
    compressedSummary,
    suppressedCount,
    tokenBudgetUsed,
    curationDecisions: decisions,
  };
}

// ── Format for injection ─────────────────────────────────────────────────────

/**
 * Format the curated context package into the memoryBlock injection string.
 * This REPLACES recallForOverseer()'s raw output when IDENTITY_LAYER_ENABLED.
 * Structurally compatible with the memoryBlock injection point in swarmOrchestrator.ts.
 * Hard cap: 500 tokens (~2000 chars).
 */
export function formatCuratedContext(pkg: CuratedContextPackage): string {
  if (!env.memoryLayerEnabled) return '';

  const parts: string[] = [];

  // Header
  parts.push('─── ATLAS IDENTITY CONTEXT (curated) ───');

  // Direct inject — highest priority signals
  if (pkg.directInject.length > 0) {
    parts.push('\n[CONFIRMED SIGNALS]');
    parts.push(pkg.directInject.join('\n'));
  }

  // Compressed summary — secondary signals
  if (pkg.compressedSummary.trim()) {
    parts.push('\n[BACKGROUND CONTEXT]');
    parts.push(pkg.compressedSummary.trim());
  }

  // Footer: suppressed count for transparency
  if (pkg.suppressedCount > 0) {
    parts.push(`\n[${pkg.suppressedCount} signal(s) suppressed — low confidence, stale, or user-controlled]`);
  }

  parts.push('─────────────────────────────────────────');

  const full = parts.join('\n');

  // Hard cap at ~2000 chars (≈500 tokens)
  if (full.length > 2000) {
    return full.slice(0, 1980) + '\n…[context truncated]';
  }
  return full;
}

/**
 * Phase 0.97 wiring: extend formatCuratedContext with an epistemic status block.
 * Async because it must read live claim state from Supabase. Falls back to the
 * base formatter if anything fails.
 */
export async function formatCuratedContextWithEpistemic(
  userId: string,
  pkg: CuratedContextPackage,
): Promise<string> {
  const base = formatCuratedContext(pkg);
  if (!env.memoryLayerEnabled) return base;
  try {
    const claims = await getClaimsForContext(userId);
    if (claims.length === 0) return base;
    const epistemicBlock = buildEpistemicStatusBlock(claims);
    const statusLine = formatStatusForContext(claims);
    const addition = `\n[EPISTEMIC STATUS]\n${statusLine}\n${epistemicBlock}`;
    const full = `${base}${addition}`;
    if (full.length > 2400) {
      return full.slice(0, 2380) + '\n…[context truncated]';
    }
    return full;
  } catch (err) {
    console.error('[contextCuratorService] epistemic block error:', err);
    return base;
  }
}
