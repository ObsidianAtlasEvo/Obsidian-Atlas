import { z } from 'zod';
import type { EvalResult } from '../evolution/evalEngine.js';
import { getPolicyProfile, updatePolicyProfile } from '../evolution/policyStore.js';

/**
 * Partial policy fields the Chrysalis loop may adjust from epistemic telemetry (Zod-validated).
 */
const telemetryEvolutionPatchSchema = z.object({
  preferredComputeDepth: z.enum(['Light', 'Heavy']).optional(),
  latencyTolerance: z.enum(['Low', 'High']).optional(),
  truthFirstStrictness: z.number().min(0).max(1).optional(),
});

/**
 * Feedback loop: nudge `preferredComputeDepth`, `latencyTolerance`, and 0–1 `truthFirstStrictness`
 * from evaluator axes so the Omni-Router’s {@link UserTelemetry} stays aligned with reality.
 */
export function evolvePolicyTelemetryFromEval(userId: string, evalResult: EvalResult): void {
  const current = getPolicyProfile(userId);
  const patch: z.infer<typeof telemetryEvolutionPatchSchema> = {};

  if (evalResult.truthAlignment <= 5 || evalResult.combinedNormalized < 0.45) {
    patch.preferredComputeDepth = 'Heavy';
    patch.latencyTolerance = 'High';
  }

  if (evalResult.truthAlignment >= 9 && evalResult.combinedNormalized >= 0.82) {
    patch.truthFirstStrictness = Math.min(1, current.truthFirstStrictness + 0.02);
  }

  if (evalResult.cognitiveDensity >= 9 && !evalResult.gapFlagged) {
    patch.latencyTolerance = 'High';
  }

  const safe = telemetryEvolutionPatchSchema.safeParse(patch);
  if (!safe.success || Object.keys(safe.data).length === 0) return;

  updatePolicyProfile(userId, safe.data);
}
