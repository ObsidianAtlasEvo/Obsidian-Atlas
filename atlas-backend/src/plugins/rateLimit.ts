import type { FastifyInstance, FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';

export const RATE_LIMITS = {
  readUser:     { max: 60,  timeWindow: '1 minute' },
  writeUser:    { max: 20,  timeWindow: '1 minute' },
  heavyCompute: { max: 5,   timeWindow: '1 minute' },
  destructive:  { max: 3,   timeWindow: '1 hour' },
  sseStream:    { max: 5,   timeWindow: '1 minute' },
  deploy:       { max: 2,   timeWindow: '10 minutes' },
} as const;

export async function registerRateLimit(app: FastifyInstance): Promise<void> {
  await app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: (req: FastifyRequest) => {
      const forwarded = req.headers['x-forwarded-for'];
      const ip = Array.isArray(forwarded) ? forwarded[0]
        : typeof forwarded === 'string' ? forwarded.split(',')[0].trim()
        : req.ip;
      return ip ?? 'unknown';
    },
  } as Parameters<typeof app.register>[1]);
}
