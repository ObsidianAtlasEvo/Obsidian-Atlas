/**
 * Migration 001: Upgrade legacy model IDs in user_preferences.
 *
 * Migrates stale Claude (3.x) and GPT (3.5/4o) preferred_model values to
 * their current equivalents (Claude 4.6 family, GPT-5.4 family).
 */

import { getDb } from '../../../../db/sqlite.js';
import type { MigrationChain } from '../migrationRunner.js';

export const migration001UpgradeLegacyModelIds: MigrationChain = {
  id: '001-upgrade-legacy-model-ids',
  domain: 'user_preferences',
  version: '001',

  async up() {
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
