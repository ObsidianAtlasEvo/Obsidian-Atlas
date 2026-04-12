import { z } from 'zod';
import type { PolicyProfile } from '../../types/atlas.js';

/**
 * Strict telemetry from PolicyProfile (no Memory Vault). Defaults for new users.
 */
export const userTelemetrySchema = z.object({
  verbosity: z.enum(['low', 'medium', 'high']).default('medium'),
  tone: z.enum(['direct', 'professional', 'warm', 'analytical']).default('analytical'),
  structurePreference: z.enum(['minimal', 'balanced', 'structured']).default('balanced'),
  truthFirstStrictness: z.number().int().min(1).max(10).default(7),
  preferredComputeDepth: z.enum(['Light', 'Heavy']).default('Light'),
  latencyTolerance: z.enum(['Low', 'High']).default('Low'),
  speedPreference: z.enum(['low', 'high']).default('high'),
  writingStyleEnabled: z.boolean().default(false),
});

export type UserTelemetry = z.infer<typeof userTelemetrySchema>;

/**
 * Mirrorforge / Resonance Chamber snapshot (optional). Client may POST a subset.
 * Aligns with frontend cognitive-state concepts without coupling to full `MirrorforgeModel`.
 */
export const mirrorforgeStateSchema = z.object({
  urgency: z.enum(['low', 'medium', 'high']).default('medium'),
  stress: z.enum(['low', 'medium', 'high']).default('low'),
  cognitiveLoad: z.enum(['low', 'medium', 'high']).default('medium'),
  /** How much epistemic rigor the session currently demands (Atlas-sensed). */
  epistemicDemand: z.enum(['low', 'medium', 'high']).default('medium'),
  /** Short free-text cue (e.g. dominant insight slug) — optional. */
  sessionNote: z.string().max(500).optional(),
});

export type MirrorforgeState = z.infer<typeof mirrorforgeStateSchema>;

export function parseMirrorforgeState(raw: unknown): MirrorforgeState {
  const p = mirrorforgeStateSchema.safeParse(raw);
  if (p.success) return p.data;
  return mirrorforgeStateSchema.parse({});
}

/** Map SQLite 0–1 strictness → 1–10 for Groq / Chief-of-Staff rules. */
export function truthStrictnessToDecile(truthFirstStrictness01: number): number {
  if (!Number.isFinite(truthFirstStrictness01)) return 7;
  const scaled = Math.round(truthFirstStrictness01 * 10);
  return Math.max(1, Math.min(10, scaled));
}

export function userTelemetryFromPolicyProfile(profile: PolicyProfile): UserTelemetry {
  const speedPreference: 'low' | 'high' = profile.latencyTolerance === 'High' ? 'low' : 'high';
  const raw = {
    verbosity: profile.verbosity,
    tone: profile.tone,
    structurePreference: profile.structurePreference,
    truthFirstStrictness: truthStrictnessToDecile(profile.truthFirstStrictness),
    preferredComputeDepth: profile.preferredComputeDepth,
    latencyTolerance: profile.latencyTolerance,
    speedPreference,
    writingStyleEnabled: profile.writingStyleEnabled,
  };
  const parsed = userTelemetrySchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return userTelemetrySchema.parse({});
}

export interface GroqRoutingDirectives {
  /** User is in a hurry — strongly prefer fast Groq path; avoid premium latency unless unavoidable. */
  force_speed_path: boolean;
  /** Prefer Gemini / multi-step / swarm depth for verification & large context. */
  bias_heavy_models: boolean;
  /** When true, Chief should not route to premium OpenRouter models solely for speed. */
  skip_premium_for_speed: boolean;
  /** Narrated rule summary for the LLM (deterministic, short). */
  directive_notes: string[];
}

/**
 * Deterministic translation: Policy + Mirrorforge → machine-readable directives for Groq.
 */
export function buildGroqRoutingDirectives(
  policy: PolicyProfile,
  mirrorforge: MirrorforgeState,
  userTelemetry: UserTelemetry
): GroqRoutingDirectives {
  const notes: string[] = [];
  let force_speed_path = false;
  let bias_heavy_models = false;
  let skip_premium_for_speed = false;

  if (mirrorforge.urgency === 'high') {
    force_speed_path = true;
    skip_premium_for_speed = true;
    notes.push('Mirrorforge.urgency=high → force_speed_path: prefer groq-llama3-70b direct; skip slower specialists unless task strictly requires them.');
  }

  if (mirrorforge.stress === 'high' && mirrorforge.urgency !== 'low') {
    force_speed_path = true;
    notes.push('Mirrorforge.stress=high → shorten time-to-first-token; avoid swarm unless userTelemetry demands depth.');
  }

  if (userTelemetry.truthFirstStrictness > 8 || mirrorforge.epistemicDemand === 'high') {
    bias_heavy_models = true;
    notes.push('High epistemic rigor → bias gemini-2.5-flash or claude-3-5-sonnet / swarm for verification-heavy work.');
  }

  if (policy.preferredComputeDepth === 'Heavy' && mirrorforge.urgency !== 'high') {
    bias_heavy_models = true;
    notes.push('Policy.preferredComputeDepth=Heavy → allow gemini / claude / gpt-4o / swarm.');
  }

  if (userTelemetry.verbosity === 'low' && userTelemetry.speedPreference === 'high') {
    force_speed_path = true;
    notes.push('UserTelemetry: low verbosity + high speed → prefer direct groq-llama3-70b.');
  }

  if (userTelemetry.latencyTolerance === 'High' && mirrorforge.urgency !== 'high') {
    skip_premium_for_speed = false;
    notes.push('User accepts latency → premium / swarm allowed when quality warrants.');
  }

  if (force_speed_path && bias_heavy_models && mirrorforge.urgency === 'high') {
    notes.push('Conflict: urgency overrides — satisfy speed first; use groq unless prompt explicitly requires long-context or code-elite work.');
    bias_heavy_models = false;
  }

  return {
    force_speed_path,
    bias_heavy_models,
    skip_premium_for_speed,
    directive_notes: notes,
  };
}

export interface ChiefRoutingPayload {
  ROUTING_METADATA: {
    sovereign_eligible: boolean;
    user_prompt: string;
    conversation_snippet: string;
  };
  UserTelemetry: UserTelemetry;
  MirrorforgeSignal: MirrorforgeState;
  GROQ_ROUTING_DIRECTIVES: GroqRoutingDirectives;
}

export function buildChiefRoutingPayload(input: {
  userPrompt: string;
  conversationSnippet?: string;
  sovereignEligible: boolean;
  policyProfile: PolicyProfile;
  mirrorforge?: Partial<MirrorforgeState> | undefined;
  userTelemetryOverride?: UserTelemetry | undefined;
}): ChiefRoutingPayload {
  const userTelemetry =
    input.userTelemetryOverride ?? userTelemetryFromPolicyProfile(input.policyProfile);
  const mirrorforge = parseMirrorforgeState(input.mirrorforge ?? {});

  return {
    ROUTING_METADATA: {
      sovereign_eligible: input.sovereignEligible,
      user_prompt: input.userPrompt.slice(0, 12_000),
      conversation_snippet: (input.conversationSnippet ?? '').slice(0, 4000),
    },
    UserTelemetry: userTelemetry,
    MirrorforgeSignal: mirrorforge,
    GROQ_ROUTING_DIRECTIVES: buildGroqRoutingDirectives(
      input.policyProfile,
      mirrorforge,
      userTelemetry
    ),
  };
}
