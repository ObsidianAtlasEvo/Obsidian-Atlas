import { z } from 'zod';

export const trajectoryHorizonSchema = z.enum(['near', 'medium']);
export type TrajectoryHorizon = z.infer<typeof trajectoryHorizonSchema>;

export const trajectoryDomainBandSchema = z.object({
  domain: z.string(),
  label: z.string(),
  classification: z.enum(['improving', 'stable', 'stagnating', 'degrading', 'split_signal']),
  momentum: z.number().min(-1).max(1),
  markers: z.array(z.string()),
  explanation: z.string(),
});

export type TrajectoryDomainBand = z.infer<typeof trajectoryDomainBandSchema>;

export const frictionTypeSchema = z.enum([
  'emotional',
  'cognitive',
  'logistical',
  'relational',
  'identity',
  'constitutional',
  'ambiguity',
  'overwhelm',
  'fear_avoidance',
  'perfectionism',
  'scattered_priorities',
  'hidden_contradiction',
  'overcommitment',
  'internal_conflict',
]);

export type FrictionType = z.infer<typeof frictionTypeSchema>;
