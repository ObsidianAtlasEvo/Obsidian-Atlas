/**
 * Migration 001: Upgrade legacy model IDs in user_preferences.
 *
 * Migrates stale Claude (3.x) and GPT (3.5/4o) preferred_model values to
 * their current equivalents (Claude 4.6 family, GPT-5.4 family).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Absent-table guard (hotfix — see deploy runs 24609809442 + 24610590569):
 * ─────────────────────────────────────────────────────────────────────────
 * In the current Atlas deployment the `user_preferences` SQLite table does
 * not exist — user model preferences live in Supabase on
 * `atlas_evolution_profiles.preferred_model` (see
 * routes/userPreferencesRoutes.ts). When PR #124 wired the boot migration
 * runner into index.ts, this chain's `up()` started executing on every
 * start; with no table to `UPDATE`, better-sqlite3 threw
 * `SqliteError: no such table: user_preferences` → runMigrations returned
 * { failed } → runBootMigrations threw → index.ts logged `[FATAL] Boot
 * migrations failed` and called `process.exit(1)`. PM2 kept restarting the
 * crashed process and the post-deploy health check hit ECONNREFUSED
 * (curl exit 7) because port 3001 was never listening.
 *
 * Until the SQLite `user_preferences` table is introduced (or the Supabase
 * preferences are back-filled through this runner), the migration detects
 * the table's absence up front and short-circuits cleanly. That records a
 * status='success' row against (user_preferences, 001) so the idempotency
 * gate in migrationRunner skips it on subsequent boots. If/when the table
 * lands, the same chain will run the UPDATEs exactly once on whatever rows
 * exist at that moment, then short-circuit forever after via the gate.
 */

import { getDb } from '../../../../db/sqlite.js';
import type { MigrationChain } from '../migrationRunner.js';

function userPreferencesTableExists(): boolean {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT name FROM sqlite_master
        WHERE type = 'table' AND name = 'user_preferences'
        LIMIT 1`,
    )
    .get() as { name?: string } | undefined;
  return Boolean(row?.name);
}

export const migration001UpgradeLegacyModelIds: MigrationChain = {
  id: '001-upgrade-legacy-model-ids',
  domain: 'user_preferences',
  version: '001',

  async up() {
    // Absent-table guard — see header comment. Preferences currently live in
    // Supabase, not SQLite; without this guard the UPDATEs below throw
    // "no such table" and bring the whole boot down.
    if (!userPreferencesTableExists()) {
      // eslint-disable-next-line no-console -- migrations run before Fastify logger
      console.log(
        '[migration 001] user_preferences SQLite table not present — skipping legacy model ID upgrade (prefs currently live in Supabase atlas_evolution_profiles).',
      );
      return;
    }

    const db = getDb();

    // Upgrade legacy Claude model IDs → Claude Sonnet 4.6
    db.prepare(`
      UPDATE user_preferences
        SET preferred_model = 'anthropic/claude-sonnet-4-6'
        WHERE preferred_model IN (
          'anthropic/claude-3.5-sonnet',
          'anthropic/claude-3-haiku',
          'anthropic/claude-3-7-sonnet-latest',
          'claude-3-5-sonnet',
          'claude-3.5-sonnet',
          'claude-3-haiku',
          'claude-3-7-sonnet-latest'
        )
    `).run();

    // Upgrade legacy Claude Opus → Claude Opus 4.6
    db.prepare(`
      UPDATE user_preferences
        SET preferred_model = 'anthropic/claude-opus-4-6'
        WHERE preferred_model IN (
          'anthropic/claude-3-opus',
          'claude-3-opus'
        )
    `).run();

    // Upgrade legacy budget GPT models → gpt-5.4-nano (closest free/budget equivalent)
    db.prepare(`
      UPDATE user_preferences
        SET preferred_model = 'gpt-5.4-nano'
        WHERE preferred_model IN (
          'openai/gpt-3.5-turbo',
          'gpt-3.5-turbo',
          'openai/gpt-4o-mini',
          'gpt-4o-mini'
        )
    `).run();

    // Upgrade legacy premium GPT models → gpt-5.4 (closest sovereign-tier equivalent)
    db.prepare(`
      UPDATE user_preferences
        SET preferred_model = 'gpt-5.4'
        WHERE preferred_model IN (
          'openai/gpt-4o',
          'gpt-4o',
          'openai/o1-preview',
          'o1-preview'
        )
    `).run();
  },

  async down() {
    // Irreversible — we cannot know which specific legacy model a user had.
    // The alias maps in llmRegistry.ts handle backward-compat display.
  },

  irreversible: true,
};
