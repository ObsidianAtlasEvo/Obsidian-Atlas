import { randomUUID } from 'node:crypto';
import { getDb } from '../../db/sqlite.js';
import { recordGovernanceAudit } from './governanceAudit.js';

export interface JournalEntryRow {
  id: string;
  user_id: string;
  title: string;
  content: string;
  mood: string | null;
  tags: string;
  assistance_mode: string | null;
  analysis: string | null;
  created_at: string;
  updated_at: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function createJournalEntry(entry: JournalEntryRow): JournalEntryRow {
  const db = getDb();
  const id = entry.id || randomUUID();
  const ts = nowIso();
  db.prepare(
    `INSERT INTO journal_entries (id, user_id, title, content, mood, tags, assistance_mode, analysis, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    entry.user_id,
    entry.title ?? '',
    entry.content ?? '',
    entry.mood ?? null,
    entry.tags ?? '[]',
    entry.assistance_mode ?? null,
    entry.analysis ?? null,
    entry.created_at || ts,
    entry.updated_at || ts
  );
  recordGovernanceAudit({
    userId: entry.user_id,
    action: 'journal_entry_create',
    entityType: 'journal_entries',
    entityId: id,
  });
  return db.prepare(`SELECT * FROM journal_entries WHERE id = ?`).get(id) as JournalEntryRow;
}

export function updateJournalEntry(
  id: string,
  userId: string,
  updates: Partial<JournalEntryRow>
): JournalEntryRow {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM journal_entries WHERE id = ? AND user_id = ?`)
    .get(id, userId) as JournalEntryRow | undefined;
  if (!row) throw new Error('journal_entry_not_found');
  const ts = nowIso();
  db.prepare(
    `UPDATE journal_entries SET
      title = COALESCE(?, title),
      content = COALESCE(?, content),
      mood = COALESCE(?, mood),
      tags = COALESCE(?, tags),
      assistance_mode = COALESCE(?, assistance_mode),
      analysis = COALESCE(?, analysis),
      updated_at = ?
    WHERE id = ? AND user_id = ?`
  ).run(
    updates.title ?? null,
    updates.content ?? null,
    updates.mood ?? null,
    updates.tags ?? null,
    updates.assistance_mode ?? null,
    updates.analysis ?? null,
    ts,
    id,
    userId
  );
  recordGovernanceAudit({
    userId,
    action: 'journal_entry_update',
    entityType: 'journal_entries',
    entityId: id,
  });
  return db.prepare(`SELECT * FROM journal_entries WHERE id = ?`).get(id) as JournalEntryRow;
}

export function deleteJournalEntry(id: string, userId: string): void {
  const db = getDb();
  const n = db
    .prepare(`DELETE FROM journal_entries WHERE id = ? AND user_id = ?`)
    .run(id, userId).changes;
  if (!n) throw new Error('journal_entry_not_found');
  recordGovernanceAudit({
    userId,
    action: 'journal_entry_delete',
    entityType: 'journal_entries',
    entityId: id,
  });
}

export function getJournalEntry(id: string, userId: string): JournalEntryRow | undefined {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM journal_entries WHERE id = ? AND user_id = ?`)
    .get(id, userId) as JournalEntryRow | undefined;
}

export function listJournalEntries(userId: string, limit = 100): JournalEntryRow[] {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM journal_entries WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`)
    .all(userId, limit) as JournalEntryRow[];
}
