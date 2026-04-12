/**
 * Contract: legacy truth_entries must surface in primed identity and unified omni system prompts.
 * Run from atlas-backend: `npm run contract:truth-ledger`
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function seedEnv(): void {
  process.env.PORT ??= '8787';
  process.env.OLLAMA_BASE_URL ??= 'http://127.0.0.1:11434';
  process.env.OLLAMA_CHAT_MODEL ??= 'contract-stub';
  process.env.OLLAMA_EMBED_MODEL ??= 'contract-stub';
  process.env.MEMORY_CONFIDENCE_THRESHOLD ??= '0.5';
  process.env.DATASET_SCORE_THRESHOLD ??= '0.5';
  const dir = join(tmpdir(), `atlas-contract-${process.pid}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  process.env.SQLITE_PATH = join(dir, 'contract.sqlite');
}

seedEnv();

const { initSqlite, getDb } = await import('../db/sqlite.js');
initSqlite();
const uid = 'contract-user-truth';
const db = getDb();
const id = randomUUID();
const now = new Date().toISOString();
db.prepare(
  `INSERT INTO truth_entries (id, user_id, statement, status, confidence, evidence_json, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
).run(id, uid, 'UNIQUE_CONTRACT_STATEMENT_XYZ', 'verified', 0.9, '{}', now, now);

const { buildPrimedChatSystemPrompt } = await import('../services/intelligence/atlasIdentity.js');
const primed = buildPrimedChatSystemPrompt(uid, 'hello');
if (!primed.includes('UNIQUE_CONTRACT_STATEMENT_XYZ')) {
  console.error('FAIL: buildPrimedChatSystemPrompt missing truth statement');
  process.exit(1);
}

const { buildUnifiedOmniSystemPrompt } = await import('../services/intelligence/omniRouter.js');
const { systemPrompt } = await buildUnifiedOmniSystemPrompt({
  userId: uid,
  lastUserText: 'contract probe',
  routing: { mode: 'direct_qa', posture: 1 },
  evolutionProfile: null,
});
if (!systemPrompt.includes('UNIQUE_CONTRACT_STATEMENT_XYZ')) {
  console.error('FAIL: buildUnifiedOmniSystemPrompt missing truth statement');
  process.exit(1);
}

console.log('OK: truth ledger present in primed + unified prompts');
