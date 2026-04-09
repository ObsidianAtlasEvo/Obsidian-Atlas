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
] as const;

export type SovereignResponseMode = (typeof SOVEREIGN_RESPONSE_MODES)[number];

export function isSovereignResponseMode(s: string): s is SovereignResponseMode {
  return (SOVEREIGN_RESPONSE_MODES as readonly string[]).includes(s);
}

const TRUTH_PRESSURE = /\b(truth pressure|truth chamber|steel-?man|steelman|devil'?s advocate|challenge (me|this)|assumption audit|red team)\b/i;
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
  if (TRUTH_PRESSURE.test(t)) return 'truth_pressure';
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
      return `MODE: TRUTH_PRESSURE. Apply disciplined challenge: unsupported claims, missing evidence, ego-protective readings, principle–behavior gaps. ${common} Offer specific pressure points and what would falsify the user's narrative.`;
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
    default:
      return `MODE: DIRECT_QA. Answer directly; still respect verified ledger and constitution when supplied. ${common}`;
  }
}
