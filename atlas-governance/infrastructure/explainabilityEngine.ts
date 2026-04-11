/**
 * Atlas Explainability Engine
 * Phase 4 Governance
 *
 * Produces understandable rationale for every significant Atlas behavior change.
 * Not just logs — human-readable explanations for WHY Atlas did what it did.
 */

import { AtlasEventBus, type AtlasEventType } from './eventBus';

export type ExplainableAction =
  | 'trait_observed'
  | 'trait_confirmed'
  | 'mutation_committed'
  | 'mutation_quarantined'
  | 'difficulty_escalated'
  | 'difficulty_reduced'
  | 'uncertainty_injected'
  | 'goal_active'
  | 'precedence_resolved'
  | 'degraded_mode_entered'
  | 'evolution_frozen';

export interface Explanation {
  id: string;
  userId: string;
  action: ExplainableAction;
  timestamp: string;
  summary: string;          // one sentence, plain language
  rationale: string;        // 2–3 sentences explaining the reasoning
  evidence: string[];       // what signals/data led to this
  confidence: number;       // 0–1
  reversible: boolean;
  howToRevert?: string;
}

const explanationStore: Map<string, Explanation[]> = new Map();

function getStore(userId: string): Explanation[] {
  if (!explanationStore.has(userId)) explanationStore.set(userId, []);
  return explanationStore.get(userId)!;
}

function uid(): string {
  return `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

const ACTION_TEMPLATES: Record<ExplainableAction, (details: Record<string, unknown>) => Pick<Explanation, 'summary' | 'rationale' | 'reversible' | 'howToRevert'>> = {
  trait_observed: (d) => ({
    summary: `Atlas noticed a pattern: ${d.trait as string} → "${d.value as string}".`,
    rationale: `This signal appeared in your ${d.source as string} and matched patterns associated with ${d.traitClass as string} behavior. It has been marked as "observed" (not yet confirmed) and will decay if not reinforced.`,
    reversible: true,
    howToRevert: 'Go to Evolution Control → Traits to remove or reset this observation.',
  }),
  trait_confirmed: (d) => ({
    summary: `Atlas confirmed a trait: ${d.trait as string} is now part of your profile.`,
    rationale: `This trait appeared across ${d.signalCount as number} independent signals with sufficient confidence. It will now influence how Atlas responds to you until you reset or it decays naturally.`,
    reversible: true,
    howToRevert: 'Use Evolution Control → Full Profile Reset or targeted trait reset.',
  }),
  mutation_committed: (d) => ({
    summary: `Atlas updated how it responds to you based on a new signal.`,
    rationale: `The signal "${(d.instruction as string).slice(0, 80)}…" passed constitutional validation and was committed. Signal strength was ${Math.round((d.signalStrength as number) * 100)}%.`,
    reversible: true,
    howToRevert: 'Use Evolution Control → Revert to roll back this specific mutation.',
  }),
  mutation_quarantined: (d) => ({
    summary: `An evolution signal was blocked because it violated a constitutional article.`,
    rationale: `The signal attempted to violate Article ${d.articleId as string} (${d.articleTitle as string}). It has been quarantined and will not affect Atlas behavior.`,
    reversible: false,
  }),
  difficulty_escalated: (d) => ({
    summary: `Crucible difficulty increased to "${d.mode as string}".`,
    rationale: `You correctly defended ${d.consecutiveCorrect as number} arguments in a row. Atlas escalated the challenge to match your demonstrated capability.`,
    reversible: true,
    howToRevert: 'Answer a question incorrectly or surrender — the governor will adjust.',
  }),
  difficulty_reduced: (d) => ({
    summary: `Crucible shifted to recovery mode.`,
    rationale: `After ${d.consecutiveIncorrect as number} consecutive struggles, Atlas reduced pressure to help you consolidate and rebuild momentum. This is not a retreat — it is a pedagogical decision.`,
    reversible: true,
    howToRevert: 'The governor will naturally escalate again once momentum is restored.',
  }),
  uncertainty_injected: (d) => ({
    summary: `Atlas added an uncertainty disclosure to its response.`,
    rationale: `The claim "${(d.claim as string).slice(0, 80)}…" had a confidence of ${Math.round((d.confidence as number) * 100)}%, which triggered a mandatory disclosure. Atlas is required to flag uncertain claims rather than assert them as fact.`,
    reversible: false,
  }),
  goal_active: (d) => ({
    summary: `Goal "${d.title as string}" is influencing Atlas's context.`,
    rationale: `This goal is marked as active with priority ${d.priority as number}. Atlas is weaving your mission context into responses to maintain continuity across sessions.`,
    reversible: true,
    howToRevert: 'Update the goal status to "paused" or "completed" in Goal Memory.',
  }),
  precedence_resolved: (d) => ({
    summary: `A conflict between governance systems was resolved.`,
    rationale: `Two systems provided competing instructions: ${d.layerA as string} and ${d.layerB as string}. The ${d.winner as string} layer won per the authority hierarchy. The lower-priority instruction was discarded.`,
    reversible: false,
  }),
  degraded_mode_entered: (d) => ({
    summary: `Atlas is operating in ${d.mode as string} mode due to a subsystem issue.`,
    rationale: `The ${d.subsystem as string} subsystem is ${d.health as string}. Atlas has fallen back to a reduced but safe operating mode. Core chat remains available.`,
    reversible: true,
    howToRevert: 'The system will automatically recover when the subsystem becomes healthy.',
  }),
  evolution_frozen: () => ({
    summary: `Evolution has been paused at your request.`,
    rationale: `Atlas will not adapt or accumulate new signals while evolution is frozen. All existing personalization remains intact — only new mutations are blocked.`,
    reversible: true,
    howToRevert: 'Use Evolution Control → Resume Evolution.',
  }),
};

/**
 * Record an explanation for a governance action.
 */
export function explain(
  userId: string,
  action: ExplainableAction,
  details: Record<string, unknown>,
  evidence: string[],
  confidence: number
): Explanation {
  const template = ACTION_TEMPLATES[action](details);
  const explanation: Explanation = {
    id: uid(),
    userId,
    action,
    timestamp: new Date().toISOString(),
    evidence,
    confidence,
    ...template,
  };

  getStore(userId).push(explanation);
  return explanation;
}

/**
 * Auto-wire to the event bus — call this once on app init.
 */
export function wireExplainabilityToEventBus(): void {
  const eventToAction: Partial<Record<AtlasEventType, ExplainableAction>> = {
    TRAIT_OBSERVED: 'trait_observed',
    TRAIT_CONFIRMED: 'trait_confirmed',
    MUTATION_COMMITTED: 'mutation_committed',
    MUTATION_QUARANTINED: 'mutation_quarantined',
    DEGRADED_MODE_ENTERED: 'degraded_mode_entered',
    EVOLUTION_FROZEN: 'evolution_frozen',
  };

  for (const [eventType, action] of Object.entries(eventToAction)) {
    AtlasEventBus.on(eventType as AtlasEventType, (event) => {
      explain(
        event.userId === 'system' ? 'system' : event.userId,
        action,
        event.payload as Record<string, unknown>,
        [`Event: ${event.type} from ${event.source}`],
        0.85
      );
    });
  }
}

export function getExplanations(userId: string, limit = 20): Explanation[] {
  return getStore(userId).slice(-limit).reverse();
}

export function getExplanationsForAction(userId: string, action: ExplainableAction): Explanation[] {
  return getStore(userId).filter((e) => e.action === action);
}
