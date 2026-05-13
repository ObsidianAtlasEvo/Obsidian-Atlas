import assert from 'node:assert/strict';
import test from 'node:test';

import { dualWrite } from '../dualWriteWrapper.js';

test('dualWrite returns the primary result and runs the secondary', async () => {
  let secondaryCalls = 0;
  const result = await dualWrite(
    async () => 'primary-value',
    async () => {
      secondaryCalls += 1;
    },
    { table: 'memories', mode: 'dual' },
  );
  assert.equal(result, 'primary-value');
  assert.equal(secondaryCalls, 1);
});

test('dualWrite skips the secondary when null', async () => {
  const result = await dualWrite(
    async () => 42,
    null,
    { table: 'memories', mode: 'sqlite' },
  );
  assert.equal(result, 42);
});

test('dualWrite swallows secondary errors but still returns the primary value', async () => {
  const originalError = console.error;
  let logged = false;
  console.error = (..._args: unknown[]) => {
    logged = true;
  };
  try {
    const result = await dualWrite(
      async () => 'ok',
      async () => {
        throw new Error('secondary boom');
      },
      { table: 'truth_entries', mode: 'dual' },
    );
    assert.equal(result, 'ok');
    assert.equal(logged, true);
  } finally {
    console.error = originalError;
  }
});

test('dualWrite propagates primary errors', async () => {
  let secondaryCalls = 0;
  await assert.rejects(
    dualWrite(
      async () => {
        throw new Error('primary boom');
      },
      async () => {
        secondaryCalls += 1;
      },
      { table: 'memories', mode: 'dual' },
    ),
    /primary boom/,
  );
  assert.equal(secondaryCalls, 0, 'secondary must not run when primary throws');
});

test('dualWrite supports synchronous primary functions', async () => {
  const result = await dualWrite(
    () => 'sync',
    null,
    { table: 'memories', mode: 'sqlite' },
  );
  assert.equal(result, 'sync');
});
