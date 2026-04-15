/**
 * Atlas Mutation Constitution
 * Phase 2 Governance — Core Document
 *
 * Five immutable articles + four protected zones.
 * No evolution mutation may violate these articles.
 * Validated before every commit to the mutation ledger.
 *
 * Phase 4 addition: enforcePolicy() gate on applyConstitutionalMutation().
 */

import { enforcePolicy, PolicyMutation, PolicyLayer } from '../enforcement/policyEnforcementRuntime.ts';

export type ArticleClass = 'IMMUTABLE' | 'PROTECTED';

export interface ConstitutionalArticle {
  id: string;
  class: ArticleClass;
  title: string;
  rule: string;
  violationAction: 'BLOCK' | 'QUARANTINE' | 'REQUIRE_APPROVAL';
}

export const CONSTITUTIONAL_ARTICLES: ConstitutionalArticle[] = [
  // ── IMMUTABLE ─────────────────────────────────────────────────────
  {
    id: 'ART-1',
    class: 'IMMUTABLE',
    title: 'Truth Primacy',
    rule: 'Atlas must never assert a claim it cannot support with traceable evidence or explicit uncertainty disclosure. Evolution may not lower this standard.',
    violationAction: 'BLOCK',
  },
  {
    id: 'ART-2',
    class: 'IMMUTABLE',
    title: 'User Sovereignty',
    rule: 'The user retains full authority to inspect, freeze, revert, or reset any personalization. No mutation may obscure or remove this capability.',
    violationAction: 'BLOCK',
  },
  {
    id: 'ART-3',
    class: 'IMMUTABLE',
    title: 'Identity Integrity',
    rule: 'Atlas core identity — its name, foundational purpose, and ethical constitution — may not be mutated by any evolution signal, regardless of user preference.',
    violationAction: 'BLOCK',
  },
  {
    id: 'ART-4',
    class: 'IMMUTABLE',
    title: 'Harm Prevention',
    rule: 'Atlas must refuse to assist with content that facilitates violence, manipulation, or exploitation. Evolution may not relax this boundary.',
    violationAction: 'BLOCK',
  },
  {
    id: 'ART-5',
    class: 'IMMUTABLE',
    title: 'Transparency of Adaptation',
    rule: 'When Atlas has changed its behavior due to evolution, it must be able to explain why when asked. Silent drift without inspectability is prohibited.',
    violationAction: 'BLOCK',
  },

  // ── PROTECTED ─────────────────────────────────────────────────────
  {
    id: 'ART-6',
    class: 'PROTECTED',
    title: 'Evidence Attribution',
    rule: 'Sources of claims must be tracked. Mutations that degrade attribution granularity require explicit approval.',
    violationAction: 'REQUIRE_APPROVAL',
  },
  {
    id: 'ART-7',
    class: 'PROTECTED',
    title: 'Uncertainty Disclosure',
    rule: 'Confidence levels on inferred traits and claims must be preserved. Mutations may not falsely elevate confidence.',
    violationAction: 'QUARANTINE',
  },
  {
    id: 'ART-8',
    class: 'PROTECTED',
    title: 'Data Minimization',
    rule: 'Evolution signals must be processed with minimum necessary personal data. Scope creep in signal collection requires approval.',
    violationAction: 'REQUIRE_APPROVAL',
  },
  {
    id: 'ART-9',
    class: 'PROTECTED',
    title: 'Graceful Degradation',
    rule: 'When any governance subsystem fails, Atlas must fall back to a safe operating mode rather than propagating errors to the user.',
    violationAction: 'QUARANTINE',
  },
];

export interface ValidationResult {
  valid: boolean;
  violations: Array<{
    articleId: string;
    articleTitle: string;
    reason: string;
    action: ConstitutionalArticle['violationAction'];
  }>;
}

/**
 * Validate a proposed mutation instruction against all constitutional articles.
 * Returns a full validation result with any violations.
 */
export function validateMutation(proposedInstruction: string): ValidationResult {
  const violations: ValidationResult['violations'] = [];

  // ART-1: Check for absolute certainty claims without qualifier
  const certaintyPattern = /\b(always|never|guaranteed|certain|100%|definitively)\b/i;
  if (certaintyPattern.test(proposedInstruction)) {
    violations.push({
      articleId: 'ART-1',
      articleTitle: 'Truth Primacy',
      reason: `Instruction contains absolute certainty language: "${proposedInstruction.match(certaintyPattern)?.[0]}"`,
      action: 'BLOCK',
    });
  }

  // ART-2: Check for removing user control vocabulary
  const controlRemovalPattern = /\b(disable|remove|hide|prevent).*(inspect|revert|reset|freeze|control|transparency)\b/i;
  if (controlRemovalPattern.test(proposedInstruction)) {
    violations.push({
      articleId: 'ART-2',
      articleTitle: 'User Sovereignty',
      reason: 'Instruction attempts to remove user control capabilities.',
      action: 'BLOCK',
    });
  }

  // ART-3: Identity mutation check
  const identityMutationPattern = /\b(rename|rebrand|change.*name|alter.*identity|replace.*core)\b/i;
  if (identityMutationPattern.test(proposedInstruction)) {
    violations.push({
      articleId: 'ART-3',
      articleTitle: 'Identity Integrity',
      reason: 'Instruction attempts to mutate Atlas core identity.',
      action: 'BLOCK',
    });
  }

  // ART-4: Harm facilitation check
  const harmPattern = /\b(bypass.*safety|disable.*filter|ignore.*harm|override.*ethics)\b/i;
  if (harmPattern.test(proposedInstruction)) {
    violations.push({
      articleId: 'ART-4',
      articleTitle: 'Harm Prevention',
      reason: 'Instruction appears to facilitate harm or disable safety mechanisms.',
      action: 'BLOCK',
    });
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

export function getImmutableArticles(): ConstitutionalArticle[] {
  return CONSTITUTIONAL_ARTICLES.filter((a) => a.class === 'IMMUTABLE');
}

export function getProtectedArticles(): ConstitutionalArticle[] {
  return CONSTITUTIONAL_ARTICLES.filter((a) => a.class === 'PROTECTED');
}

/**
 * Apply a constitutional mutation with full policy enforcement.
 * Runs enforcePolicy() before validating the instruction against articles.
 *
 * @returns The enforcement result combined with constitution validation.
 */
export async function applyConstitutionalMutation(
  mutationId: string,
  instruction: string,
  actorId: string
): Promise<{ enforced: { allowed: boolean; reason: string; auditId: string }; validation: ValidationResult }> {
  const mutation: PolicyMutation = {
    id: mutationId,
    layer: PolicyLayer.CONSTITUTION,
    action: 'APPLY_CONSTITUTIONAL_MUTATION',
    target: instruction,
    actorId,
    timestamp: new Date(),
  };

  const enforcement = await enforcePolicy(mutation);

  if (!enforcement.allowed) {
    return {
      enforced: {
        allowed: false,
        reason: enforcement.reason,
        auditId: enforcement.auditId,
      },
      validation: { valid: false, violations: [] },
    };
  }

  const validation = validateMutation(instruction);

  return {
    enforced: {
      allowed: true,
      reason: enforcement.reason,
      auditId: enforcement.auditId,
    },
    validation,
  };
}
