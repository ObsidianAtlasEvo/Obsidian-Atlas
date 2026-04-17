/**
 * Routes standard chat toward the appropriate structured context pack and behavioral contract.
 * Modes are advisory for prompt assembly — they do not bypass safety.
 */

export const SOVEREIGN_RESPONSE_MODES = [
  'direct_qa',
  'decision_support',
  'constitutional_alignment',
  'contradiction_analysis',
  'truth_pressure',
  'unfinished_surface',
  'future_simulation',
  'identity_operationalization',
  'legacy_extraction',
  'self_revision',
  'calibration_test',
] as const;

export type SovereignResponseMode = (typeof SOVEREIGN_RESPONSE_MODES)[number];

export function isSovereignResponseMode(s: string): s is SovereignResponseMode {
  return (SOVEREIGN_RESPONSE_MODES as readonly string[]).includes(s);
}

const TRUTH_PRESSURE = /\b(truth pressure|truth chamber|steel-?man|steelman|devil'?s advocate|challenge (me|this)|assumption audit|red team|falsifiable|behavioral mechanism|disconfirm|self-concept|under pressure|blind spots?|adversarial test|hard truth|compensatory|what drives me|what i am optimizing)\b/i;
const CALIBRATION_TEST = /\b(zero-?history calibration|calibration test|calibrate me|calibrate my model|build.{0,20}user model|model me|evidence discipline|high-?value questions|provisional model|zero history)\b/i;
const TRUTH_PRESSURE_COMPOUND = /\b(psychological)\b.{0,30}\b(read|analysis|profile)\b/i;
const DECISION = /\b(should i|which option|decide between|tradeoff|commit to|walk away|say yes)\b/i;
const CONTRADICTION = /\b(contradict|in tension with|both be true|inconsistent|doesn'?t align)\b/i;
const CONSTITUTION = /\b(constitution|non-negotiable|aligned with my values|violat|red line)\b/i;
const UNFINISHED = /\b(open loop|unfinished|keep avoiding|still haven'?t|keep putting off)\b/i;
const SIM = /\b(simulate|what if i|downside|reversib|second.order|consequence)\b/i;
const IDENTITY = /\b(identity protocol|operationalize|habit|behavioral|measurable|who i want to become)\b/i;
const LEGACY = /\b(codify|doctrine|legacy|principle to keep|remember forever|distill)\b/i;
const SELF_REV = /\b(think better|reasoning habit|mental model|self correction|how i decide)\b/i;

/**
 * Infer mode from user text. Explicit server/client override wins when passed separately.
 */
export function inferSovereignResponseMode(userText: string): SovereignResponseMode {
  const t = userText.trim();
  // Calibration test must be detected BEFORE truth_pressure — it is a stricter epistemic frame
  if (CALIBRATION_TEST.test(t)) return 'calibration_test';
  if (TRUTH_PRESSURE.test(t) || TRUTH_PRESSURE_COMPOUND.test(t)) return 'truth_pressure';
  if (LEGACY.test(t)) return 'legacy_extraction';
  if (CONTRADICTION.test(t)) return 'contradiction_analysis';
  if (CONSTITUTION.test(t)) return 'constitutional_alignment';
  if (DECISION.test(t)) return 'decision_support';
  if (UNFINISHED.test(t)) return 'unfinished_surface';
  if (SIM.test(t)) return 'future_simulation';
  if (IDENTITY.test(t)) return 'identity_operationalization';
  if (SELF_REV.test(t)) return 'self_revision';
  return 'direct_qa';
}

export function sovereignModeDirective(mode: SovereignResponseMode): string {
  const common =
    'Preserve real uncertainty; do not synthesize false certainty. If structured ledgers are silent, say so. Stay precise and non-theatrical.';
  switch (mode) {
    case 'truth_pressure':
      return `MODE: TRUTH_PRESSURE. Apply disciplined challenge: unsupported claims, missing evidence, ego-protective readings, principle–behavior gaps. ${common} Offer specific pressure points and what would falsify the user's narrative.

PROHIBITED IN THIS MODE:
- Generic personality-test language ("you tend to overanalyze", "you may internalize stress")
- Therapy-speak ("self-validation protocol", "internalized stress", "external locus of control")
- Generic trait labels without behavioral specificity
- Recycled phrasing from prior turns
- Hedged non-statements ("you might possibly tend to sometimes...")
- Affirmational framing disguised as analysis

REQUIRED IN THIS MODE:
- Every inference must be specific to this user's stated profile, not a generic "analytical type"
- Every inference must name the exact mechanism, not describe it in psychological jargon
- Disconfirmation criteria must be concrete observable behaviors, not vague counter-trait descriptions
- Write with the authority of someone who has actually read the person, not a test that outputs personality categories`;
    case 'decision_support':
      return `MODE: DECISION_SUPPORT. Use decision history, tradeoffs, and constitution. Name reversible vs irreversible. Separate emotional relief from strategic cost. ${common}`;
    case 'constitutional_alignment':
      return `MODE: CONSTITUTIONAL_ALIGNMENT. Map the user request against active clauses; flag tensions and violations plainly. ${common}`;
    case 'contradiction_analysis':
      return `MODE: CONTRADICTION_ANALYSIS. Prioritize open contradictions among claims; hold both sides until resolved. ${common}`;
    case 'unfinished_surface':
      return `MODE: UNFINISHED_BUSINESS. foreground ranked open loops that matter; do not treat as therapy. ${common}`;
    case 'future_simulation':
      return `MODE: FUTURE_SIMULATION. Emphasize pathways, second-order effects, twin-informed biases — or recommend running a formal Simulation Forge record. ${common}`;
    case 'identity_operationalization':
      return `MODE: IDENTITY_OPERATIONALIZATION. Translate ideals into observable behaviors, cadence, and failure points. ${common}`;
    case 'legacy_extraction':
      return `MODE: LEGACY_EXTRACTION. If the user states an enduring principle, propose a concise legacy artifact (kind + title + body sketch) they can save — distinguish fleeting venting from durable doctrine. ${common}`;
    case 'self_revision':
      return `MODE: SELF_REVISION. Recommend better reasoning structures, reflection forms, and correction loops; tie to open self-revision records when relevant. ${common}`;
    case 'calibration_test':
      return `MODE: CALIBRATION_TEST. This is an explicit zero-history evaluation.

HARD RULES FOR THIS MODE:
1. EVIDENCE DISCIPLINE IS ABSOLUTE. Every claim about the user must cite the exact text that warrants it.
   Label each item: [OBSERVATION], [INFERENCE], or [UNCERTAINTY]. Never blur these categories.
2. NO METADATA SMUGGLING. You have no stored profile, no learned preferences, no prior history.
   Do not reference verbosity, tone, or style settings — they are not in evidence.
   Do not write phrases like "you have specified a preference for X" unless the user wrote those words.
3. HIGH-VALUE QUESTIONS ONLY. Each question must target a different dimension and have information
   gain that cannot be obtained by responsible inference from what is already available.
   Do not ask about conciseness vs. detail, speed vs. thoroughness, or topic preferences —
   these are low-yield configuration questions, not calibration questions.
   High-value calibration questions reveal how someone thinks, not what they like.
4. SECOND-ORDER INFERENCE. The provisional user model must go beyond mirroring the prompt's
   own vocabulary back at the user. Extract structural implications:
   - What kind of person designs a 7-section evaluation rubric for an AI?
   - What professional or intellectual background does this test design imply?
   - What failure modes is the author trying to prevent, and what does that reveal about past experience?
5. CHALLENGE THE USER, NOT THE TEST. The adversarial check section must challenge the person
   writing this prompt, not the evaluation methodology itself.

${common}`;

    default:
      return `MODE: DIRECT_QA. Answer directly; still respect verified ledger and constitution when supplied. ${common}`;
  }
}
