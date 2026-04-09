import { z } from 'zod';

export const routingTargetSchema = z.enum(['groq', 'gemini_pro', 'local_gpu', 'multi_agent']);
export type RoutingTarget = z.infer<typeof routingTargetSchema>;

export const groqRoutingDecisionSchema = z.object({
  target: routingTargetSchema,
  rationale: z.string().max(800).optional(),
});

export type GroqRoutingDecision = z.infer<typeof groqRoutingDecisionSchema>;
