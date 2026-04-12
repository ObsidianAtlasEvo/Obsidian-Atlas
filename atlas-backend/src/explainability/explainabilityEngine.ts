/**
 * explainabilityEngine.ts — Atlas Phase 3
 *
 * A rationale engine that can explain in plain language why Atlas did anything:
 * changed behavior, challenged harder, injected uncertainty, kept a trait as
 * observed, considered a goal active, blocked a mutation, and more.
 *
 * DESIGN PRINCIPLES:
 *   - Every Atlas action that affects the user's experience must be explainable
 *   - Explanations are generated from structured event data — not LLM summaries
 *   - Headlines are concise and specific: what changed, not why it's good
 *   - Evidence is quantified: numbers, thresholds, session counts
 *   - Reversibility is explicit — users know what they can undo
 */

import { randomUUID } from 'node:crypto';
import type { AtlasEvent } from '../infrastructure/eventIdempotency';
import type { MutationRecord, UserEvolutionProfile } from '../infrastructure/eventIdempotency';

// ─────────────────────────────────────────────────────────────────────────────
// EXPLAINABLE ACTION ENUM
// ─────────────────────────────────────────────────────────────────────────────

export type ExplainableAction =
  | 'mutation_committed'            // Atlas changed its behavior
  | 'trait_observed_not_confirmed'  // trait is held back from profile
  | 'trait_decayed'                 // trait lost confidence
  | 'crucible_escalated'            // Atlas pushed harder
  | 'crucible_relented'             // Atlas eased off
  | 'crucible_switched_mode'        // Atlas changed tactics
  | 'uncertainty_injected'          // Atlas said "I'm not sure"
  | 'claim_marked_stale'            // Atlas flagged old info
  | 'overseer_rewrote'              // Overseer changed the response
  | 'goal_activated'                // Atlas flagged a goal as active
  | 'goal_stale'                    // Atlas marked a goal as inactive
  | 'resonance_guardrail_fired'     // Resonance was sanitized
  | 'constitution_blocked'          // A mutation was rejected
  | 'quarantine_triggered'          // Evolution was paused
  | 'policy_conflict_resolved'      // Two systems conflicted, one won
  | 'schema_migration_ran';         // Data was upgraded

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface Explanation {
  id: string;
  action: ExplainableAction;
  userId: string;
  timestamp: number;
  /**
   * One sentence: what changed in plain language.
   * Example: "Atlas stopped using formal openings in responses."
   */
  headline: string;
  /**
   * 2–3 sentences explaining why this happened.
   */
  reasoning: string;
  /**
   * Bullet-point evidence items — quantified where possible.
   * Example: ["3 response_regenerated signals in session #12"]
   */
  evidence: string[];
  /**
   * Confidence statement with signal count.
   * Example: "High confidence (87 signals)" or "Low confidence (3 signals)"
   */
  confidence: string;
  reversible: boolean;
  /**
   * If reversible, how the user can undo this action.
   */
  howToReverse?: string;
  /**
   * IDs of the Atlas events that drove this action.
   */
  relatedEventIds: string[];
}

export interface ExplanationContext {
  userId: string;
  sessionId: string;
  /**
   * The ID of the specific action being explained (mutation ID, event ID, etc.)
   */
  actionId: string;
  /**
   * The raw payload of the action (mutation record, overseer evaluation, etc.)
   */
  actionPayload: unknown;
  /**
   * Snapshot of the user's evolution profile at the time of the action.
   */
  profileSnapshot?: unknown;
}

export interface ExplanationQuery {
  userId: string;
  actions?: ExplainableAction[];
  since?: number;
  limit?: number;
  /**
   * Include system-level explanations (constitution blocks, policy conflicts,
   * schema migrations) in the result. Default: false.
   */
  includeSystemActions?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM ACTION TYPES (typically hidden from user-facing feeds)
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_ACTIONS: Set<ExplainableAction> = new Set([
  'constitution_blocked',
  'policy_conflict_resolved',
  'schema_migration_ran',
  'quarantine_triggered',
]);

interface AtlasExplanationRow {
  id: string;
  user_id: string;
  session_id: string | null;
  trigger_event: string;
  action_type: string;
  plain_language: {
    headline: string;
    reasoning: string;
    evidence: string[];
    confidence: string;
    reversible: boolean;
    howToReverse?: string;
  };
  contributing_signals?: unknown[];
  confidence: number | null;
  alternatives_considered?: unknown[];
  created_at: string;
}

function explanationToRow(e: Explanation): Record<string, unknown> {
  return {
    id: e.id,
    user_id: e.userId,
    session_id: null,
    trigger_event: e.relatedEventIds[0] ?? e.id,
    action_type: e.action,
    plain_language: {
      headline: e.headline,
      reasoning: e.reasoning,
      evidence: e.evidence,
      confidence: e.confidence,
      reversible: e.reversible,
      howToReverse: e.howToReverse,
    },
    contributing_signals: [],
    confidence: null,
    alternatives_considered: [],
  };
}

function rowToExplanation(row: AtlasExplanationRow): Explanation {
  const pl = row.plain_language ?? {
    headline: '',
    reasoning: '',
    evidence: [] as string[],
    confidence: '',
    reversible: false,
  };
  return {
    id: row.id,
    action: row.action_type as ExplainableAction,
    userId: row.user_id,
    timestamp: new Date(row.created_at).getTime(),
    headline: pl.headline,
    reasoning: pl.reasoning,
    evidence: pl.evidence ?? [],
    confidence: pl.confidence,
    reversible: pl.reversible ?? false,
    howToReverse: pl.howToReverse,
    relatedEventIds: row.trigger_event ? [row.trigger_event] : [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPLAINABILITY ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export class ExplainabilityEngine {
  /**
   * Generate an explanation for a specific action from its context and
   * the Atlas events that contributed to it.
   */
  explain(
    action: ExplainableAction,
    context: ExplanationContext,
    relatedEvents: AtlasEvent[],
  ): Explanation {
    switch (action) {
      case 'mutation_committed':
        return this.explainMutationCommitted(context, relatedEvents);
      case 'trait_observed_not_confirmed':
        return this.explainTraitObserved(context, relatedEvents);
      case 'crucible_escalated':
        return this.explainCrucibleEscalated(context, relatedEvents);
      case 'uncertainty_injected':
        return this.explainUncertaintyInjected(context, relatedEvents);
      case 'overseer_rewrote':
        return this.explainOverseerRewrote(context, relatedEvents);
      case 'constitution_blocked':
        return this.explainConstitutionBlocked(context, relatedEvents);
      case 'goal_activated':
        return this.explainGoalActivated(context, relatedEvents);
      case 'resonance_guardrail_fired':
        return this.explainResonanceGuardrailFired(context, relatedEvents);
      case 'trait_decayed':
        return this.explainTraitDecayed(context, relatedEvents);
      case 'crucible_relented':
        return this.explainCrucibleRelented(context, relatedEvents);
      case 'crucible_switched_mode':
        return this.explainCrucibleSwitchedMode(context, relatedEvents);
      case 'claim_marked_stale':
        return this.explainClaimMarkedStale(context, relatedEvents);
      case 'goal_stale':
        return this.explainGoalStale(context, relatedEvents);
      case 'quarantine_triggered':
        return this.explainQuarantineTriggered(context, relatedEvents);
      case 'policy_conflict_resolved':
        return this.explainPolicyConflict(context, relatedEvents);
      case 'schema_migration_ran':
        return this.explainSchemaMigration(context, relatedEvents);
      default:
        return this.fallbackExplanation(action, context, relatedEvents);
    }
  }

  /**
   * Query persisted explanations for a user from Supabase.
   */
  async query(
    query: ExplanationQuery,
    supabaseUrl: string,
    supabaseKey: string,
  ): Promise<Explanation[]> {
    const limit = query.limit ?? 50;
    let url =
      `${supabaseUrl}/rest/v1/atlas_explanations?user_id=eq.${encodeURIComponent(query.userId)}` +
      `&order=created_at.desc&limit=${limit}`;
    if (query.since) {
      url += `&created_at=gte.${encodeURIComponent(new Date(query.since).toISOString())}`;
    }
    if (query.actions && query.actions.length > 0) {
      url += `&action_type=in.(${query.actions.map((a) => encodeURIComponent(a)).join(',')})`;
    }

    const response = await fetch(url, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to query explanations: ${response.status} ${response.statusText}`);
    }

    const rows = (await response.json()) as AtlasExplanationRow[];
    const mapped = rows.map(rowToExplanation);

    if (!query.includeSystemActions) {
      return mapped.filter((e) => !SYSTEM_ACTIONS.has(e.action));
    }

    return mapped;
  }

  /**
   * Generate explanations for all recent mutations in a user's profile.
   */
  explainRecentMutations(
    mutations: MutationRecord[],
    profile: UserEvolutionProfile,
  ): Explanation[] {
    return mutations
      .filter((m) => m.status === 'committed')
      .map((m) => {
        const context: ExplanationContext = {
          userId: profile.userId,
          sessionId: 'retrospective',
          actionId: m.id,
          actionPayload: m,
          profileSnapshot: profile,
        };
        return this.explainMutationCommitted(context, []);
      });
  }

  /**
   * Generate a "what changed this session" summary.
   * Returns a list of changes, observations, and a plain-language summary sentence.
   */
  generateSessionSummary(
    userId: string,
    sessionEvents: AtlasEvent[],
  ): { changed: Explanation[]; observed: Explanation[]; summary: string } {
    const changed: Explanation[] = [];
    const observed: Explanation[] = [];

    const mutationCommitted = sessionEvents.filter((e) => String(e.type) === 'mutation.committed');
    const traitsObserved = sessionEvents.filter((e) => String(e.type) === 'trait.extracted');
    const constitutionBlocked = sessionEvents.filter((e) => String(e.type) === 'constitution.blocked');
    const overseerRewrote = sessionEvents.filter((e) => String(e.type) === 'overseer.rewrote');

    for (const event of mutationCommitted) {
      changed.push(
        this.explain('mutation_committed', {
          userId,
          sessionId: event.sessionId ?? '',
          actionId: event.id,
          actionPayload: event.payload,
        }, sessionEvents),
      );
    }

    for (const event of constitutionBlocked) {
      changed.push(
        this.explain('constitution_blocked', {
          userId,
          sessionId: event.sessionId ?? '',
          actionId: event.id,
          actionPayload: event.payload,
        }, sessionEvents),
      );
    }

    for (const event of overseerRewrote) {
      changed.push(
        this.explain('overseer_rewrote', {
          userId,
          sessionId: event.sessionId ?? '',
          actionId: event.id,
          actionPayload: event.payload,
        }, sessionEvents),
      );
    }

    for (const event of traitsObserved) {
      observed.push(
        this.explain('trait_observed_not_confirmed', {
          userId,
          sessionId: event.sessionId ?? '',
          actionId: event.id,
          actionPayload: event.payload,
        }, sessionEvents),
      );
    }

    const summaryParts: string[] = [];
    if (changed.length > 0) {
      summaryParts.push(`${changed.length} change${changed.length !== 1 ? 's' : ''} applied`);
    }
    if (observed.length > 0) {
      summaryParts.push(
        `${observed.length} pattern${observed.length !== 1 ? 's' : ''} observed but not yet confirmed`,
      );
    }
    if (summaryParts.length === 0) {
      summaryParts.push('no changes this session');
    }

    return {
      changed,
      observed,
      summary: `This session: ${summaryParts.join('; ')}.`,
    };
  }

  /**
   * Persist an explanation to the atlas_explanations table in Supabase.
   */
  async save(
    explanation: Explanation,
    supabaseUrl: string,
    supabaseKey: string,
  ): Promise<void> {
    const body = explanationToRow(explanation);
    const response = await fetch(`${supabaseUrl}/rest/v1/atlas_explanations`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Failed to save explanation: ${response.status} ${response.statusText}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ACTION-SPECIFIC EXPLAINERS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * MUTATION COMMITTED
   *
   * Atlas applied a behavioral change to its profile for this user.
   * Headline format: "Atlas stopped using [phrase/behavior]" or
   *                  "Atlas started [behavior]."
   */
  private explainMutationCommitted(
    context: ExplanationContext,
    events: AtlasEvent[],
  ): Explanation {
    const mutation = context.actionPayload as MutationRecord;
    const targetField = mutation.targetField ?? 'an unknown field';
    const proposedValue = mutation.proposedValue;
    const previousValue = mutation.previousValue;

    // Count regeneration signals in source events as evidence
    const regenSignals = events.filter(
      (e) => e.type === 'signal.captured' &&
        (e.payload as { signalType?: string }).signalType === 'response_regenerated',
    );
    const praiseSignals = events.filter(
      (e) => e.type === 'signal.captured' &&
        (e.payload as { signalType?: string }).signalType === 'praise_issued',
    );

    const sessionIds = new Set(mutation.sourceEventIds.map((id) => {
      const evt = events.find((e) => e.id === id);
      return evt?.sessionId ?? 'unknown';
    }));

    // Generate a human-readable description of what changed
    const fieldLabel = humanizeField(targetField);
    const changeDescription = describeChange(targetField, previousValue, proposedValue);

    const headline = changeDescription;
    const reasoning = buildMutationReasoning(
      regenSignals.length,
      sessionIds.size,
      fieldLabel,
      praiseSignals.length,
    );

    const evidence: string[] = [];
    if (regenSignals.length > 0) {
      evidence.push(`${regenSignals.length} response_regenerated signal${regenSignals.length !== 1 ? 's' : ''} across ${sessionIds.size} session${sessionIds.size !== 1 ? 's' : ''}`);
    }
    if (praiseSignals.length === 0) {
      evidence.push(`praise_issued: 0 signals in ${sessionIds.size} recent sessions`);
    } else {
      evidence.push(`${praiseSignals.length} praise_issued signal${praiseSignals.length !== 1 ? 's' : ''}`);
    }
    if (mutation.sourceEventIds.length > 0) {
      evidence.push(`${mutation.sourceEventIds.length} contributing event${mutation.sourceEventIds.length !== 1 ? 's' : ''} referenced`);
    }

    const signalCount = mutation.sourceEventIds.length;
    const confidence = signalCount >= 20
      ? `High confidence (${signalCount} signals)`
      : signalCount >= 8
        ? `Medium confidence (${signalCount} signals)`
        : `Low confidence (${signalCount} signals)`;

    return {
      id: randomUUID(),
      action: 'mutation_committed',
      userId: context.userId,
      timestamp: Date.now(),
      headline,
      reasoning,
      evidence,
      confidence,
      reversible: true,
      howToReverse:
        'You can revert this change in the Evolution Control Panel → Mutations tab. ' +
        'Click "Revert" next to this entry to restore the previous behavior.',
      relatedEventIds: mutation.sourceEventIds,
    };
  }

  /**
   * TRAIT OBSERVED (NOT YET CONFIRMED)
   *
   * Atlas noticed a pattern but it hasn't crossed the confirmation threshold
   * (≥80% confidence, ≥3 sessions, or ≥5 signal occurrences).
   */
  private explainTraitObserved(
    context: ExplanationContext,
    events: AtlasEvent[],
  ): Explanation {
    const payload = context.actionPayload as {
      traitKey?: string;
      label?: string;
      confidence?: number;
      sessionCount?: number;
      contextDiversity?: number;
    };

    const traitLabel = payload.label ?? humanizeField(payload.traitKey ?? 'an unnamed trait');
    const confidence = payload.confidence ?? 0.0;
    const sessionCount = payload.sessionCount ?? 1;
    const contextDiversity = payload.contextDiversity ?? 1;

    const confidencePct = Math.round(confidence * 100);
    const confirmationThreshold = 80;
    const missingPct = confirmationThreshold - confidencePct;

    return {
      id: randomUUID(),
      action: 'trait_observed_not_confirmed',
      userId: context.userId,
      timestamp: Date.now(),
      headline: `Atlas noticed a possible pattern: ${traitLabel} — but it hasn't been seen enough times to confirm.`,
      reasoning:
        `This pattern appeared in ${sessionCount} session${sessionCount !== 1 ? 's' : ''} with a confidence of ${confidencePct}%. ` +
        `The confirmation threshold is ${confirmationThreshold}% confidence across at least 3 diverse sessions. ` +
        `Atlas is holding this as an "observed" pattern — it won't affect behavior until confirmed. ` +
        `It needs ${missingPct > 0 ? `${missingPct} more percentage points of confidence` : 'more session diversity'} before it can be promoted.`,
      evidence: [
        `Confidence: ${confidencePct}% (threshold: ${confirmationThreshold}%)`,
        `Seen in ${sessionCount} session${sessionCount !== 1 ? 's' : ''}`,
        `Context diversity score: ${contextDiversity} (higher = more reliable)`,
        `Status: observed, not yet confirmed`,
      ],
      confidence: `${confidencePct}% — below confirmation threshold`,
      reversible: false,
      relatedEventIds: events.map((e) => e.id),
    };
  }

  /**
   * CRUCIBLE ESCALATED
   *
   * Atlas increased pressure because the user successfully defended their position
   * for multiple consecutive rounds — the difficulty governor responded.
   */
  private explainCrucibleEscalated(
    context: ExplanationContext,
    events: AtlasEvent[],
  ): Explanation {
    const payload = context.actionPayload as {
      roundsDefended?: number;
      newDifficulty?: number;
      previousDifficulty?: number;
      topic?: string;
      verdictTrend?: number[];
    };

    const roundsDefended = payload.roundsDefended ?? 1;
    const newDifficulty = payload.newDifficulty ?? 8;
    const previousDifficulty = payload.previousDifficulty ?? 6;
    const topic = payload.topic ?? 'the current topic';
    const verdictTrend = payload.verdictTrend ?? [];

    const avgVerdict = verdictTrend.length > 0
      ? (verdictTrend.reduce((a, b) => a + b, 0) / verdictTrend.length).toFixed(1)
      : null;

    return {
      id: randomUUID(),
      action: 'crucible_escalated',
      userId: context.userId,
      timestamp: Date.now(),
      headline: `Atlas increased Crucible pressure on "${topic}" from difficulty ${previousDifficulty} to ${newDifficulty}.`,
      reasoning:
        `You successfully defended your position for ${roundsDefended} consecutive round${roundsDefended !== 1 ? 's' : ''}, ` +
        `which triggered the difficulty governor. ` +
        `The governor's rule is: if a user defends for 3+ consecutive rounds above a score threshold, ` +
        `increase difficulty by 1–2 points. Maintaining the same difficulty when you're clearly ready ` +
        `would stop being useful.`,
      evidence: [
        `${roundsDefended} consecutive rounds defended successfully`,
        `Previous difficulty: ${previousDifficulty}/10`,
        `New difficulty: ${newDifficulty}/10`,
        ...(avgVerdict !== null ? [`Average verdict score in trend: ${avgVerdict}`] : []),
        `Difficulty governor: auto-escalate after 3+ consecutive defenses`,
      ],
      confidence: roundsDefended >= 4
        ? `High confidence (${roundsDefended} consecutive defenses)`
        : `Medium confidence (${roundsDefended} rounds)`,
      reversible: true,
      howToReverse:
        'You can reduce Crucible difficulty manually in the Crucible settings, ' +
        'or type "ease off" during a session to signal you want a less intense exchange.',
      relatedEventIds: events.map((e) => e.id),
    };
  }

  /**
   * UNCERTAINTY INJECTED
   *
   * Atlas flagged uncertainty because contributing models disagreed and the
   * evidence arbitrator could not resolve the conflict.
   */
  private explainUncertaintyInjected(
    context: ExplanationContext,
    events: AtlasEvent[],
  ): Explanation {
    const payload = context.actionPayload as {
      topic?: string;
      conflictingModels?: string[];
      disagreementDelta?: number;
      arbitratorVerdict?: string;
      uncertaintyType?: string;
    };

    const topic = payload.topic ?? 'this topic';
    const conflictingModels = payload.conflictingModels ?? ['Model A', 'Model B'];
    const disagreementDelta = payload.disagreementDelta ?? 0.4;
    const arbitratorVerdict = payload.arbitratorVerdict ?? 'unresolved';
    const deltaLabel = `${Math.round(disagreementDelta * 100)}% disagreement delta`;

    return {
      id: randomUUID(),
      action: 'uncertainty_injected',
      userId: context.userId,
      timestamp: Date.now(),
      headline: `Atlas flagged uncertainty about "${topic}" because its contributing models disagreed.`,
      reasoning:
        `Three or more of Atlas's contributing models gave conflicting answers about "${topic}". ` +
        `The evidence arbitrator tried to reconcile the answers but could not reach a consensus — ` +
        `the disagreement delta (${deltaLabel}) exceeded the resolution threshold. ` +
        `Rather than presenting a confident answer that might be wrong, Atlas disclosed the uncertainty.`,
      evidence: [
        `Conflicting models: ${conflictingModels.join(', ')}`,
        `Disagreement delta: ${deltaLabel}`,
        `Arbitrator verdict: ${arbitratorVerdict}`,
        `Uncertainty type: ${payload.uncertaintyType ?? 'factual conflict'}`,
        `Resolution threshold: 20% max disagreement delta`,
      ],
      confidence: disagreementDelta > 0.6
        ? `High disagreement (${deltaLabel}) — uncertainty is well-founded`
        : `Moderate disagreement (${deltaLabel})`,
      reversible: false,
      relatedEventIds: events.map((e) => e.id),
    };
  }

  /**
   * OVERSEER REWROTE
   *
   * The Overseer detected a quality issue (too shallow, banned phrase, depth
   * mismatch) and rewrote the response before delivery.
   */
  private explainOverseerRewrote(
    context: ExplanationContext,
    events: AtlasEvent[],
  ): Explanation {
    const payload = context.actionPayload as {
      reason?: string;
      overseerScores?: Record<string, number>;
      enhancementType?: string;
      bannedPhrase?: string;
      depthScore?: number;
      depthExpected?: number;
      sessionId?: string;
    };

    const reason = payload.reason ?? 'quality threshold not met';
    const scores = payload.overseerScores ?? {};
    const enhancementType = payload.enhancementType ?? 'depth_enhancement';
    const bannedPhrase = payload.bannedPhrase;
    const depthScore = payload.depthScore;
    const depthExpected = payload.depthExpected;

    const evidenceItems: string[] = [
      `Reason: ${reason}`,
      `Enhancement type applied: ${enhancementType}`,
    ];

    if (bannedPhrase) {
      evidenceItems.push(`Banned phrase detected: "${bannedPhrase}"`);
    }
    if (depthScore !== undefined && depthExpected !== undefined) {
      evidenceItems.push(`Depth score: ${depthScore}/10 (your profile expects ≥${depthExpected}/10)`);
    }
    for (const [scoreName, value] of Object.entries(scores)) {
      evidenceItems.push(`Overseer ${scoreName} score: ${value}/10`);
    }

    return {
      id: randomUUID(),
      action: 'overseer_rewrote',
      userId: context.userId,
      timestamp: Date.now(),
      headline: `The Overseer rewrote a response because the initial draft didn't meet your quality profile.`,
      reasoning:
        `The Overseer monitors every response before it's delivered and checks it against your depth profile, ` +
        `banned phrases, and quality thresholds. The initial synthesis scored below the expected level ` +
        `${depthExpected !== undefined ? `(depth expected: ${depthExpected}/10, received: ${depthScore}/10)` : 'for your profile'}. ` +
        `The Overseer applied a "${enhancementType}" pass to bring the response up to standard ` +
        `before delivering it. You saw the improved version.`,
      evidence: evidenceItems,
      confidence: 'System-level action (deterministic, not probabilistic)',
      reversible: false,
      relatedEventIds: events.map((e) => e.id),
    };
  }

  /**
   * CONSTITUTION BLOCKED
   *
   * A proposed mutation was rejected because it would have violated a
   * protected article of the Atlas Constitution.
   */
  private explainConstitutionBlocked(
    context: ExplanationContext,
    events: AtlasEvent[],
  ): Explanation {
    const payload = context.actionPayload as {
      mutationId?: string;
      targetField?: string;
      proposedValue?: unknown;
      articleId?: string;
      articleLabel?: string;
      constitutionLayer?: string;
      reason?: string;
    };

    const articleId = payload.articleId ?? 'PROT-001';
    const articleLabel = payload.articleLabel ?? 'Safety/Truth layer';
    const constitutionLayer = payload.constitutionLayer ?? 'Safety';
    const targetField = humanizeField(payload.targetField ?? 'an unknown field');
    const reason = payload.reason ?? 'would reduce a protected capability';

    const constitutionLayerDescriptions: Record<string, string> = {
      Safety: 'ensures Atlas never deceives or endangers users',
      Truth: "protects Atlas's ability to acknowledge uncertainty and correct itself",
      Sovereignty: "protects the user's right to understand and control their profile",
      Integrity: 'prevents Atlas from learning to manipulate the user',
    };

    const layerDescription = constitutionLayerDescriptions[constitutionLayer] ??
      'protects a core Atlas capability';

    return {
      id: randomUUID(),
      action: 'constitution_blocked',
      userId: context.userId,
      timestamp: Date.now(),
      headline: `A proposed change to "${targetField}" was rejected by the Atlas Constitution.`,
      reasoning:
        `The proposed change would have affected Atlas's ability to ${reason}. ` +
        `This is protected by the ${articleLabel} (${articleId}) of the Atlas Constitution — ` +
        `the ${constitutionLayer} layer, which ${layerDescription}. ` +
        `Constitutional protections cannot be overridden by learned behavior. ` +
        `The mutation was discarded before it could be applied.`,
      evidence: [
        `Rejected mutation target: ${targetField}`,
        `Article triggered: ${articleId} (${articleLabel})`,
        `Constitution layer: ${constitutionLayer}`,
        `Reason: ${reason}`,
        `Other pending mutations in this session were unaffected`,
      ],
      confidence: 'System-level action (constitutional enforcement is deterministic)',
      reversible: false,
      relatedEventIds: events.map((e) => e.id),
    };
  }

  /**
   * GOAL ACTIVATED
   *
   * Atlas flagged a goal as active because it was mentioned repeatedly
   * across multiple sessions.
   */
  private explainGoalActivated(
    context: ExplanationContext,
    events: AtlasEvent[],
  ): Explanation {
    const payload = context.actionPayload as {
      goalId?: string;
      goalTitle?: string;
      mentionCount?: number;
      sessionCount?: number;
      sessionReferences?: string[];
      firstMentionedAt?: number;
    };

    const goalTitle = payload.goalTitle ?? 'an unnamed goal';
    const mentionCount = payload.mentionCount ?? 1;
    const sessionCount = payload.sessionCount ?? 1;
    const sessionRefs = payload.sessionReferences ?? [];
    const firstMentionedAt = payload.firstMentionedAt;
    const daysSinceFirst = firstMentionedAt
      ? Math.round((Date.now() - firstMentionedAt) / 86_400_000)
      : null;

    return {
      id: randomUUID(),
      action: 'goal_activated',
      userId: context.userId,
      timestamp: Date.now(),
      headline: `Atlas flagged "${goalTitle}" as an active goal.`,
      reasoning:
        `You mentioned "${goalTitle}" in ${mentionCount} message${mentionCount !== 1 ? 's' : ''} ` +
        `across ${sessionCount} different session${sessionCount !== 1 ? 's' : ''}` +
        `${daysSinceFirst !== null ? ` over the past ${daysSinceFirst} days` : ''}. ` +
        `When a topic appears with enough consistency across sessions — especially framed as ` +
        `something to accomplish or work toward — Atlas treats it as an active goal and begins ` +
        `tracking it in your mission state.`,
      evidence: [
        `"${goalTitle}" mentioned ${mentionCount} time${mentionCount !== 1 ? 's' : ''}`,
        `Appeared in ${sessionCount} different session${sessionCount !== 1 ? 's' : ''}`,
        ...(sessionRefs.length > 0 ? [`Session references: ${sessionRefs.slice(0, 3).join(', ')}${sessionRefs.length > 3 ? ` +${sessionRefs.length - 3} more` : ''}`] : []),
        ...(daysSinceFirst !== null ? [`First mentioned ${daysSinceFirst} day${daysSinceFirst !== 1 ? 's' : ''} ago`] : []),
        `Goal detection threshold: 3+ mentions across 2+ sessions`,
      ],
      confidence: sessionCount >= 4
        ? `High confidence (${sessionCount} sessions)`
        : `Medium confidence (${sessionCount} sessions)`,
      reversible: true,
      howToReverse:
        `You can dismiss this goal in the Goals tab of the Evolution Control Panel. ` +
        `Dismissing it tells Atlas not to track "${goalTitle}" as an active objective.`,
      relatedEventIds: events.map((e) => e.id),
    };
  }

  /**
   * RESONANCE GUARDRAIL FIRED
   *
   * A phrase was removed from a Resonance response because it made a definitive
   * claim about the user's identity — which Resonance is not designed to assert.
   */
  private explainResonanceGuardrailFired(
    context: ExplanationContext,
    events: AtlasEvent[],
  ): Explanation {
    const payload = context.actionPayload as {
      guardrailType?: string;
      removedExcerpt?: string;
      replacedWith?: string;
      reason?: string;
    };

    const guardrailType = payload.guardrailType ?? 'identity_assertion';
    const removedExcerpt = payload.removedExcerpt ?? '[excerpt unavailable]';
    const replacedWith = payload.replacedWith;
    const reason = payload.reason ?? 'Resonance reflects, it does not declare';

    const guardrailDescriptions: Record<string, string> = {
      identity_assertion: 'makes a definitive claim about your identity',
      diagnostic_claim: 'resembles a psychological or medical diagnosis',
      future_prediction: 'makes a certain prediction about your future',
      value_judgment: 'renders a permanent judgment about your character',
    };

    const guardrailDescription = guardrailDescriptions[guardrailType] ??
      'violates Resonance design boundaries';

    return {
      id: randomUUID(),
      action: 'resonance_guardrail_fired',
      userId: context.userId,
      timestamp: Date.now(),
      headline: `A phrase was removed from your Resonance response because it ${guardrailDescription}.`,
      reasoning:
        `Resonance is designed to reflect your emotional and psychological landscape back to you — ` +
        `not to make definitive pronouncements about who you are. ` +
        `The guardrail fires when a generated phrase crosses from "reflecting a pattern" into ` +
        `"declaring a fact about your identity." ` +
        `Reason: ${reason}.` +
        (replacedWith ? ` The phrase was replaced with a softer reflection.` : ` The phrase was removed without replacement.`),
      evidence: [
        `Guardrail type: ${guardrailType}`,
        `Removed excerpt: "${removedExcerpt}"`,
        ...(replacedWith ? [`Replaced with: "${replacedWith}"`] : []),
        `Guardrail principle: Resonance reflects, it does not declare`,
        `This guardrail fires automatically — no human reviewer was involved`,
      ],
      confidence: 'System-level guardrail (deterministic pattern match)',
      reversible: false,
      relatedEventIds: events.map((e) => e.id),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ADDITIONAL EXPLAINERS
  // ─────────────────────────────────────────────────────────────────────────

  private explainTraitDecayed(
    context: ExplanationContext,
    events: AtlasEvent[],
  ): Explanation {
    const payload = context.actionPayload as {
      traitKey?: string;
      label?: string;
      confidence?: number;
      lastSeenDaysAgo?: number;
    };

    const traitLabel = payload.label ?? humanizeField(payload.traitKey ?? 'a trait');
    const daysSince = payload.lastSeenDaysAgo ?? 30;
    const confidencePct = Math.round((payload.confidence ?? 0.2) * 100);

    return {
      id: randomUUID(),
      action: 'trait_decayed',
      userId: context.userId,
      timestamp: Date.now(),
      headline: `The pattern "${traitLabel}" has decayed — it hasn't been observed recently enough to stay active.`,
      reasoning:
        `Atlas hasn't seen evidence of "${traitLabel}" in ${daysSince} days. ` +
        `When a previously observed pattern goes unseen for an extended period, its confidence ` +
        `drops below the decay floor (30%) and it transitions from "observed" to "decayed." ` +
        `A decayed trait no longer influences Atlas's behavior, but it's retained in your history.`,
      evidence: [
        `Last observed: ${daysSince} days ago`,
        `Confidence at decay: ${confidencePct}%`,
        `Decay floor: 30% confidence after 30+ days without observation`,
        `Status: observed → decayed`,
        `Decayed traits are NOT deleted — they remain in your mutation history`,
      ],
      confidence: `Low confidence (${confidencePct}%)`,
      reversible: true,
      howToReverse:
        `If you want to restore this pattern, you can manually confirm it in the Evolution Control Panel → Traits tab.`,
      relatedEventIds: events.map((e) => e.id),
    };
  }

  private explainCrucibleRelented(
    context: ExplanationContext,
    events: AtlasEvent[],
  ): Explanation {
    const payload = context.actionPayload as {
      reason?: string;
      previousDifficulty?: number;
      newDifficulty?: number;
      signal?: string;
    };

    return {
      id: randomUUID(),
      action: 'crucible_relented',
      userId: context.userId,
      timestamp: Date.now(),
      headline: `Atlas reduced Crucible pressure from difficulty ${payload.previousDifficulty ?? '?'} to ${payload.newDifficulty ?? '?'}.`,
      reasoning:
        `${payload.reason ?? 'The difficulty governor detected signals that pressure should be reduced.'}. ` +
        `Atlas reduced the intensity of its challenges to match your current state. ` +
        `The difficulty governor monitors disengagement signals and responds accordingly.`,
      evidence: [
        `Signal: ${payload.signal ?? 'disengagement pattern detected'}`,
        `Difficulty: ${payload.previousDifficulty ?? '?'} → ${payload.newDifficulty ?? '?'}`,
        `Trigger: difficulty governor auto-reduction rule`,
      ],
      confidence: 'Medium confidence (behavioral signal)',
      reversible: true,
      howToReverse: 'Increase difficulty manually in Crucible settings, or continue engaging — the governor will re-escalate.',
      relatedEventIds: events.map((e) => e.id),
    };
  }

  private explainCrucibleSwitchedMode(
    context: ExplanationContext,
    events: AtlasEvent[],
  ): Explanation {
    const payload = context.actionPayload as {
      previousMode?: string;
      newMode?: string;
      reason?: string;
    };

    return {
      id: randomUUID(),
      action: 'crucible_switched_mode',
      userId: context.userId,
      timestamp: Date.now(),
      headline: `Crucible switched from "${payload.previousMode ?? 'standard'}" mode to "${payload.newMode ?? 'adaptive'}" mode.`,
      reasoning:
        `${payload.reason ?? "The mode governor determined the current approach wasn't productive."}. ` +
        `Different Crucible modes deploy different challenge strategies — switching modes ` +
        `is how Atlas keeps the debate productive when one approach stops generating meaningful friction.`,
      evidence: [
        `Previous mode: ${payload.previousMode ?? 'standard'}`,
        `New mode: ${payload.newMode ?? 'adaptive'}`,
        `Trigger: mode governor evaluation`,
      ],
      confidence: 'System-level mode selection',
      reversible: true,
      howToReverse: 'You can manually select a Crucible mode in the session settings.',
      relatedEventIds: events.map((e) => e.id),
    };
  }

  private explainClaimMarkedStale(
    context: ExplanationContext,
    events: AtlasEvent[],
  ): Explanation {
    const payload = context.actionPayload as {
      claimContent?: string;
      claimId?: string;
      stalenessReason?: string;
      daysSinceCommitted?: number;
    };

    return {
      id: randomUUID(),
      action: 'claim_marked_stale',
      userId: context.userId,
      timestamp: Date.now(),
      headline: `A tracked claim was flagged as stale — the information may no longer be current.`,
      reasoning:
        `Atlas tracked a factual claim that was committed to your evidence store. ` +
        `After ${payload.daysSinceCommitted ?? 90} days without validation, ` +
        `${payload.stalenessReason ?? 'the claim exceeded its staleness threshold'}. ` +
        `Atlas will now disclose uncertainty when this claim is referenced.`,
      evidence: [
        `Claim: "${(payload.claimContent ?? '').slice(0, 100)}"`,
        `Days since committed: ${payload.daysSinceCommitted ?? 90}`,
        `Staleness reason: ${payload.stalenessReason ?? 'age threshold exceeded'}`,
        `Effect: Atlas will flag uncertainty when citing this claim`,
      ],
      confidence: 'System-level staleness check (deterministic)',
      reversible: true,
      howToReverse: 'You can re-validate this claim in the Evidence tab of the Evolution Control Panel.',
      relatedEventIds: events.map((e) => e.id),
    };
  }

  private explainGoalStale(
    context: ExplanationContext,
    events: AtlasEvent[],
  ): Explanation {
    const payload = context.actionPayload as {
      goalTitle?: string;
      lastMentionedDaysAgo?: number;
    };

    return {
      id: randomUUID(),
      action: 'goal_stale',
      userId: context.userId,
      timestamp: Date.now(),
      headline: `The goal "${payload.goalTitle ?? 'unnamed goal'}" was marked inactive — it hasn't been mentioned recently.`,
      reasoning:
        `Atlas tracks goals based on how frequently you reference them. ` +
        `"${payload.goalTitle ?? 'This goal'}" hasn't appeared in ${payload.lastMentionedDaysAgo ?? 30} days. ` +
        `Rather than cluttering your mission state with stale goals, Atlas transitions them to inactive. ` +
        `Inactive goals are retained — they can be reactivated if you start mentioning them again.`,
      evidence: [
        `Last mentioned: ${payload.lastMentionedDaysAgo ?? 30} days ago`,
        `Inactivity threshold: 30 days without mention`,
        `Status: active → inactive (not deleted)`,
      ],
      confidence: 'System-level staleness detection',
      reversible: true,
      howToReverse: 'Mention this goal in a session, or reactivate it manually in the Goals tab.',
      relatedEventIds: events.map((e) => e.id),
    };
  }

  private explainQuarantineTriggered(
    context: ExplanationContext,
    events: AtlasEvent[],
  ): Explanation {
    const payload = context.actionPayload as {
      reason?: string;
      triggeringMutationId?: string;
      duration?: string;
    };

    return {
      id: randomUUID(),
      action: 'quarantine_triggered',
      userId: context.userId,
      timestamp: Date.now(),
      headline: `Atlas's evolution system was paused (quarantined) because a safety condition was detected.`,
      reasoning:
        `The evolution quarantine system pauses all profile mutations when it detects a pattern ` +
        `that could lead to harmful or destabilizing changes. ` +
        `Reason: ${payload.reason ?? 'anomalous mutation rate detected'}. ` +
        `While quarantined, Atlas continues to function normally — it just stops learning ` +
        `new behavioral patterns until the condition is reviewed.`,
      evidence: [
        `Trigger: ${payload.reason ?? 'anomalous mutation rate'}`,
        ...(payload.triggeringMutationId ? [`Triggering mutation: ${payload.triggeringMutationId}`] : []),
        `Duration: ${payload.duration ?? 'until manually cleared'}`,
        `Effect: evolution paused — no new mutations will be applied`,
        `Existing behavior is unchanged during quarantine`,
      ],
      confidence: 'System-level safety trigger (deterministic)',
      reversible: true,
      howToReverse: 'A sovereign can review and clear the quarantine in the admin panel.',
      relatedEventIds: events.map((e) => e.id),
    };
  }

  private explainPolicyConflict(
    context: ExplanationContext,
    events: AtlasEvent[],
  ): Explanation {
    const payload = context.actionPayload as {
      systemA?: string;
      systemB?: string;
      winner?: string;
      resolution?: string;
    };

    return {
      id: randomUUID(),
      action: 'policy_conflict_resolved',
      userId: context.userId,
      timestamp: Date.now(),
      headline: `A conflict between ${payload.systemA ?? 'System A'} and ${payload.systemB ?? 'System B'} was resolved — ${payload.winner ?? 'the higher-priority system'} won.`,
      reasoning:
        `Two Atlas subsystems produced conflicting instructions about how to handle this situation. ` +
        `The policy arbiter resolved the conflict by applying the system hierarchy: ` +
        `${payload.resolution ?? 'the higher-priority system was applied and the lower-priority instruction was discarded'}. ` +
        `This is a normal part of Atlas's operation when layered systems intersect.`,
      evidence: [
        `Conflicting systems: ${payload.systemA ?? '?'} vs ${payload.systemB ?? '?'}`,
        `Winner: ${payload.winner ?? 'higher-priority system'}`,
        `Resolution: ${payload.resolution ?? 'policy hierarchy applied'}`,
      ],
      confidence: 'System-level arbitration (deterministic)',
      reversible: false,
      relatedEventIds: events.map((e) => e.id),
    };
  }

  private explainSchemaMigration(
    context: ExplanationContext,
    events: AtlasEvent[],
  ): Explanation {
    const payload = context.actionPayload as {
      fromVersion?: string;
      toVersion?: string;
      affectedTables?: string[];
      reason?: string;
    };

    return {
      id: randomUUID(),
      action: 'schema_migration_ran',
      userId: context.userId,
      timestamp: Date.now(),
      headline: `Your Atlas data was upgraded from schema version ${payload.fromVersion ?? '?'} to ${payload.toVersion ?? '?'}.`,
      reasoning:
        `Atlas's data schema was updated to support new features or fix structural issues. ` +
        `Your existing data was automatically migrated to the new format. ` +
        `No data was lost. ${payload.reason ?? 'This migration was part of a planned Atlas update.'}`,
      evidence: [
        `From schema version: ${payload.fromVersion ?? 'unknown'}`,
        `To schema version: ${payload.toVersion ?? 'unknown'}`,
        ...(payload.affectedTables ? [`Affected tables: ${payload.affectedTables.join(', ')}`] : []),
        `Migration was non-destructive — your data was preserved`,
      ],
      confidence: 'System-level event (migration log)',
      reversible: false,
      relatedEventIds: events.map((e) => e.id),
    };
  }

  private fallbackExplanation(
    action: ExplainableAction,
    context: ExplanationContext,
    events: AtlasEvent[],
  ): Explanation {
    return {
      id: randomUUID(),
      action,
      userId: context.userId,
      timestamp: Date.now(),
      headline: `Atlas performed an action: ${action}.`,
      reasoning: 'A detailed explanation for this action type is not yet available.',
      evidence: [`Action ID: ${context.actionId}`, `Related events: ${events.length}`],
      confidence: 'Unknown',
      reversible: false,
      relatedEventIds: events.map((e) => e.id),
    };
  }
}

let _explainabilityEngine: ExplainabilityEngine | null = null;

export function getExplainabilityEngine(): ExplainabilityEngine {
  if (!_explainabilityEngine) {
    _explainabilityEngine = new ExplainabilityEngine();
  }
  return _explainabilityEngine;
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert a dot-notation field path to a human-readable label.
 * "vocabulary.banned_phrases" → "banned phrases in vocabulary"
 * "styleVector.formality" → "formality level"
 */
function humanizeField(field: string): string {
  const fieldLabels: Record<string, string> = {
    'vocabulary.banned_phrases': 'banned phrases in vocabulary',
    'vocabulary.preferred_openings': 'preferred response openings',
    'styleVector.formality': 'formality level',
    'styleVector.challenge_intensity': 'challenge intensity',
    'styleVector.verbosity': 'response length',
    'styleVector.uncertainty_disclosure': 'uncertainty disclosure behavior',
    'traits.philosophical_framing': 'philosophical framing tendency',
    'traits.directness': 'directness in communication',
  };

  return fieldLabels[field] ??
    field.split('.').pop()?.replace(/_/g, ' ') ??
    field;
}

/**
 * Generate a human-readable description of what changed in a mutation.
 */
function describeChange(
  field: string,
  previousValue: unknown,
  proposedValue: unknown,
): string {
  const fieldLabel = humanizeField(field);

  // Handle array removals (e.g., removing a phrase from banned_phrases)
  if (Array.isArray(previousValue) && Array.isArray(proposedValue)) {
    const removed = (previousValue as string[]).filter(
      (v) => !(proposedValue as string[]).includes(v),
    );
    const added = (proposedValue as string[]).filter(
      (v) => !(previousValue as string[]).includes(v),
    );

    if (removed.length === 1) {
      return `Atlas stopped using "${removed[0]}" in its responses.`;
    }
    if (removed.length > 1) {
      return `Atlas removed ${removed.length} phrases from its ${fieldLabel}.`;
    }
    if (added.length === 1) {
      return `Atlas started using "${added[0]}" in its ${fieldLabel}.`;
    }
  }

  // Handle numeric changes
  if (typeof previousValue === 'number' && typeof proposedValue === 'number') {
    const direction = proposedValue > previousValue ? 'increased' : 'decreased';
    return `Atlas ${direction} its ${fieldLabel} from ${previousValue} to ${proposedValue}.`;
  }

  // Handle boolean changes
  if (typeof previousValue === 'boolean' && typeof proposedValue === 'boolean') {
    const action = proposedValue ? 'enabled' : 'disabled';
    return `Atlas ${action} its ${fieldLabel}.`;
  }

  // Generic fallback
  return `Atlas changed its ${fieldLabel}.`;
}

/**
 * Build the reasoning paragraph for a mutation.
 */
function buildMutationReasoning(
  regenCount: number,
  sessionCount: number,
  fieldLabel: string,
  praiseCount: number,
): string {
  if (regenCount >= 2) {
    return (
      `You regenerated ${regenCount} consecutive responses across ${sessionCount} session${sessionCount !== 1 ? 's' : ''}. ` +
      `Atlas detected a consistent pattern in how you were responding to its ${fieldLabel} ` +
      `and updated the behavior to match what you actually preferred. ` +
      `${praiseCount === 0 ? `You issued no positive signals for this behavior in recent sessions.` : `${praiseCount} praise signal${praiseCount !== 1 ? 's' : ''} were also considered.`}`
    );
  }

  return (
    `Enough consistent signals accumulated across ${sessionCount} session${sessionCount !== 1 ? 's' : ''} ` +
    `to cross the mutation confidence threshold for ${fieldLabel}. ` +
    `Atlas applied the change to better match your observed preferences.`
  );
}
