import assert from 'node:assert/strict';
import test from 'node:test';

import Fastify from 'fastify';

import { registerExplanationRoutes } from './explanationRoutes.js';
import { resolveAuthenticatedRouteUserId } from './identityHardening.js';
import { registerOllamaCompatRoutes } from './ollamaCompat.js';
import { omniBodySchema } from './omniStream.js';

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
  const app = Fastify();
  await registerOllamaCompatRoutes(app);

  const response = await app.inject({
    method: 'POST',
    url: '/api/chat',
    payload: {
      messages: [{ role: 'user', content: 'hello' }],
    },
  });

  assert.equal(response.statusCode, 401);
  await app.close();
});

test('registerExplanationRoutes rejects unauthenticated requests', async () => {
  const app = Fastify();
  registerExplanationRoutes(app);

  const response = await app.inject({
    method: 'POST',
    url: '/api/governance/nlsummary',
    payload: {
      entries: [],
    },
  });

  assert.equal(response.statusCode, 401);
  await app.close();
});
