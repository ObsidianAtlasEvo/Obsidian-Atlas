/**
 * Phase 3 — merge primed Atlas identity with policy precedence + failure doctrine + evolution profile.
 */

import { PolicyPrecedenceEngine, PrecedenceLevel } from './policyPrecedence.js';
import { getFailureModeDoctrine } from '../resilience/failureModeDoctrine.js';
import type { UserEvolutionProfile } from '../types/evolutionTypes.js';

export interface ChatPolicyAssemblyInput {
  userId: string;
  /** Full primed system text (identity + substrate) before policy layering. */
  baseSystemPrompt: string;
  sessionMode?: string;
  evolutionProfile?: UserEvolutionProfile | null;
}

/**
 * Fresh engine per request — avoids cross-request instruction leakage.
 */
export function assembleLayeredSystemPrompt(input: ChatPolicyAssemblyInput): string {
  const engine = new PolicyPrecedenceEngine();

  engine.register({
    level: PrecedenceLevel.DEFAULT,
    type: 'append',
    content: input.baseSystemPrompt,
    source: 'atlas_identity',
    targetField: 'system_root',
  });

  const doctrine = getFailureModeDoctrine();
  const degraded = doctrine.buildMinimumViablePrompt().trim();
  if (degraded.length > 0) {
    engine.register({
      level: PrecedenceLevel.SAFETY_TRUTH,
      type: 'append',
      content: degraded,
      source: 'failure_mode_doctrine',
      targetField: 'degraded_notices',
    });
  }

  const profile = input.evolutionProfile;
  if (profile?.customInstructionsExcerpt?.trim()) {
    engine.register({
      level: PrecedenceLevel.USER_EVOLUTION,
      type: 'append',
      content: profile.customInstructionsExcerpt.trim(),
      source: 'evolution_profile',
      targetField: 'user_evolution_excerpt',
    });
  }

  for (const m of profile?.activeMutations ?? []) {
    const line = m.description?.trim();
    if (!line) continue;
    engine.register({
      level: PrecedenceLevel.USER_EVOLUTION,
      type: 'append',
      content: `[${m.type}] ${line} (confidence ${(m.confidence * 100).toFixed(0)}%, signal: ${m.sourceSignal})`,
      source: 'evolution_active_mutations',
      targetField: `mutation_${m.id}`,
    });
  }

  const stack = engine.resolve(input.userId, {
    userProfile: profile ?? null,
    activeFlags: [],
    evidenceState: null,
    sessionMode: input.sessionMode ?? 'chat',
  });

  const layered = engine.buildOrderedSystemPrompt(stack);
  return layered.trim().length > 0 ? layered : input.baseSystemPrompt;
}
