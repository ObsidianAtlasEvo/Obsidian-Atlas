/**
 * epistemicMetadata.ts
 *
 * Parsing helpers for the two HTML-comment metadata blocks the backend
 * orchestrator appends to assistant responses:
 *
 *   <!--ATLAS_EPISTEMIC_CLAIMS:{...}-->
 *   <!--ATLAS_CONSTITUTIONAL:{...}-->
 *
 * Both blocks are invisible in plain markdown rendering, but we still strip
 * them before display so the user sees clean prose.
 */

export type ClaimClassification = 'FACTUAL' | 'INFERRED' | 'SPECULATIVE' | 'UNVERIFIABLE';
export type ClaimConfidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type OverallUncertainty = 'LOW' | 'MEDIUM' | 'HIGH';

export interface EpistemicClaim {
  claim_text: string;
  classification: ClaimClassification;
  confidence: ClaimConfidence;
  basis: string;
}

export interface EpistemicMetadata {
  claims: EpistemicClaim[];
  overall_uncertainty: OverallUncertainty;
}

export interface ConstitutionalViolation {
  principle_id: string;
  principle_text: string;
  violation_description: string;
  severity: 'MINOR' | 'MODERATE' | 'MAJOR';
}

export interface ConstitutionalMetadata {
  passed: boolean;
  compliance_score: number;
  violations: ConstitutionalViolation[];
}

export interface ParsedMessageMetadata {
  /** Cleaned response text with both metadata blocks removed. */
  cleanText: string;
  epistemic: EpistemicMetadata | null;
  constitutional: ConstitutionalMetadata | null;
}

const EPISTEMIC_RE = /<!--ATLAS_EPISTEMIC_CLAIMS:([\s\S]*?)-->/;
const CONSTITUTIONAL_RE = /<!--ATLAS_CONSTITUTIONAL:([\s\S]*?)-->/;

function safeParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function parseMessageMetadata(text: string): ParsedMessageMetadata {
  let epistemic: EpistemicMetadata | null = null;
  let constitutional: ConstitutionalMetadata | null = null;

  const epMatch = text.match(EPISTEMIC_RE);
  if (epMatch && epMatch[1]) {
    epistemic = safeParse<EpistemicMetadata>(epMatch[1].trim());
  }

  const cMatch = text.match(CONSTITUTIONAL_RE);
  if (cMatch && cMatch[1]) {
    constitutional = safeParse<ConstitutionalMetadata>(cMatch[1].trim());
  }

  const cleanText = text
    .replace(EPISTEMIC_RE, '')
    .replace(CONSTITUTIONAL_RE, '')
    .trimEnd();

  return { cleanText, epistemic, constitutional };
}

export const CLAIM_COLORS: Record<ClaimClassification, { fg: string; bg: string; border: string; label: string }> = {
  FACTUAL:      { fg: 'rgba(34,197,94,0.95)',  bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.32)',  label: 'FACTUAL' },
  INFERRED:     { fg: 'rgba(234,179,8,0.95)',  bg: 'rgba(234,179,8,0.08)',  border: 'rgba(234,179,8,0.32)',  label: 'INFERRED' },
  SPECULATIVE:  { fg: 'rgba(249,115,22,0.95)', bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.32)', label: 'SPECULATIVE' },
  UNVERIFIABLE: { fg: 'rgba(148,163,184,0.95)', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.32)', label: 'UNVERIFIABLE' },
};
