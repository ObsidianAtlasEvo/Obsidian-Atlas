/**
 * narrativeDeconstructionService.ts — Phase 0.97: Pure narrative deconstruction.
 */

export interface DeconstructedNarrative {
  claims: string[];
  assumptions: string[];
  framingDevices: string[];
  distortionRisk: number;
}

const CLAIM_KEYWORDS = /\b(is|are|will|has|have)\b/i;
const ASSUMPTION_KEYWORDS = /\b(assume|given that|since|because|therefore)\b/i;
const FRAMING_KEYWORDS = /\b(always|never|everyone|nobody|must|should|inevitable)\b/i;

/**
 * Pure: decompose narrative text into claims / assumptions / framing
 * devices, and compute a distortion risk score.
 */
export function deconstructNarrative(text: string): DeconstructedNarrative {
  if (!text) {
    return {
      claims: [],
      assumptions: [],
      framingDevices: [],
      distortionRisk: 0,
    };
  }
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const claims: string[] = [];
  const assumptions: string[] = [];
  const framingDevices: string[] = [];
  for (const s of sentences) {
    if (CLAIM_KEYWORDS.test(s)) claims.push(s);
    if (ASSUMPTION_KEYWORDS.test(s)) assumptions.push(s);
    if (FRAMING_KEYWORDS.test(s)) framingDevices.push(s);
  }
  const distortionRisk = computeDistortionRisk({ framingDevices, assumptions });
  return { claims, assumptions, framingDevices, distortionRisk };
}

/** Pure: compute distortion risk from framing/assumption density. */
export function computeDistortionRisk(narrative: {
  framingDevices: string[];
  assumptions: string[];
}): number {
  const score =
    narrative.framingDevices.length * 0.15 +
    narrative.assumptions.length * 0.1;
  return Math.max(0, Math.min(1, score));
}
