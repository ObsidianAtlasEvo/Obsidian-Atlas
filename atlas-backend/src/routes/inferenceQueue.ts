import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pipeGpuQueueSse } from '../services/inference/queueManager.js';

const querySchema = z.object({
  requestId: z.string().uuid(),
  userId: z.string().min(1),
});

/**
 * SSE: GPU queue position and phase for a single inference request.
 * Pair with POST /v1/chat using the same `requestId` + `userId` (until JWT middleware binds userId).
 */
export function registerInferenceQueueRoutes(app: FastifyInstance): void {
  app.get('/v1/inference/queue-stream', async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    const { requestId, userId } = parsed.data;
    pipeGpuQueueSse(reply, requestId, userId);
  });
}
