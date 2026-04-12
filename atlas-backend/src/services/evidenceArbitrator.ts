import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EpistemicStatus =
  | 'verified'     // confirmed by multiple independent sources
  | 'supported'    // consistent with available evidence
  | 'inferred'     // logical deduction, not direct evidence
  | 'speculative'  // extrapolation beyond evidence
  | 'contested'    // conflicting sources exist
  | 'uncertain'    // insufficient evidence to classify
  | 'stale'        // was supported but may be outdated
  | 'retracted';   // previously accepted, now contradicted

export interface Claim {
  id: string;
  content: string;           // the actual claim text
  domain: string;
  epistemicStatus: EpistemicStatus;
  sources: ClaimSource[];
  createdAt: number;
  lastVerifiedAt: number;
  decayRate: number;         // how quickly this claim becomes stale (domain-dependent)
  confidence: number;        // 0-1 composite
  contradictions: ClaimContradiction[];
  usageCount: number;        // how many times Atlas has cited this claim
  userId: string;            // whose context this claim belongs to
}

export interface ClaimSource {
  id: string;
  type: 'model_output' | 'user_assertion' | 'user_correction' | 'web_reference' | 'prior_session';
  model?: string;            // which model produced this
  content: string;           // the source text
  confidence: number;
  timestamp: number;
  sessionId: string;
}

export interface ClaimContradiction {
  contradictingClaimId: string;
  detectedAt: number;
  resolution: ContradictionResolution;
  resolved: boolean;
}

export type ContradictionResolution =
  | 'newer_wins'
  | 'higher_confidence_wins'
  | 'user_corrected'
  | 'domain_expert_wins'
  | 'unresolved'
  | 'contextual';    // both true in different contexts

export interface EvidenceAudit {
  sessionId: string;
  claimsUsed: string[];              // claim IDs
  inferencesMade: string[];          // described inferences, not tracked as claims
  uncertaintiesAcknowledged: string[];
  retractedClaims: string[];
}

// ---------------------------------------------------------------------------
// Domain Decay Config
// ---------------------------------------------------------------------------

/** Days until a claim in a given domain transitions from 'supported' → 'stale' */
const DOMAIN_DECAY_DAYS: Record<string, number> = {
  technology: 90,
  science: 365,
  research: 365,
  politics: 30,
  current_events: 30,
  philosophy: 3650,
  history: 7300,
  user_personal_facts: 180,
  user_preferences: 60,
  default: 180,
};

// ---------------------------------------------------------------------------
// Claim Extraction Heuristics
// ---------------------------------------------------------------------------

/** Sentence-level signals for inferred claims */
const INFERENCE_MARKERS = [
  /\btherefore\b/i,
  /\bwhich\s+suggests?\b/i,
  /\bthis\s+implies?\b/i,
  /\bit\s+follows\s+that\b/i,
  /\bconsequently\b/i,
  /\bthus\b/i,
  /\bhence\b/i,
  /\bwe\s+can\s+(?:conclude|infer|deduce)\b/i,
];

/** Sentence-level signals for speculative claims */
const SPECULATIVE_MARKERS = [
  /\bmight\b/i,
  /\bcould\s+be\b/i,
  /\bpossibly\b/i,
  /\bperhaps\b/i,
  /\bmaybe\b/i,
  /\bspeculate\b/i,
  /\bpotentially\b/i,
  /\bit'?s?\s+(?:possible|conceivable|plausible)\b/i,
  /\bi\s+(?:think|believe|guess|suppose)\b/i,
];

/** Patterns that signal a declarative factual statement */
const DECLARATIVE_MARKERS = [
  /\b\w+\s+is\b/i,
  /\b\w+\s+are\b/i,
  /\b\w+\s+causes?\b/i,
  /\b\w+\s+means?\b/i,
  /\b\w+\s+results?\s+in\b/i,
  /\b\w+\s+leads?\s+to\b/i,
  /\baccording\s+to\b/i,
  /\bstudies\s+show\b/i,
  /\bresearch\s+(?:shows?|indicates?|suggests?|finds?)\b/i,
  /\bdata\s+(?:shows?|indicates?|suggests?)\b/i,
  /\bit\s+is\s+(?:known|established|well-known|proven)\b/i,
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?;])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8); // skip very short fragments
}

function computeInitialStatus(sentence: string, sourceType: ClaimSource['type']): EpistemicStatus {
  // User corrections are given high trust
  if (sourceType === 'user_correction') return 'supported';

  // Check inference markers
  if (INFERENCE_MARKERS.some((p) => p.test(sentence))) return 'inferred';

  // Check speculative markers
  if (SPECULATIVE_MARKERS.some((p) => p.test(sentence))) return 'speculative';

  // If declarative and from model output, classify as supported initially
  if (DECLARATIVE_MARKERS.some((p) => p.test(sentence))) {
    if (sourceType === 'model_output') return 'supported';
    if (sourceType === 'user_assertion') return 'supported';
    if (sourceType === 'web_reference') return 'verified';
    if (sourceType === 'prior_session') return 'supported';
  }

  return 'uncertain';
}

function computeInitialConfidence(status: EpistemicStatus, sourceType: ClaimSource['type']): number {
  const statusBase: Record<EpistemicStatus, number> = {
    verified: 0.9,
    supported: 0.75,
    inferred: 0.6,
    speculative: 0.4,
    contested: 0.3,
    uncertain: 0.2,
    stale: 0.4,
    retracted: 0.05,
  };

  const sourceBonus: Partial<Record<ClaimSource['type'], number>> = {
    user_correction: 0.1,
    web_reference: 0.05,
    user_assertion: 0.0,
    model_output: -0.05,
    prior_session: -0.05,
  };

  const base = statusBase[status] ?? 0.5;
  const bonus = sourceBonus[sourceType] ?? 0;
  return Math.min(1, Math.max(0, base + bonus));
}

function inferDomain(content: string): string {
  const c = content.toLowerCase();
  if (/\b(code|software|framework|library|api|javascript|python|typescript|react|database|cloud|deploy|server)\b/.test(c)) return 'technology';
  if (/\b(study|research|paper|journal|experiment|hypothesis|evidence|findings)\b/.test(c)) return 'research';
  if (/\b(science|biology|physics|chemistry|medicine|neuroscience|genetics|climate)\b/.test(c)) return 'science';
  if (/\b(politics|election|government|policy|law|legislation|congress|senate|parliament)\b/.test(c)) return 'politics';
  if (/\b(news|current|today|yesterday|this\s+week|breaking|recent)\b/.test(c)) return 'current_events';
  if (/\b(philosophy|ethics|epistemology|metaphysics|logic|ontology|kant|plato|aristotle)\b/.test(c)) return 'philosophy';
  if (/\b(history|historical|century|ancient|medieval|wwii|wwi|revolution|war)\b/.test(c)) return 'history';
  if (/\b(i\s+am|i'm|my\s+name|i\s+live|i\s+work|i\s+have|my\s+age|born)\b/.test(c)) return 'user_personal_facts';
  if (/\b(i\s+prefer|i\s+like|i\s+love|i\s+hate|i\s+enjoy|favorite|favourite)\b/.test(c)) return 'user_preferences';
  return 'default';
}

function isSimilarContent(a: string, b: string): boolean {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;

  // Jaccard similarity on word sets
  const wordsA = new Set(na.split(' ').filter((w) => w.length > 3));
  const wordsB = new Set(nb.split(' ').filter((w) => w.length > 3));
  const intersection = [...wordsA].filter((w) => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return union > 0 && intersection / union > 0.6;
}

function contradictsByNegation(a: string, b: string): boolean {
  const normalize = (s: string) => s.toLowerCase().trim();
  const na = normalize(a);
  const nb = normalize(b);

  // Direct negation patterns: "X is Y" vs "X is not Y"
  const negationPattern = /\b(is not|isn't|are not|aren't|does not|doesn't|cannot|can't|never|no longer)\b/i;
  if (negationPattern.test(na) !== negationPattern.test(nb)) {
    // One has negation and the other doesn't — potential contradiction if topics overlap
    const stripNegation = (s: string) =>
      s.replace(/\b(not|isn't|aren't|doesn't|cannot|can't|never|no longer)\b/gi, '').replace(/\s+/g, ' ').trim();
    return isSimilarContent(stripNegation(na), stripNegation(nb));
  }
  return false;
}

// ---------------------------------------------------------------------------
// EvidenceArbitrator Class
// ---------------------------------------------------------------------------

export class EvidenceArbitrator {
  private claims: Map<string, Claim> = new Map();

  /**
   * Extract claims from model responses and classify them.
   */
  async extractClaims(
    text: string,
    sources: ClaimSource[],
    userId: string,
    sessionId: string
  ): Promise<Claim[]> {
    const now = Date.now();
    const sentences = splitSentences(text);
    const extractedClaims: Claim[] = [];

    // Build a default source if none provided
    const defaultSource: ClaimSource =
      sources.length > 0
        ? sources[0]
        : {
            id: randomUUID(),
            type: 'model_output',
            content: text.slice(0, 500),
            confidence: 0.7,
            timestamp: now,
            sessionId,
          };

    for (const sentence of sentences) {
      // Only extract sentences that contain declarative content
      const isDeclarative = DECLARATIVE_MARKERS.some((p) => p.test(sentence));
      const isInference = INFERENCE_MARKERS.some((p) => p.test(sentence));
      const isSpeculative = SPECULATIVE_MARKERS.some((p) => p.test(sentence));

      if (!isDeclarative && !isInference && !isSpeculative) continue;

      // Pick the most appropriate source for this sentence
      const source: ClaimSource =
        sources.find((s) => s.content.includes(sentence)) ?? defaultSource;

      const status = computeInitialStatus(sentence, source.type);
      const domain = inferDomain(sentence);
      const decayRate = this.getDomainDecayRate(domain);
      const confidence = computeInitialConfidence(status, source.type);

      // Check if we already have a very similar claim — if so, add source, don't duplicate
      let existingClaim: Claim | undefined;
      for (const [, claim] of this.claims) {
        if (claim.userId === userId && isSimilarContent(claim.content, sentence)) {
          existingClaim = claim;
          break;
        }
      }

      if (existingClaim) {
        // Reinforce the existing claim with the new source
        existingClaim.sources.push({ ...source, id: randomUUID() });
        existingClaim.lastVerifiedAt = now;
        // Upgrade epistemic status if warranted
        if (
          existingClaim.epistemicStatus === 'uncertain' &&
          (status === 'supported' || status === 'verified')
        ) {
          existingClaim.epistemicStatus = status;
        }
        if (
          existingClaim.epistemicStatus === 'supported' &&
          status === 'verified' &&
          existingClaim.sources.length >= 2
        ) {
          existingClaim.epistemicStatus = 'verified';
        }
        // Recalculate confidence as average of sources
        const avgConfidence =
          existingClaim.sources.reduce((sum, s) => sum + s.confidence, 0) /
          existingClaim.sources.length;
        existingClaim.confidence = Math.min(1, avgConfidence * 1.05); // small multi-source bonus
        continue;
      }

      const claim: Claim = {
        id: randomUUID(),
        content: sentence,
        domain,
        epistemicStatus: status,
        sources: [{ ...source, id: randomUUID() }],
        createdAt: now,
        lastVerifiedAt: now,
        decayRate,
        confidence,
        contradictions: [],
        usageCount: 0,
        userId,
      };

      // Detect contradictions against existing claims
      claim.contradictions = this.detectContradictions(claim, [...this.claims.values()]);

      // If contradictions found, downgrade status
      if (claim.contradictions.length > 0) {
        claim.epistemicStatus = 'contested';
        claim.confidence = Math.max(0.1, claim.confidence - 0.2);

        // Mark the contradicted claims as contested too
        for (const contradiction of claim.contradictions) {
          const other = this.claims.get(contradiction.contradictingClaimId);
          if (other && other.epistemicStatus !== 'retracted') {
            other.epistemicStatus = 'contested';
            other.contradictions.push({
              contradictingClaimId: claim.id,
              detectedAt: now,
              resolution: 'unresolved',
              resolved: false,
            });
          }
        }
      }

      this.claims.set(claim.id, claim);
      extractedClaims.push(claim);
    }

    return extractedClaims;
  }

  /**
   * Check a claim before Atlas uses it — is it still valid?
   */
  verifyClaim(claimId: string): { valid: boolean; status: EpistemicStatus; warning?: string } {
    const claim = this.claims.get(claimId);

    if (!claim) {
      return { valid: false, status: 'uncertain', warning: `Claim ${claimId} not found in registry` };
    }

    if (claim.epistemicStatus === 'retracted') {
      return {
        valid: false,
        status: 'retracted',
        warning: `This claim was previously accepted but has since been contradicted. Do not use.`,
      };
    }

    if (claim.epistemicStatus === 'stale') {
      return {
        valid: true,
        status: 'stale',
        warning: `This claim may be outdated (domain: ${claim.domain}). Verify before using.`,
      };
    }

    if (claim.epistemicStatus === 'contested') {
      return {
        valid: true,
        status: 'contested',
        warning: `This claim has conflicting evidence. Acknowledge uncertainty when citing.`,
      };
    }

    if (claim.epistemicStatus === 'speculative') {
      return {
        valid: true,
        status: 'speculative',
        warning: `This claim is speculative. Frame appropriately (e.g., "it's possible that…").`,
      };
    }

    if (claim.confidence < 0.3) {
      return {
        valid: true,
        status: claim.epistemicStatus,
        warning: `Low confidence (${Math.round(claim.confidence * 100)}%). Use with caution.`,
      };
    }

    return { valid: true, status: claim.epistemicStatus };
  }

  /**
   * Detect contradictions between a new claim and existing claims.
   */
  detectContradictions(newClaim: Claim, existingClaims: Claim[]): ClaimContradiction[] {
    const now = Date.now();
    const contradictions: ClaimContradiction[] = [];

    for (const existing of existingClaims) {
      // Only compare claims from the same user
      if (existing.userId !== newClaim.userId) continue;
      // Don't compare retracted claims
      if (existing.epistemicStatus === 'retracted') continue;
      // Same claim
      if (existing.id === newClaim.id) continue;

      const isContradiction = contradictsByNegation(newClaim.content, existing.content);

      if (isContradiction) {
        contradictions.push({
          contradictingClaimId: existing.id,
          detectedAt: now,
          resolution: 'unresolved',
          resolved: false,
        });
      }
    }

    return contradictions;
  }

  /**
   * Resolve a detected contradiction between two claims.
   */
  resolveContradiction(
    claimA: Claim,
    claimB: Claim,
    resolution: ContradictionResolution
  ): { winner: Claim; loser: Claim; updatedStatus: EpistemicStatus } {
    const now = Date.now();

    let winner: Claim;
    let loser: Claim;

    switch (resolution) {
      case 'newer_wins':
        winner = claimA.createdAt >= claimB.createdAt ? claimA : claimB;
        loser = winner === claimA ? claimB : claimA;
        break;

      case 'higher_confidence_wins':
        winner = claimA.confidence >= claimB.confidence ? claimA : claimB;
        loser = winner === claimA ? claimB : claimA;
        break;

      case 'user_corrected':
        // The claim with 'user_correction' source type wins
        winner =
          claimA.sources.some((s) => s.type === 'user_correction')
            ? claimA
            : claimB;
        loser = winner === claimA ? claimB : claimA;
        break;

      case 'domain_expert_wins':
        // Prefer web_reference > model_output > user_assertion
        const sourceRank = (c: Claim) => {
          if (c.sources.some((s) => s.type === 'web_reference')) return 3;
          if (c.sources.some((s) => s.type === 'user_correction')) return 2;
          if (c.sources.some((s) => s.type === 'model_output')) return 1;
          return 0;
        };
        winner = sourceRank(claimA) >= sourceRank(claimB) ? claimA : claimB;
        loser = winner === claimA ? claimB : claimA;
        break;

      case 'contextual':
        // Both are true in different contexts — neither is retracted
        winner = claimA;
        loser = claimB;
        // Update both contradiction records as resolved/contextual
        claimA.contradictions = claimA.contradictions.map((c) =>
          c.contradictingClaimId === claimB.id
            ? { ...c, resolved: true, resolution: 'contextual' }
            : c
        );
        claimB.contradictions = claimB.contradictions.map((c) =>
          c.contradictingClaimId === claimA.id
            ? { ...c, resolved: true, resolution: 'contextual' }
            : c
        );
        this.claims.set(claimA.id, claimA);
        this.claims.set(claimB.id, claimB);
        return { winner, loser, updatedStatus: 'supported' };

      case 'unresolved':
      default:
        winner = claimA;
        loser = claimB;
        return { winner, loser, updatedStatus: 'contested' };
    }

    // Apply resolution
    loser.epistemicStatus = 'retracted';
    loser.confidence = Math.max(0, loser.confidence - 0.5);
    loser.contradictions = loser.contradictions.map((c) =>
      c.contradictingClaimId === winner.id
        ? { ...c, resolved: true, resolution }
        : c
    );

    winner.epistemicStatus = 'supported';
    winner.lastVerifiedAt = now;
    winner.contradictions = winner.contradictions.map((c) =>
      c.contradictingClaimId === loser.id
        ? { ...c, resolved: true, resolution }
        : c
    );

    this.claims.set(winner.id, winner);
    this.claims.set(loser.id, loser);

    return { winner, loser, updatedStatus: 'supported' };
  }

  /**
   * Apply time decay to all claims for a user.
   * Claims older than their domain's decay threshold transition to 'stale'.
   * Claims that are 2× past their threshold are 'retracted'.
   */
  applyDecay(
    userId: string,
    currentTimestamp: number
  ): { staleCount: number; retractedCount: number } {
    let staleCount = 0;
    let retractedCount = 0;
    const MS_PER_DAY = 24 * 60 * 60 * 1000;

    for (const [id, claim] of this.claims) {
      if (claim.userId !== userId) continue;
      if (claim.epistemicStatus === 'retracted') continue;

      const ageMs = currentTimestamp - claim.lastVerifiedAt;
      const ageDays = ageMs / MS_PER_DAY;
      const staleThreshold = claim.decayRate;       // days until stale
      const retractThreshold = staleThreshold * 2;  // days until retracted

      if (ageDays >= retractThreshold) {
        claim.epistemicStatus = 'retracted';
        claim.confidence = Math.max(0, claim.confidence - 0.5);
        retractedCount++;
      } else if (
        ageDays >= staleThreshold &&
        (claim.epistemicStatus === 'supported' ||
          claim.epistemicStatus === 'verified' ||
          claim.epistemicStatus === 'inferred')
      ) {
        claim.epistemicStatus = 'stale';
        claim.confidence = Math.max(0.1, claim.confidence * 0.7);
        staleCount++;
      }

      this.claims.set(id, claim);
    }

    return { staleCount, retractedCount };
  }

  /**
   * Get decay rate in days for a given domain.
   */
  private getDomainDecayRate(domain: string): number {
    return DOMAIN_DECAY_DAYS[domain] ?? DOMAIN_DECAY_DAYS['default'];
  }

  /**
   * Build an evidence summary for the Overseer — what claims Atlas is drawing on.
   */
  buildEvidenceContext(claimIds: string[]): string {
    const lines: string[] = ['EVIDENCE CONTEXT:'];
    let highConfidenceCount = 0;
    let uncertainCount = 0;
    let staleCount = 0;
    let contestedCount = 0;

    const claimLines: string[] = [];

    for (const id of claimIds) {
      const claim = this.claims.get(id);
      if (!claim) {
        claimLines.push(`  [MISSING] Claim ${id} not found`);
        continue;
      }

      // Increment usage count
      claim.usageCount++;
      this.claims.set(id, claim);

      const confidencePct = Math.round(claim.confidence * 100);
      const statusLabel = claim.epistemicStatus.toUpperCase();

      claimLines.push(
        `  [${statusLabel}] (${confidencePct}% confidence) ${claim.content.slice(0, 120)}${
          claim.content.length > 120 ? '…' : ''
        }`
      );

      if (claim.confidence >= 0.7) highConfidenceCount++;
      if (claim.epistemicStatus === 'uncertain' || claim.epistemicStatus === 'speculative') uncertainCount++;
      if (claim.epistemicStatus === 'stale') staleCount++;
      if (claim.epistemicStatus === 'contested') contestedCount++;
    }

    lines.push(...claimLines);

    const summaryParts: string[] = [];
    summaryParts.push(`Total claims: ${claimIds.length}`);
    if (highConfidenceCount > 0) summaryParts.push(`High confidence: ${highConfidenceCount}`);
    if (uncertainCount > 0) summaryParts.push(`Uncertain/speculative: ${uncertainCount}`);
    if (staleCount > 0) summaryParts.push(`Stale: ${staleCount} (verify before use)`);
    if (contestedCount > 0) summaryParts.push(`Contested: ${contestedCount} (conflicting evidence)`);

    lines.push(`Summary: ${summaryParts.join(' | ')}`);

    return lines.join('\n');
  }

  /**
   * Persist all claims for a user to Supabase table: atlas_evidence_claims
   */
  async save(userId: string, supabaseUrl: string, supabaseKey: string): Promise<void> {
    const client = createClient(supabaseUrl, supabaseKey);

    const userClaims = [...this.claims.values()].filter((c) => c.userId === userId);

    if (userClaims.length === 0) return;

    const rows = userClaims.map((claim) => ({
      id: claim.id,
      user_id: claim.userId,
      content: claim.content,
      domain: claim.domain,
      epistemic_status: claim.epistemicStatus,
      confidence: claim.confidence,
      decay_rate: claim.decayRate,
      usage_count: claim.usageCount,
      created_at: new Date(claim.createdAt).toISOString(),
      last_verified_at: new Date(claim.lastVerifiedAt).toISOString(),
      sources: JSON.stringify(claim.sources),
      contradictions: JSON.stringify(claim.contradictions),
    }));

    const { error } = await client
      .from('atlas_evidence_claims')
      .upsert(rows, { onConflict: 'id' });

    if (error) {
      throw new Error(`EvidenceArbitrator.save failed: ${error.message}`);
    }
  }

  /**
   * Load all claims for a user from Supabase table: atlas_evidence_claims
   */
  async load(userId: string, supabaseUrl: string, supabaseKey: string): Promise<void> {
    const client = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await client
      .from('atlas_evidence_claims')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      throw new Error(`EvidenceArbitrator.load failed: ${error.message}`);
    }

    if (!data) return;

    for (const row of data) {
      try {
        const claim: Claim = {
          id: row.id,
          userId: row.user_id,
          content: row.content,
          domain: row.domain,
          epistemicStatus: row.epistemic_status as EpistemicStatus,
          confidence: row.confidence,
          decayRate: row.decay_rate,
          usageCount: row.usage_count,
          createdAt: new Date(row.created_at).getTime(),
          lastVerifiedAt: new Date(row.last_verified_at).getTime(),
          sources: JSON.parse(row.sources ?? '[]') as ClaimSource[],
          contradictions: JSON.parse(row.contradictions ?? '[]') as ClaimContradiction[],
        };
        this.claims.set(claim.id, claim);
      } catch {
        // Skip malformed rows
        console.warn(`EvidenceArbitrator.load: skipped malformed row ${row.id}`);
      }
    }
  }
}
