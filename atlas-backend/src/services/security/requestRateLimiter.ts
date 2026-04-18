import type { FastifyReply, FastifyRequest } from 'fastify';
import { RateLimiterMemory } from 'rate-limiter-flexible';

function forwardedIp(request: FastifyRequest): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0]!.split(',')[0]!.trim();
  }
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]!.trim();
  }
  return request.ip ?? 'unknown';
}

export function requestRateLimitKey(request: FastifyRequest, scope: string): string {
  return `${scope}:${forwardedIp(request)}`;
}

export const explanationRouteLimiter = new RateLimiterMemory({
  keyPrefix: 'atlas:explanation',
  points: 10,
  duration: 60,
});

export const ollamaCompatRouteLimiter = new RateLimiterMemory({
  keyPrefix: 'atlas:ollama-compat',
  points: 5,
  duration: 60,
});

export const omniStreamRouteLimiter = new RateLimiterMemory({
  keyPrefix: 'atlas:omni-stream',
  points: 5,
  duration: 60,
});

function msBeforeNext(err: unknown): number {
  if (typeof err === 'object' && err !== null && 'msBeforeNext' in err) {
    const value = (err as { msBeforeNext?: unknown }).msBeforeNext;
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return 60_000;
}

export function sendRateLimitExceeded(reply: FastifyReply, err: unknown) {
  const retryAfterSeconds = Math.max(1, Math.ceil(msBeforeNext(err) / 1000));
  return reply
    .code(429)
    .header('retry-after', String(retryAfterSeconds))
    .send({
      error: 'rate_limit_exceeded',
      message: 'Too many requests. Please retry later.',
    });
}
