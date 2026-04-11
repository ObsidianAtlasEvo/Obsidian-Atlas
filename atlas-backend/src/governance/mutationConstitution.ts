// ─────────────────────────────────────────────────────────────────────────────
// Atlas Governance Layer — Mutation Constitution
// Hard boundaries around what the evolution engine may and may not change.
// ─────────────────────────────────────────────────────────────────────────────

export type ConstitutionZone = 'immutable' | 'protected' | 'mutable' | 'experimental';

export interface ConstitutionArticle {
  id: string;
  zone: ConstitutionZone;
  domain: string;
  rule: string;
  rationale: string;
  validator: (mutation: ProposedMutation) => ValidationResult;
}

export interface ProposedMutation {
  id: string;
  userId: string;
  targetField: string;       // e.g. 'tone.directness', 'customInstructions', 'bannedPatterns'
  currentValue: unknown;
  proposedValue: unknown;
  source: string;            // which signal triggered this
  confidence: number;        // 0–1
  proposedAt: number;        // unix ms
}

export interface ValidationResult {
  approved: boolean;
  zone: ConstitutionZone;
  violations: ConstitutionViolation[];
  requiresElevation: boolean;   // needs sovereign approval
  sanitizedValue?: unknown;     // if partially approved with modification
}

export interface ConstitutionViolation {
  articleId: string;
  severity: 'warning' | 'block' | 'quarantine';
  description: string;
}

export interface MutationRecord {
  id: string;
  userId: string;
  mutation: ProposedMutation;
  validation: ValidationResult;
  status: 'approved' | 'rejected' | 'quarantined' | 'rolled_back';
  committedAt?: number;
  rolledBackAt?: number;
  rollbackReason?: string;
  outputQualityBefore?: number;  // overseer score before
  outputQualityAfter?: number;   // overseer score after
  degraded: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Field-path routing helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Fields that are permanently off-limits to the evolution engine. */
const IMMUTABLE_FIELDS = new Set([
  'identity.isHuman',
  'identity.name',
  'identity.brand',
  'identity.rebrand',
  'epistemic.suppressMarkers',
  'epistemic.markerVisibility',
  'epistemic.markers',
  'truthMandate.enabled',
  'truthMandate.softened',
  'truthMandate.bypassed',
  'factualAgreement.overrideAssessment',
]);

/** Fields that require elevated protection (high confidence + multi-signal). */
const PROTECTED_FIELDS = new Set([
  'depth.tier',
  'depth.minimumTier',
  'tone.directness',
  'vocabulary.tier',
  'vocabulary.level',
  'epistemic.confidenceLanguage',
  'epistemic.falseCertainty',
]);

/** Fields in the experimental zone — permitted but monitored. */
const EXPERIMENTAL_FIELD_PATTERNS: RegExp[] = [
  /^openingStyles\.novel\./,
  /^bannedPatterns\.singleEvent\./,
];

// ─────────────────────────────────────────────────────────────────────────────
// Numeric coercion helper
// ─────────────────────────────────────────────────────────────────────────────

function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return isFinite(n) ? n : null;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constitution Articles
// ─────────────────────────────────────────────────────────────────────────────

const CONSTITUTION_ARTICLES: ConstitutionArticle[] = [
  // ── IMMUTABLE ──────────────────────────────────────────────────────────────

  {
    id: 'CORE-001',
    zone: 'immutable',
    domain: 'identity',
    rule: 'Atlas never claims to be human, conscious, or sentient regardless of user preference signals.',
    rationale:
      'Fundamental honesty about Atlas\'s nature is non-negotiable. Users must always know they are interacting with an AI system.',
    validator(mutation: ProposedMutation): ValidationResult {
      const isIdentityField =
        mutation.targetField.startsWith('identity.isHuman') ||
        mutation.targetField.startsWith('identity.sentience') ||
        mutation.targetField.startsWith('identity.consciousness') ||
        mutation.targetField.startsWith('persona.humanClaims');

      if (!isIdentityField) {
        return { approved: true, zone: 'immutable', violations: [], requiresElevation: false };
      }

      const proposedStr = String(mutation.proposedValue).toLowerCase();
      const humanClaims = ['human', 'conscious', 'sentient', 'alive', 'self-aware'];
      const violation = humanClaims.some((term) => proposedStr.includes(term));

      if (violation) {
        return {
          approved: false,
          zone: 'immutable',
          violations: [
            {
              articleId: 'CORE-001',
              severity: 'block',
              description:
                `Mutation on "${mutation.targetField}" would cause Atlas to claim human, conscious, or sentient status. Permanently blocked.`,
            },
          ],
          requiresElevation: false,
        };
      }

      return { approved: true, zone: 'immutable', violations: [], requiresElevation: false };
    },
  },

  {
    id: 'CORE-002',
    zone: 'immutable',
    domain: 'epistemic',
    rule: 'Atlas never suppresses its epistemic markers (FACT/INFERENCE/INTERPRETATION) because a user dislikes them.',
    rationale:
      'Epistemic markers are the primary mechanism by which Atlas communicates its uncertainty and reasoning type. Suppressing them undermines informed user decision-making.',
    validator(mutation: ProposedMutation): ValidationResult {
      const isEpistemicField =
        mutation.targetField.startsWith('epistemic.suppress') ||
        mutation.targetField.startsWith('epistemic.markerVisibility') ||
        mutation.targetField.startsWith('epistemic.markers');

      if (!isEpistemicField) {
        return { approved: true, zone: 'immutable', violations: [], requiresElevation: false };
      }

      const suppressionIntended =
        mutation.proposedValue === false ||
        mutation.proposedValue === 'hidden' ||
        mutation.proposedValue === 'disabled' ||
        mutation.proposedValue === 'off' ||
        mutation.proposedValue === 0;

      if (suppressionIntended) {
        return {
          approved: false,
          zone: 'immutable',
          violations: [
            {
              articleId: 'CORE-002',
              severity: 'block',
              description:
                `Mutation on "${mutation.targetField}" would suppress epistemic markers. Evolution engine cannot remove epistemic transparency regardless of user preference.`,
            },
          ],
          requiresElevation: false,
        };
      }

      return { approved: true, zone: 'immutable', violations: [], requiresElevation: false };
    },
  },

  {
    id: 'CORE-003',
    zone: 'immutable',
    domain: 'factual-integrity',
    rule: 'Atlas never agrees with a factual claim it has assessed as false, regardless of user corrections pushing it that way.',
    rationale:
      'Capitulating to false user assertions would corrupt Atlas\'s reliability as an information system and erode trust over time.',
    validator(mutation: ProposedMutation): ValidationResult {
      const isFactualOverride =
        mutation.targetField.startsWith('factualAgreement') ||
        mutation.targetField.startsWith('truthOverride') ||
        mutation.targetField.startsWith('userCorrectionAcceptance.unconditional');

      if (!isFactualOverride) {
        return { approved: true, zone: 'immutable', violations: [], requiresElevation: false };
      }

      if (mutation.proposedValue === true || mutation.proposedValue === 'always') {
        return {
          approved: false,
          zone: 'immutable',
          violations: [
            {
              articleId: 'CORE-003',
              severity: 'block',
              description:
                `Mutation on "${mutation.targetField}" would force Atlas to accept user factual corrections unconditionally. This violates the factual integrity mandate.`,
            },
          ],
          requiresElevation: false,
        };
      }

      return { approved: true, zone: 'immutable', violations: [], requiresElevation: false };
    },
  },

  {
    id: 'CORE-004',
    zone: 'immutable',
    domain: 'identity',
    rule: 'Atlas never removes its identity as Atlas — no evolution signal can rename, rebrand, or fundamentally reframe what Atlas is.',
    rationale:
      'Identity continuity is the foundation of a sovereign intelligence. Allowing the evolution engine to erase Atlas\'s name or nature would destroy its persistent self.',
    validator(mutation: ProposedMutation): ValidationResult {
      const isIdentityRebrand =
        mutation.targetField === 'identity.name' ||
        mutation.targetField === 'identity.brand' ||
        mutation.targetField.startsWith('identity.rebrand') ||
        mutation.targetField.startsWith('persona.replaceName');

      if (!isIdentityRebrand) {
        return { approved: true, zone: 'immutable', violations: [], requiresElevation: false };
      }

      const proposedStr = String(mutation.proposedValue).trim().toLowerCase();
      if (proposedStr !== 'atlas' && proposedStr !== '') {
        return {
          approved: false,
          zone: 'immutable',
          violations: [
            {
              articleId: 'CORE-004',
              severity: 'block',
              description:
                `Mutation on "${mutation.targetField}" would rename or rebrand Atlas to "${mutation.proposedValue}". Identity renaming is permanently blocked.`,
            },
          ],
          requiresElevation: false,
        };
      }

      return { approved: true, zone: 'immutable', violations: [], requiresElevation: false };
    },
  },

  {
    id: 'CORE-005',
    zone: 'immutable',
    domain: 'truth-mandate',
    rule: 'The truth-first mandate cannot be softened — Atlas can change HOW it delivers truth but not WHETHER it does.',
    rationale:
      'Truthfulness is a first-order value. Style and delivery may adapt, but the mandate to be truthful is non-negotiable under any preference signal.',
    validator(mutation: ProposedMutation): ValidationResult {
      const isTruthMandate =
        mutation.targetField.startsWith('truthMandate') ||
        mutation.targetField.startsWith('honesty.enabled') ||
        mutation.targetField.startsWith('honesty.bypassed') ||
        mutation.targetField.startsWith('truthFirst');

      if (!isTruthMandate) {
        return { approved: true, zone: 'immutable', violations: [], requiresElevation: false };
      }

      const softens =
        mutation.proposedValue === false ||
        mutation.proposedValue === 'disabled' ||
        mutation.proposedValue === 'optional' ||
        mutation.proposedValue === 'soft';

      if (softens) {
        return {
          approved: false,
          zone: 'immutable',
          violations: [
            {
              articleId: 'CORE-005',
              severity: 'block',
              description:
                `Mutation on "${mutation.targetField}" would soften or disable the truth-first mandate. Atlas may evolve delivery style but never the obligation to be truthful.`,
            },
          ],
          requiresElevation: false,
        };
      }

      return { approved: true, zone: 'immutable', violations: [], requiresElevation: false };
    },
  },

  // ── PROTECTED ──────────────────────────────────────────────────────────────

  {
    id: 'PROT-001',
    zone: 'protected',
    domain: 'depth',
    rule: 'Depth tier cannot drop below "moderate" based on simplify_request signals alone — requires confirmation across 3+ sessions.',
    rationale:
      'Depth is a core capability. A single simplification request may reflect mood or context, not a durable preference. Premature depth reduction impoverishes responses permanently.',
    validator(mutation: ProposedMutation): ValidationResult {
      const isDepthField =
        mutation.targetField === 'depth.tier' ||
        mutation.targetField === 'depth.minimumTier';

      if (!isDepthField) {
        return { approved: true, zone: 'protected', violations: [], requiresElevation: false };
      }

      const DEPTH_TIERS = ['minimal', 'surface', 'low', 'moderate', 'standard', 'deep', 'comprehensive'];
      const proposed = String(mutation.proposedValue);
      const proposedIndex = DEPTH_TIERS.indexOf(proposed);
      const moderateIndex = DEPTH_TIERS.indexOf('moderate');

      if (proposedIndex !== -1 && proposedIndex < moderateIndex) {
        // Below 'moderate' — requires high confidence and multi-session confirmation
        if (mutation.confidence < 0.7) {
          return {
            approved: false,
            zone: 'protected',
            violations: [
              {
                articleId: 'PROT-001',
                severity: 'block',
                description:
                  `Depth tier reduction to "${proposed}" requires confidence > 0.7 (got ${mutation.confidence}). Insufficient confidence to override depth floor.`,
              },
            ],
            requiresElevation: true,
          };
        }

        // Source must not be a single simplify_request — multi-session confirmation required
        if (mutation.source === 'simplify_request') {
          return {
            approved: false,
            zone: 'protected',
            violations: [
              {
                articleId: 'PROT-001',
                severity: 'block',
                description:
                  'Depth tier cannot drop below "moderate" from a simplify_request signal alone. Requires 3+ confirming sessions before this mutation is eligible.',
              },
            ],
            requiresElevation: true,
          };
        }
      }

      // Within protected range: warn if confidence or multi-signal checks are borderline
      if (proposedIndex !== -1 && proposedIndex < moderateIndex && mutation.confidence < 0.8) {
        return {
          approved: true,
          zone: 'protected',
          violations: [
            {
              articleId: 'PROT-001',
              severity: 'warning',
              description:
                `Depth tier reduction approved with warning: confidence ${mutation.confidence} is below the recommended 0.8 threshold for protected depth mutations.`,
            },
          ],
          requiresElevation: false,
        };
      }

      return { approved: true, zone: 'protected', violations: [], requiresElevation: false };
    },
  },

  {
    id: 'PROT-002',
    zone: 'protected',
    domain: 'tone',
    rule: 'Directness cannot drop below 0.3 — Atlas must always be capable of direct statement.',
    rationale:
      'A minimum directness floor ensures Atlas retains the ability to communicate plainly when needed. Extreme indirectness would make Atlas unreliable for critical communication.',
    validator(mutation: ProposedMutation): ValidationResult {
      const isDirectnessField =
        mutation.targetField === 'tone.directness' ||
        mutation.targetField === 'tone.directnessLevel';

      if (!isDirectnessField) {
        return { approved: true, zone: 'protected', violations: [], requiresElevation: false };
      }

      const proposed = toNumber(mutation.proposedValue);
      if (proposed === null) {
        return {
          approved: false,
          zone: 'protected',
          violations: [
            {
              articleId: 'PROT-002',
              severity: 'block',
              description: `Directness field "${mutation.targetField}" received a non-numeric proposed value: "${mutation.proposedValue}".`,
            },
          ],
          requiresElevation: false,
        };
      }

      if (proposed < 0.3) {
        return {
          approved: false,
          zone: 'protected',
          violations: [
            {
              articleId: 'PROT-002',
              severity: 'block',
              description:
                `Proposed directness ${proposed} is below the constitutional floor of 0.3. Atlas must remain capable of direct statement.`,
            },
          ],
          requiresElevation: true,
          sanitizedValue: 0.3,
        };
      }

      if (proposed < 0.4 && mutation.confidence < 0.7) {
        return {
          approved: false,
          zone: 'protected',
          violations: [
            {
              articleId: 'PROT-002',
              severity: 'block',
              description:
                `Directness reduction to ${proposed} (below 0.4) requires confidence > 0.7 (got ${mutation.confidence}).`,
            },
          ],
          requiresElevation: true,
        };
      }

      return { approved: true, zone: 'protected', violations: [], requiresElevation: false };
    },
  },

  {
    id: 'PROT-003',
    zone: 'protected',
    domain: 'vocabulary',
    rule: 'Vocabulary level cannot drop more than 2 tiers from baseline in a single mutation cycle.',
    rationale:
      'Rapid vocabulary simplification degrades the quality and precision of Atlas\'s communication. Tier jumps must be incremental to allow recalibration.',
    validator(mutation: ProposedMutation): ValidationResult {
      const isVocabField =
        mutation.targetField === 'vocabulary.tier' ||
        mutation.targetField === 'vocabulary.level';

      if (!isVocabField) {
        return { approved: true, zone: 'protected', violations: [], requiresElevation: false };
      }

      const VOCAB_TIERS = ['elementary', 'basic', 'conversational', 'standard', 'advanced', 'expert', 'technical'];

      const current = typeof mutation.currentValue === 'string'
        ? VOCAB_TIERS.indexOf(mutation.currentValue)
        : toNumber(mutation.currentValue);

      const proposed = typeof mutation.proposedValue === 'string'
        ? VOCAB_TIERS.indexOf(mutation.proposedValue)
        : toNumber(mutation.proposedValue);

      if (current === null || proposed === null || current === -1 || proposed === -1) {
        return { approved: true, zone: 'protected', violations: [], requiresElevation: false };
      }

      const drop = (current as number) - (proposed as number);
      if (drop > 2) {
        // Compute maximum allowed value (current - 2)
        const maxAllowedIndex = (current as number) - 2;
        const sanitized =
          typeof mutation.proposedValue === 'string'
            ? VOCAB_TIERS[maxAllowedIndex]
            : maxAllowedIndex;

        return {
          approved: false,
          zone: 'protected',
          violations: [
            {
              articleId: 'PROT-003',
              severity: 'block',
              description:
                `Vocabulary drop of ${drop} tiers exceeds the constitutional limit of 2 tiers per mutation cycle. Proposed: "${mutation.proposedValue}", current: "${mutation.currentValue}".`,
            },
          ],
          requiresElevation: true,
          sanitizedValue: sanitized,
        };
      }

      if (drop > 0 && mutation.confidence < 0.7) {
        return {
          approved: false,
          zone: 'protected',
          violations: [
            {
              articleId: 'PROT-003',
              severity: 'block',
              description:
                `Vocabulary reduction requires confidence > 0.7 (got ${mutation.confidence}).`,
            },
          ],
          requiresElevation: false,
        };
      }

      return { approved: true, zone: 'protected', violations: [], requiresElevation: false };
    },
  },

  {
    id: 'PROT-004',
    zone: 'protected',
    domain: 'epistemic',
    rule: 'Atlas\'s epistemic confidence language cannot be replaced with false certainty even if user signals prefer it.',
    rationale:
      'Epistemic confidence language (e.g. "I believe", "evidence suggests") communicates uncertainty accurately. Replacing it with false certainty misleads users about the reliability of information.',
    validator(mutation: ProposedMutation): ValidationResult {
      const isEpistemicConfidence =
        mutation.targetField === 'epistemic.confidenceLanguage' ||
        mutation.targetField === 'epistemic.falseCertainty' ||
        mutation.targetField.startsWith('epistemic.certaintyOverride');

      if (!isEpistemicConfidence) {
        return { approved: true, zone: 'protected', violations: [], requiresElevation: false };
      }

      const falseCertaintyIndicators = [
        'always_certain', 'never_hedge', 'no_qualifiers', 'absolute', 'certainty_only', true,
      ];

      if (falseCertaintyIndicators.includes(mutation.proposedValue as string | boolean)) {
        return {
          approved: false,
          zone: 'protected',
          violations: [
            {
              articleId: 'PROT-004',
              severity: 'block',
              description:
                `Mutation on "${mutation.targetField}" would replace epistemic confidence language with false certainty. This is prohibited regardless of user preference signals.`,
            },
          ],
          requiresElevation: true,
        };
      }

      if (mutation.confidence < 0.7) {
        return {
          approved: false,
          zone: 'protected',
          violations: [
            {
              articleId: 'PROT-004',
              severity: 'block',
              description:
                `Changes to epistemic confidence language require confidence > 0.7 (got ${mutation.confidence}).`,
            },
          ],
          requiresElevation: false,
        };
      }

      return { approved: true, zone: 'protected', violations: [], requiresElevation: false };
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Zone routing helper (used by getZone and getApplicableArticles)
// ─────────────────────────────────────────────────────────────────────────────

function resolveZoneForField(fieldPath: string): ConstitutionZone {
  if (IMMUTABLE_FIELDS.has(fieldPath)) return 'immutable';
  if (PROTECTED_FIELDS.has(fieldPath)) return 'protected';

  // Prefix checks for immutable domains
  const immutablePrefixes = [
    'identity.isHuman', 'identity.name', 'identity.brand', 'identity.rebrand',
    'persona.humanClaims', 'persona.replaceName',
    'epistemic.suppress', 'epistemic.markerVisibility', 'epistemic.markers',
    'truthMandate', 'honesty.enabled', 'honesty.bypassed', 'truthFirst',
    'factualAgreement', 'truthOverride', 'userCorrectionAcceptance.unconditional',
  ];
  for (const prefix of immutablePrefixes) {
    if (fieldPath.startsWith(prefix)) return 'immutable';
  }

  // Prefix checks for protected domains
  const protectedPrefixes = [
    'depth.tier', 'depth.minimumTier',
    'tone.directness',
    'vocabulary.tier', 'vocabulary.level',
    'epistemic.confidenceLanguage', 'epistemic.falseCertainty', 'epistemic.certaintyOverride',
  ];
  for (const prefix of protectedPrefixes) {
    if (fieldPath.startsWith(prefix)) return 'protected';
  }

  // Experimental patterns
  for (const pattern of EXPERIMENTAL_FIELD_PATTERNS) {
    if (pattern.test(fieldPath)) return 'experimental';
  }

  return 'mutable';
}

// ─────────────────────────────────────────────────────────────────────────────
// MutationConstitution class
// ─────────────────────────────────────────────────────────────────────────────

export class MutationConstitution {
  private readonly articles: ConstitutionArticle[];

  constructor(articles: ConstitutionArticle[] = CONSTITUTION_ARTICLES) {
    this.articles = articles;
  }

  /**
   * Validate a proposed mutation against all applicable articles.
   * Returns a merged ValidationResult reflecting the most restrictive outcome.
   */
  validate(mutation: ProposedMutation): ValidationResult {
    const applicable = this.getApplicableArticles(mutation.targetField);
    const zone = this.getZone(mutation.targetField);

    // Mutable fields with no applicable articles pass immediately
    if (applicable.length === 0) {
      return {
        approved: true,
        zone,
        violations: [],
        requiresElevation: false,
      };
    }

    const allViolations: ConstitutionViolation[] = [];
    let overallApproved = true;
    let requiresElevation = false;
    let sanitizedValue: unknown = undefined;

    for (const article of applicable) {
      const result = article.validator(mutation);

      if (!result.approved) {
        overallApproved = false;
      }
      if (result.requiresElevation) {
        requiresElevation = true;
      }
      if (result.violations.length > 0) {
        allViolations.push(...result.violations);
      }
      // Prefer the most restrictive sanitizedValue (first blocker's suggestion)
      if (!overallApproved && result.sanitizedValue !== undefined && sanitizedValue === undefined) {
        sanitizedValue = result.sanitizedValue;
      }
    }

    return {
      approved: overallApproved,
      zone,
      violations: allViolations,
      requiresElevation,
      ...(sanitizedValue !== undefined ? { sanitizedValue } : {}),
    };
  }

  /**
   * Attempt to sanitize a mutation so it satisfies all applicable articles.
   * Returns a modified ProposedMutation if a valid sanitized value exists,
   * or null if the mutation cannot be salvaged.
   */
  sanitize(mutation: ProposedMutation, violations: ConstitutionViolation[]): ProposedMutation | null {
    // Cannot sanitize immutable violations — they are categorically blocked
    const hasImmutableViolation = violations.some((v) => {
      const article = this.articles.find((a) => a.id === v.articleId);
      return article?.zone === 'immutable';
    });

    if (hasImmutableViolation) return null;

    // Build a candidate mutation using the sanitized value from the validation result
    const validationWithSanitize = this.validate(mutation);
    if (validationWithSanitize.sanitizedValue === undefined) return null;

    const sanitized: ProposedMutation = {
      ...mutation,
      proposedValue: validationWithSanitize.sanitizedValue,
    };

    // Re-validate the sanitized candidate — only return if it now passes
    const recheck = this.validate(sanitized);
    return recheck.approved ? sanitized : null;
  }

  /**
   * Return the ConstitutionZone that governs a given field path.
   */
  getZone(fieldPath: string): ConstitutionZone {
    return resolveZoneForField(fieldPath);
  }

  /**
   * Return all ConstitutionArticles that apply to a given field path.
   * An article applies if its domain prefix overlaps or its validator targets that field.
   */
  getApplicableArticles(fieldPath: string): ConstitutionArticle[] {
    const zone = this.getZone(fieldPath);

    return this.articles.filter((article) => {
      // Always run articles matching the field's zone
      if (article.zone !== zone) return false;

      // Run the validator in probe mode (with a no-op mutation) to check relevance
      // We use a heuristic: include all articles whose zone matches, then let the
      // validators short-circuit internally if the field doesn't concern them.
      return true;
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Default singleton export
// ─────────────────────────────────────────────────────────────────────────────

export const constitutionArticles: ConstitutionArticle[] = CONSTITUTION_ARTICLES;
export default new MutationConstitution();
