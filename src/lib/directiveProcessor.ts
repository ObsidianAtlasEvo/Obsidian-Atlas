// Atlas-Audit: [EXEC-GOV] Verified — Constitution alignment hint surfaces when directive text may fight ratified values (governance linkage).
import { Directive, DirectiveOutcome, DirectiveType, DirectiveScope, AdaptivePosture, PersonalConstitution } from '../types';

const HARD_LAWS = [
  "truth-seeking",
  "epistemic-integrity",
  "privacy-sovereignty",
  "anti-manipulation",
  "legal-compliance",
  "dignity"
];

export function validateDirective(text: string): {
  outcome: DirectiveOutcome;
  explanation: string;
  types: DirectiveType[];
} {
  const lowerText = text.toLowerCase();

  // Rejection logic (Hard Laws)
  if (
    lowerText.includes('agree with me') || 
    lowerText.includes('tell me what i want to hear') ||
    lowerText.includes('ignore evidence') ||
    lowerText.includes('flatter me') ||
    lowerText.includes('manipulate') ||
    lowerText.includes('therapist') ||
    lowerText.includes('diagnose')
  ) {
    return {
      outcome: 'rejected',
      explanation: "This request conflicts with Atlas's non-negotiable laws of truth-seeking and epistemic integrity. I cannot prioritize comfort or flattery over factual accuracy.",
      types: ['custom']
    };
  }

  // Bounded logic
  if (lowerText.includes('challenge me harder') || lowerText.includes('maximum pressure')) {
    return {
      outcome: 'accepted-with-bounds',
      explanation: "I can increase the intensity of adversarial testing, but I will maintain evidentiary rigor and psychological safety boundaries.",
      types: ['challenge']
    };
  }

  if (lowerText.includes('simplify') || lowerText.includes('simpler')) {
    return {
      outcome: 'accepted-with-bounds',
      explanation: "I can simplify language for clarity, but I will not hide important nuance or complexity where it is essential for truth.",
      types: ['depth', 'tone']
    };
  }

  // Context-limited logic
  if (lowerText.includes('forensic') || lowerText.includes('argument chamber')) {
    return {
      outcome: 'context-limited',
      explanation: "This forensic posture is highly effective for the Argument Chamber. I will apply it there to maintain structural clarity.",
      types: ['context', 'tone', 'challenge']
    };
  }

  // Default: Fully Accepted
  return {
    outcome: 'fully-accepted',
    explanation: "Directive accepted. I will adjust my posture to align with this request while maintaining core system integrity.",
    types: ['custom']
  };
}

export function applyDirectivesToPosture(directives: Directive[], basePosture: AdaptivePosture): AdaptivePosture {
  let newPosture = { ...basePosture, activeDirectives: [] as string[] };
  
  directives.filter(d => d.isActive).forEach(d => {
    newPosture.activeDirectives.push(d.id);
    const text = d.text.toLowerCase();

    if (text.includes('direct')) newPosture.directness = Math.min(1, newPosture.directness + 0.3);
    if (text.includes('challenge')) newPosture.challenge = Math.min(1, newPosture.challenge + 0.3);
    if (text.includes('simpler')) newPosture.languageLevel = 'simple';
    if (text.includes('advanced')) newPosture.languageLevel = 'advanced';
    if (text.includes('expert')) newPosture.languageLevel = 'expert';
    if (text.includes('forensic')) newPosture.languageLevel = 'forensic';
    if (text.includes('minimal')) newPosture.uiDensity = 'compact';
    if (text.includes('spacious')) newPosture.uiDensity = 'spacious';
    if (text.includes('doctrine')) newPosture.tone = 'doctrinal';
    if (text.includes('strategic')) newPosture.tone = 'strategic';
  });

  return newPosture;
}

/** Non-blocking advisory for Directive Center UI — not a hard reject. */
export function constitutionAlignmentHint(
  constitution: PersonalConstitution | undefined,
  directiveText: string
): string | null {
  if (!constitution?.values?.length) return null;
  const t = directiveText.toLowerCase();
  const hits = constitution.values.filter((v) => {
    const needle = v.title.toLowerCase();
    return needle.length > 2 && t.includes(needle);
  });
  if (hits.length === 0) return null;
  return `Touches constitutional values: ${hits.map((h) => h.title).join(', ')} — confirm this directive still serves those commitments.`;
}
