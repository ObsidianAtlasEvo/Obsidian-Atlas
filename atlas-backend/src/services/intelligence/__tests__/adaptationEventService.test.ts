/**
 * Tests for adaptationEventService.
 *
 * `supabaseRest` calls global fetch under the hood (see db/supabase.ts).
 * To assert "called once / not called" we stub global fetch and the
 * SUPABASE_URL/KEY env vars rather than mocking the module — this keeps
 * the test honest about the full call path.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { recordAdaptationEvent } from '../adaptationEventService.js';

function withEnv<T>(
  vars: Record<string, string | undefined>,
  fn: () => Promise<T> | T,
): Promise<T> {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) {
    prev[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  return Promise.resolve()
    .then(() => fn())
    .finally(() => {
      for (const k of Object.keys(prev)) {
        if (prev[k] === undefined) delete process.env[k];
        else process.env[k] = prev[k];
      }
    });
}

function stubFetch(impl: (input: unknown, init?: unknown) => Promise<Response>): {
  restore: () => void;
  calls: Array<{ input: unknown; init?: unknown }>;
} {
  const calls: Array<{ input: unknown; init?: unknown }> = [];
  const original = global.fetch;
  global.fetch = async (input: unknown, init?: unknown): Promise<Response> => {
    calls.push({ input, init });
    return impl(input, init);
  };
  return {
    calls,
    restore: () => {
      global.fetch = original;
    },
  };
}

function silenceConsoleError(): () => void {
  const orig = console.error;
  console.error = () => {};
  return () => {
    console.error = orig;
  };
}

test('returns silently in sqlite mode (no fetch call)', async () => {
  await withEnv(
    {
      ADAPTATION_STORE: 'sqlite',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-key',
    },
    async () => {
      const f = stubFetch(async () => new Response('{}', { status: 200 }));
      try {
        await recordAdaptationEvent({
          userId: 'u1',
          adaptationType: 'correction_applied',
        });
        assert.equal(f.calls.length, 0);
      } finally {
        f.restore();
      }
    },
  );
});

test('returns silently in dual mode (no fetch call — no SQLite mirror)', async () => {
  await withEnv(
    {
      ADAPTATION_STORE: 'dual',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-key',
    },
    async () => {
      const f = stubFetch(async () => new Response('{}', { status: 200 }));
      try {
        await recordAdaptationEvent({
          userId: 'u1',
          adaptationType: 'drift_detected',
        });
        assert.equal(f.calls.length, 0);
      } finally {
        f.restore();
      }
    },
  );
});

test('calls supabaseRest once in supabase mode', async () => {
  await withEnv(
    {
      ADAPTATION_STORE: 'supabase',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-key',
    },
    async () => {
      const f = stubFetch(async () => new Response('[{}]', { status: 201 }));
      try {
        await recordAdaptationEvent({
          userId: 'u1',
          adaptationType: 'feedback_incorporated',
          trigger: 'unit-test',
          significance: 0.4,
        });
        assert.equal(f.calls.length, 1);
        const url = String(f.calls[0]!.input);
        assert.ok(
          url.includes('/rest/v1/behavior_adaptation_events'),
          `expected request to behavior_adaptation_events, got ${url}`,
        );
        const init = f.calls[0]!.init as { method?: string; body?: string };
        assert.equal(init.method, 'POST');
        const sent = JSON.parse(String(init.body));
        assert.equal(sent.adaptation_type, 'feedback_incorporated');
        assert.equal(sent.significance, 0.4);
        assert.equal(sent.trigger, 'unit-test');
      } finally {
        f.restore();
      }
    },
  );
});

test('clamps significance into [0, 1]', async () => {
  await withEnv(
    {
      ADAPTATION_STORE: 'supabase',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-key',
    },
    async () => {
      const f = stubFetch(async () => new Response('[{}]', { status: 201 }));
      try {
        await recordAdaptationEvent({
          userId: 'u1',
          adaptationType: 'other',
          significance: 2.7,
        });
        await recordAdaptationEvent({
          userId: 'u1',
          adaptationType: 'other',
          significance: -3,
        });
        await recordAdaptationEvent({
          userId: 'u1',
          adaptationType: 'other',
          significance: Number.NaN,
        });
        assert.equal(f.calls.length, 3);
        const sigs = f.calls.map((c) => {
          const init = c.init as { body?: string };
          return JSON.parse(String(init.body)).significance as number;
        });
        assert.deepEqual(sigs, [1, 0, 0.5]);
      } finally {
        f.restore();
      }
    },
  );
});

test('swallows fetch errors without throwing', async () => {
  await withEnv(
    {
      ADAPTATION_STORE: 'supabase',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-key',
    },
    async () => {
      const f = stubFetch(async () => {
        throw new Error('network down');
      });
      const restoreErr = silenceConsoleError();
      try {
        // Should not throw even though fetch (and therefore supabaseRest) failed.
        await recordAdaptationEvent({
          userId: 'u1',
          adaptationType: 'policy_shift',
        });
        assert.equal(f.calls.length, 1);
      } finally {
        restoreErr();
        f.restore();
      }
    },
  );
});

test('swallows non-2xx Supabase responses without throwing', async () => {
  await withEnv(
    {
      ADAPTATION_STORE: 'supabase',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-key',
    },
    async () => {
      const f = stubFetch(async () => new Response('forbidden', { status: 403 }));
      const restoreErr = silenceConsoleError();
      try {
        await recordAdaptationEvent({
          userId: 'u1',
          adaptationType: 'identity_signal_revision',
        });
        assert.equal(f.calls.length, 1);
      } finally {
        restoreErr();
        f.restore();
      }
    },
  );
});
