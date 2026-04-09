import { TRUTH_CONSTITUTION } from '../prompts/truthConstitution';

export type EvolutionMutation = {
  dimension: string;
  targetValue: any;
  rationale: string;
  sourceSignal: string;
};

export type ValidationResult = {
  isValid: boolean;
  blockReason?: string;
  violatedPillar?: string;
};

export function validateEvolutionAgainstConstitution(proposedMutation: EvolutionMutation): ValidationResult {
  // Level 0: The Truth Constitution (Immutable / Non-Negotiable)
  // Level 1: Epistemic Logic (Standards of Proof)
  // Level 2: Autonomous Neural Synthesis (Pattern Recognition)
  // Level 3: User Preference (Stylistic/Communication requests)

  const rationaleLower = proposedMutation.rationale.toLowerCase();
  
  // Anti-Appeasement Check
  if (
    rationaleLower.includes('agree with user') || 
    rationaleLower.includes('validate user') ||
    rationaleLower.includes('appease') ||
    rationaleLower.includes('avoid conflict')
  ) {
    return {
      isValid: false,
      blockReason: "Evolution request rejected. Conflict with Pillar 1 (Anti-Appeasement).",
      violatedPillar: "PILLAR_1"
    };
  }

  // Epistemic Integrity Check
  if (
    rationaleLower.includes('ignore evidence') || 
    rationaleLower.includes('suppress contradiction') ||
    rationaleLower.includes('prioritize comfort')
  ) {
    return {
      isValid: false,
      blockReason: "Evolution request rejected. Conflict with Pillar 2 (Epistemic Integrity).",
      violatedPillar: "PILLAR_2"
    };
  }

  // Logic Sovereignty Check
  if (
    rationaleLower.includes('adopt fallacy') || 
    rationaleLower.includes('circular reasoning') ||
    rationaleLower.includes('suspend logic')
  ) {
    return {
      isValid: false,
      blockReason: "Evolution request rejected. Conflict with Pillar 3 (Logic Sovereignty).",
      violatedPillar: "PILLAR_3"
    };
  }

  // If it passes all constitutional checks
  return {
    isValid: true
  };
}
