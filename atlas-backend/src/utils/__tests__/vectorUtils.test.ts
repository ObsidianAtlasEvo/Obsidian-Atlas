import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertEmbeddingDimension,
  buildVectorSearchClause,
  serializeEmbedding,
} from '../vectorUtils.js';

test('serializeEmbedding produces pgvector wire format', () => {
  assert.equal(serializeEmbedding([1, 2, 3]), '[1,2,3]');
});

test('serializeEmbedding handles empty vector', () => {
  assert.equal(serializeEmbedding([]), '[]');
});

test('assertEmbeddingDimension accepts the canonical 768-dim default', () => {
  const vec = new Array(768).fill(0);
  assert.doesNotThrow(() => assertEmbeddingDimension(vec));
});

test('assertEmbeddingDimension throws on dimension mismatch', () => {
  assert.throws(() => assertEmbeddingDimension([1, 2, 3]), /Embedding dimension mismatch/);
});

test('assertEmbeddingDimension respects custom expected dim', () => {
  const vec = new Array(4).fill(0);
  assert.doesNotThrow(() => assertEmbeddingDimension(vec, 4));
  assert.throws(() => assertEmbeddingDimension(vec, 5), /got 4, expected 5/);
});

test('buildVectorSearchClause returns the cosine-distance placeholder', () => {
  assert.equal(buildVectorSearchClause(), 'embedding <=> $1::vector');
});
