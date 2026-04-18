# Identity Hardening Pass 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the verified authentication and identity hardening gaps without mixing in the larger Overseer/Identity Engine rewrite.

**Architecture:** Remove or gate the unauthenticated response routes at registration time, harden `omniStream` so it resolves user identity from the authenticated session instead of request JSON, and make the Prime Directive stop presenting default policy values as learned user preferences. Keep the first pass narrow by adding small regression tests around new pure helpers and route guard behavior.

**Tech Stack:** Fastify, TypeScript, Zod, Node test runner via `tsx --test`

---

### Task 1: Establish backend regression harness

**Files:**
- Create: `atlas-backend/src/routes/identityHardening.test.ts`
- Create: `atlas-backend/src/services/intelligence/primeDirective.test.ts`
- Modify: `atlas-backend/package.json`

- [ ] **Step 1: Write the failing tests**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatPolicyProfileBlock,
  resolveAuthenticatedRouteUserId,
} from './identityHardening.js';

test('resolveAuthenticatedRouteUserId rejects requests without an authenticated user id', () => {
  assert.equal(resolveAuthenticatedRouteUserId(undefined, undefined), null);
});

test('formatPolicyProfileBlock emits a not-yet-learned banner for default profiles', () => {
  const text = formatPolicyProfileBlock({
    userId: 'u1',
    verbosity: 'medium',
    tone: 'analytical',
    structurePreference: 'balanced',
    truthFirstStrictness: 0.72,
    writingStyleEnabled: false,
    preferredComputeDepth: 'Light',
    latencyTolerance: 'Low',
    updatedAt: '2026-04-17T00:00:00.000Z',
    isLearned: false,
  });

  assert.match(text, /not yet learned/i);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm install && npx tsx --test src/routes/identityHardening.test.ts src/services/intelligence/primeDirective.test.ts`

Expected: FAIL because the helper module and exported formatter do not exist yet.

- [ ] **Step 3: Add the minimal test command**

```json
{
  "scripts": {
    "test": "tsx --test \"src/**/*.test.ts\""
  }
}
```

- [ ] **Step 4: Re-run the same targeted tests**

Run: `npx tsx --test src/routes/identityHardening.test.ts src/services/intelligence/primeDirective.test.ts`

Expected: FAIL for missing exports, confirming the tests are exercising new behavior instead of silently skipping.

### Task 2: Add shared identity hardening helpers

**Files:**
- Create: `atlas-backend/src/routes/identityHardening.ts`
- Modify: `atlas-backend/src/types/fastify.d.ts`
- Test: `atlas-backend/src/routes/identityHardening.test.ts`

- [ ] **Step 1: Write the next failing test for authenticated resolution preference**

```ts
test('resolveAuthenticatedRouteUserId prefers atlasAuthUser over atlasSessionUserId', () => {
  const resolved = resolveAuthenticatedRouteUserId('db-user', 'session-user');
  assert.equal(resolved, 'db-user');
});
```

- [ ] **Step 2: Run the targeted route helper tests**

Run: `npx tsx --test src/routes/identityHardening.test.ts`

Expected: FAIL because the resolver helper is still missing.

- [ ] **Step 3: Write the minimal implementation**

```ts
export function resolveAuthenticatedRouteUserId(
  atlasAuthUserId?: string | null,
  atlasSessionUserId?: string | null,
): string | null {
  return atlasAuthUserId ?? atlasSessionUserId ?? null;
}
```

- [ ] **Step 4: Add the session field used by the route guards**

```ts
declare module 'fastify' {
  interface FastifyRequest {
    atlasSession?: { userId?: string | null; tier?: string | null } | null;
  }
}
```

- [ ] **Step 5: Re-run the route helper tests**

Run: `npx tsx --test src/routes/identityHardening.test.ts`

Expected: PASS

### Task 3: Harden Prime Directive policy rendering

**Files:**
- Modify: `atlas-backend/src/services/intelligence/primeDirective.ts`
- Test: `atlas-backend/src/services/intelligence/primeDirective.test.ts`

- [ ] **Step 1: Write the failing learned-profile regression**

```ts
test('formatPolicyProfileBlock renders learned profiles with stored preference fields', () => {
  const text = formatPolicyProfileBlock({
    userId: 'u2',
    verbosity: 'high',
    tone: 'direct',
    structurePreference: 'structured',
    truthFirstStrictness: 0.91,
    writingStyleEnabled: true,
    preferredComputeDepth: 'Heavy',
    latencyTolerance: 'High',
    updatedAt: '2026-04-17T00:00:00.000Z',
    isLearned: true,
  });

  assert.match(text, /verbosity: high/);
  assert.doesNotMatch(text, /not yet learned/i);
});
```

- [ ] **Step 2: Run the Prime Directive tests**

Run: `npx tsx --test src/services/intelligence/primeDirective.test.ts`

Expected: FAIL because `formatPolicyProfileBlock` is not exported and no `isLearned` guard exists yet.

- [ ] **Step 3: Write the minimal implementation**

```ts
export function formatPolicyProfileBlock(profile: PolicyProfile): string {
  if (!profile.isLearned) {
    return 'USER_POLICY_PROFILE: not yet learned — this user has no established preferences on record. Calibrate from live evidence in this conversation only. Do not assert stylistic preferences.';
  }

  return [
    'USER_POLICY_PROFILE:',
    `- verbosity: ${profile.verbosity}`,
    `- tone: ${profile.tone}`,
    // remaining stored fields...
  ].join('\n');
}
```

- [ ] **Step 4: Keep `buildPrimeDirective()` using the helper**

```ts
function formatPolicyBlock(userId: string): string {
  return formatPolicyProfileBlock(getPolicyProfile(userId));
}
```

- [ ] **Step 5: Re-run the Prime Directive tests**

Run: `npx tsx --test src/services/intelligence/primeDirective.test.ts`

Expected: PASS

### Task 4: Remove or gate the unauthenticated routes and harden omni-stream identity resolution

**Files:**
- Modify: `atlas-backend/src/index.ts`
- Modify: `atlas-backend/src/routes/ollamaCompat.ts`
- Modify: `atlas-backend/src/routes/explanationRoutes.ts`
- Modify: `atlas-backend/src/routes/omniStream.ts`
- Delete: `atlas-backend/src/routes/orchestrate.ts` if unused
- Test: `atlas-backend/src/routes/identityHardening.test.ts`

- [ ] **Step 1: Write the failing route-behavior tests**

```ts
test('omni request schema no longer requires body userId', async () => {
  assert.equal(omniBodySchema.safeParse({ messages: [{ role: 'user', content: 'hi' }] }).success, true);
});

test('resolveAuthenticatedRouteUserId returns null when no authenticated identity exists', () => {
  assert.equal(resolveAuthenticatedRouteUserId(null, null), null);
});
```

- [ ] **Step 2: Run the targeted route tests**

Run: `npx tsx --test src/routes/identityHardening.test.ts`

Expected: FAIL because `omniBodySchema` still requires `userId`.

- [ ] **Step 3: Write the minimal route changes**

```ts
const resolvedUserId = resolveAuthenticatedRouteUserId(
  request.atlasAuthUser?.databaseUserId,
  request.atlasSession?.userId,
);

if (!resolvedUserId) {
  return reply.code(401).send({ error: 'Authentication required' });
}
```

```ts
const primed = messagesWithPrimeDirective(userId, body.messages ?? []);
const stream = streamChat(primed, { temperature });
```

```ts
registerOmniStreamRoutes(app);
registerOllamaCompatRoutes(app);
registerExplanationRoutes(app);
// do not register orchestrateRoutes if no callers remain
```

- [ ] **Step 4: Re-run the route tests**

Run: `npx tsx --test src/routes/identityHardening.test.ts`

Expected: PASS

- [ ] **Step 5: Run backend typecheck as the final verification for this pass**

Run: `npm run typecheck`

Expected: PASS
