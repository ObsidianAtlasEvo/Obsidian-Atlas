import assert from 'node:assert/strict';
import test from 'node:test';

import Fastify, { type FastifyInstance } from 'fastify';

import { registerRateLimit } from '../plugins/rateLimit.js';
import { attachAtlasSession } from '../services/auth/authProvider.js';
import { registerExplanationRoutes } from './explanationRoutes.js';
import { resolveAuthenticatedRouteUserId } from './identityHardening.js';
import { registerOllamaCompatRoutes } from './ollamaCompat.js';
import { omniBodySchema, registerOmniStreamRoutes } from './omniStream.js';

async function buildProtectedApp(
  registerRoutes: (app: FastifyInstance) => Promise<void> | void,
): Promise<FastifyInstance> {
  const app = Fastify();
  await registerRateLimit(app);
  await app.register(async (protectedApp) => {
    protectedApp.addHook('preHandler', async (request, reply) => {
      await attachAtlasSession(request);
      if (!request.atlasAuthUser || !request.atlasVerifiedEmail) {
        return reply.code(401).send({ error: 'Unauthorized — Atlas session required' });
      }
    });
    await registerRoutes(protectedApp);
  });
  return app;
}

test('resolveAuthenticatedRouteUserId rejects requests without an authenticated user id', () => {
  assert.equal(resolveAuthenticatedRouteUserId(undefined, undefined), null);
});

test('resolveAuthenticatedRouteUserId prefers atlasAuthUser over any session user id', () => {
  assert.equal(resolveAuthenticatedRouteUserId('db-user', 'session-user'), 'db-user');
});

test('omniBodySchema accepts chat requests without a body userId field', () => {
  const parsed = omniBodySchema.safeParse({
    messages: [{ role: 'user', content: 'hello' }],
  });

  assert.equal(parsed.success, true);
});

test('registerOllamaCompatRoutes rejects unauthenticated requests', async () => {
  const app = await buildProtectedApp(registerOllamaCompatRoutes);

  const response = await app.inject({
    method: 'POST',
    url: '/api/chat',
    remoteAddress: '198.51.100.1',
    payload: {
      messages: [{ role: 'user', content: 'hello' }],
    },
  });

  assert.equal(response.statusCode, 401);
  await app.close();
});

test('registerExplanationRoutes rejects unauthenticated requests', async () => {
  const app = await buildProtectedApp(registerExplanationRoutes);

  const response = await app.inject({
    method: 'POST',
    url: '/api/governance/nlsummary',
    remoteAddress: '198.51.100.2',
    payload: {
      entries: [],
    },
  });

  assert.equal(response.statusCode, 401);
  await app.close();
});

test('registerExplanationRoutes returns 429 after repeated requests from the same client', async () => {
  const app = await buildProtectedApp(registerExplanationRoutes);

  for (let i = 0; i < 10; i += 1) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/governance/nlsummary',
      remoteAddress: '198.51.100.10',
      payload: { entries: [] },
    });
    assert.equal(response.statusCode, 401);
  }

  const blocked = await app.inject({
    method: 'POST',
    url: '/api/governance/nlsummary',
    remoteAddress: '198.51.100.10',
    payload: { entries: [] },
  });

  assert.equal(blocked.statusCode, 429);
  await app.close();
});

test('registerOllamaCompatRoutes returns 429 after repeated requests from the same client', async () => {
  const app = await buildProtectedApp(registerOllamaCompatRoutes);

  for (let i = 0; i < 5; i += 1) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/chat',
      remoteAddress: '198.51.100.20',
      payload: { messages: [{ role: 'user', content: 'hello' }] },
    });
    assert.equal(response.statusCode, 401);
  }

  const blocked = await app.inject({
    method: 'POST',
    url: '/api/chat',
    remoteAddress: '198.51.100.20',
    payload: { messages: [{ role: 'user', content: 'hello' }] },
  });

  assert.equal(blocked.statusCode, 429);
  await app.close();
});

test('registerOmniStreamRoutes returns 429 after repeated requests from the same client', async () => {
  const app = await buildProtectedApp(registerOmniStreamRoutes);

  for (let i = 0; i < 5; i += 1) {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/chat/omni-stream',
      remoteAddress: '198.51.100.30',
      payload: { messages: [{ role: 'user', content: 'hello' }] },
    });
    assert.equal(response.statusCode, 401);
  }

  const blocked = await app.inject({
    method: 'POST',
    url: '/v1/chat/omni-stream',
    remoteAddress: '198.51.100.30',
    payload: { messages: [{ role: 'user', content: 'hello' }] },
  });

  assert.equal(blocked.statusCode, 429);
  await app.close();
});
