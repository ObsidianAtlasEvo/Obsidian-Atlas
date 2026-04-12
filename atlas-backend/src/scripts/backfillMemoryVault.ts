/**
 * One-shot: embed existing SQLite `memories` rows into `memory_vault`.
 * Run on the VPS from atlas-backend after Ollama + nomic-embed-text are available:
 *   npx tsx src/scripts/backfillMemoryVault.ts
 * Optional: filter by user — first CLI arg is user_id substring or exact match.
 */
import '../bootstrapEnv.js';
import { initSqlite, getDb } from '../db/sqlite.js';
import type { MemoryVaultType } from '../services/memory/memoryVault.js';
import { ingestMemory } from '../services/memory/memoryVault.js';

function kindToVaultType(kind: string): MemoryVaultType {
  if (kind === 'constraint' || kind === 'rejection') return 'DIRECTIVE';
  if (kind === 'project' || kind === 'goal') return 'PROJECT';
  if (kind === 'fact') return 'TRUTH';
  return 'EPISODIC';
}

async function main(): Promise<void> {
  initSqlite();
  const filter = process.argv[2]?.trim();

  const rows = getDb()
    .prepare(
      `SELECT user_id, kind, summary, detail, confidence
       FROM memories
       WHERE (archived_at IS NULL OR archived_at = '')
       ORDER BY created_at ASC`
    )
    .all() as Array<{
    user_id: string;
    kind: string;
    summary: string;
    detail: string;
    confidence: number;
  }>;

  const selected = filter
    ? rows.filter((r) => r.user_id === filter || r.user_id.includes(filter))
    : rows;

  console.log(`Backfill: ${selected.length} memory row(s) to process (from ${rows.length} total).`);

  let inserted = 0;
  let skippedDup = 0;
  let failed = 0;

  const dupStmt = getDb().prepare(
    `SELECT 1 AS ok FROM memory_vault WHERE user_id = ? AND content = ? LIMIT 1`
  );

  for (const r of selected) {
    const content = `${r.summary}: ${r.detail}`.trim();
    if (!content) continue;

    const exists = dupStmt.get(r.user_id, content) as { ok: number } | undefined;
    if (exists) {
      skippedDup++;
      continue;
    }

    const rec = await ingestMemory(r.user_id, content, kindToVaultType(r.kind), r.confidence);
    if (rec) inserted++;
    else failed++;
  }

  console.log(`Done: inserted=${inserted}, skipped_duplicate=${skippedDup}, ingest_failed=${failed}`);
  process.exit(failed > 0 && inserted === 0 ? 1 : 0);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
