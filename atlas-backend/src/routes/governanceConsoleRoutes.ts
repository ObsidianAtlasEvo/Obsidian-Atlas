/**
 * Governance Console Routes
 * Phase 3/4 — Backend endpoints for Sovereign Creator Console
 *
 * Replaces the localhost:11434 Ollama dependency for console commands.
 * Routes through the existing LLM infrastructure (omniRouter / llmDelegator).
 */

import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db/sqlite.js';
import { SOVEREIGN_CREATOR_EMAIL } from '../config/sovereignCreator.js';

const consoleCommandSchema = z.object({
  command: z.string().min(1).max(4000),
  userId: z.string().min(1),
  userEmail: z.string().email().optional(),
  channel: z.string().optional(),
});

const aiCommandSchema = z.object({
  command: z.string().min(1).max(4000),
  userId: z.string().min(1),
  userEmail: z.string().email().optional(),
  channel: z.string().optional(),
});

const CREATOR_EMAIL = SOVEREIGN_CREATOR_EMAIL;

function isCreator(email?: string): boolean {
  return email?.trim().toLowerCase() === CREATOR_EMAIL;
}

function buildGovernancePrompt(command: string, isAdmin: boolean): string {
  const securityContext = isAdmin
    ? 'ADMINISTRATIVE ACCESS GRANTED: User is the Sovereign Creator. Full governance access permitted.'
    : `SECURITY: Non-creator user. Restrict to read-only operational queries. Refuse administrative commands.`;

  return `You are the Obsidian Atlas Sovereign Creator Console AI Governance module.

${securityContext}

The user issued this command: "${command}"

Analyze and respond with a JSON object:
{
  "response": "Human-readable response (max 500 chars)",
  "proposalTitle": "Short title for any proposed change",
  "proposalDescription": "Detailed description of proposed change",
  "proposalClass": 0,
  "isImmediateUpgrade": false,
  "upgradeImpact": ""
}

proposalClass: 0=none, 1=minor, 2=moderate, 3=major, 4=critical
isImmediateUpgrade: true only if command explicitly requests an immediate implementation
`;
}

export function registerGovernanceConsoleRoutes(app: FastifyInstance): void {
  const db = getDb();

  // Terminal console command
  app.post('/v1/governance/console-command', async (request, reply) => {
    const parsed = consoleCommandSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }

    const { command, userEmail } = parsed.data;
    const admin = isCreator(userEmail);

    if (!admin) {
      return reply.send({
        response: 'UNAUTHORIZED: Sovereign Creator authentication required for console access.',
      });
    }

    // Graceful LLM availability check
    const { env } = await import('../config/env.js');
    const hasLlm = !!(env.groqApiKey?.trim() || env.cloudOpenAiApiKey?.trim());
    if (!hasLlm) {
      return reply.status(503).send({
        error: 'llm_not_configured',
        response: 'KERNEL ERROR: No LLM provider configured. Set GROQ_API_KEY or ATLAS_CLOUD_OPENAI_API_KEY in the backend environment.',
      });
    }

    try {
      const { complete } = await import('../services/intelligence/llmDelegator.js');
      const prompt = buildGovernancePrompt(command, admin);
      const raw = await complete(prompt, { maxTokens: 400, temperature: 0.3 });

      // Try to parse JSON response, fall back to raw text
      try {
        const parsed = JSON.parse(raw) as { response?: string };
        return reply.send({ response: parsed.response ?? raw });
      } catch {
        return reply.send({ response: raw });
      }
    } catch (err) {
      request.log.error(err, 'governance/console-command failed');
      return reply.status(500).send({
        error: 'governance_error',
        response: 'KERNEL ERROR: Unable to process command. Check server logs.',
      });
    }
  });

  // AI Governance command (full structured response)
  app.post('/v1/governance/ai-command', async (request, reply) => {
    const parsed = aiCommandSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }

    const { command, userEmail } = parsed.data;
    const admin = isCreator(userEmail);

    if (!admin) {
      return reply.send({
        response: 'UNAUTHORIZED: Sovereign Creator authentication required.',
        proposalTitle: '',
        proposalDescription: '',
        proposalClass: 0,
        isImmediateUpgrade: false,
        upgradeImpact: '',
      });
    }

    // Graceful LLM availability check
    const { env: envAi } = await import('../config/env.js');
    const hasLlmAi = !!(envAi.groqApiKey?.trim() || envAi.cloudOpenAiApiKey?.trim());
    if (!hasLlmAi) {
      return reply.status(503).send({
        error: 'llm_not_configured',
        response: 'KERNEL ERROR: No LLM provider configured. Set GROQ_API_KEY or ATLAS_CLOUD_OPENAI_API_KEY in the backend environment.',
        proposalTitle: '',
        proposalDescription: '',
        proposalClass: 0,
        isImmediateUpgrade: false,
        upgradeImpact: '',
      });
    }

    try {
      const { complete } = await import('../services/intelligence/llmDelegator.js');
      const prompt = buildGovernancePrompt(command, admin);
      const raw = await complete(prompt, { maxTokens: 600, temperature: 0.3 });

      const fallback = {
        response: raw,
        proposalTitle: 'Governance Action',
        proposalDescription: raw,
        proposalClass: 1 as const,
        isImmediateUpgrade: false,
        upgradeImpact: '',
      };

      try {
        const result = JSON.parse(raw) as typeof fallback;
        return reply.send(result);
      } catch {
        return reply.send(fallback);
      }
    } catch (err) {
      request.log.error(err, 'governance/ai-command failed');
      return reply.status(500).send({
        response: 'Server error processing governance command.',
        proposalTitle: '',
        proposalDescription: '',
        proposalClass: 0,
        isImmediateUpgrade: false,
        upgradeImpact: '',
      });
    }
  });

  // ── Audit entries table + writeAuditEntry helper (#31) ───────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_entries (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      action      TEXT NOT NULL,
      actor_uid   TEXT NOT NULL,
      actor_email TEXT,
      severity    TEXT NOT NULL DEFAULT 'low',
      metadata    TEXT,
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audit_entries_user ON audit_entries(user_id, created_at DESC);
  `);

  // ── Emergency state table (#32) ─────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS emergency_state (
      id           INTEGER PRIMARY KEY CHECK (id = 1),
      active       INTEGER NOT NULL DEFAULT 0,
      activated_at TEXT,
      activated_by TEXT,
      reason       TEXT,
      level        INTEGER NOT NULL DEFAULT 4,
      lifted_at    TEXT,
      lifted_by    TEXT,
      updated_at   INTEGER NOT NULL
    );
  `);

  // GET /v1/governance/audit-logs — list audit entries (#31)
  app.get('/v1/governance/audit-logs', async (request, reply) => {
    const { userId, limit: limitParam, severity, since } = request.query as {
      userId?: string;
      limit?: string;
      severity?: string;
      since?: string;
    };
    if (!userId) {
      return reply.status(400).send({ error: 'userId query parameter required' });
    }

    const maxRows = Math.min(Number(limitParam) || 100, 500);
    let sql = `SELECT id, user_id, action, actor_uid, actor_email, severity, metadata, created_at
               FROM audit_entries WHERE user_id = ?`;
    const params: unknown[] = [userId];

    if (severity && ['critical', 'high', 'medium', 'low'].includes(severity)) {
      sql += ` AND severity = ?`;
      params.push(severity);
    }
    if (since) {
      const sinceMs = new Date(since).getTime();
      if (!isNaN(sinceMs)) {
        sql += ` AND created_at >= ?`;
        params.push(sinceMs);
      }
    }
    sql += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(maxRows);

    const rows = db.prepare(sql).all(...params) as Array<{
      id: string;
      user_id: string;
      action: string;
      actor_uid: string;
      actor_email: string | null;
      severity: string;
      metadata: string | null;
      created_at: number;
    }>;

    const logs = rows.map((r) => ({
      id: r.id,
      action: r.action,
      actorUid: r.actor_uid,
      severity: r.severity,
      timestamp: new Date(r.created_at).toISOString(),
      metadata: r.metadata ? JSON.parse(r.metadata) : {},
    }));

    const totalRow = db.prepare(
      `SELECT COUNT(1) as c FROM audit_entries WHERE user_id = ?`,
    ).get(userId) as { c: number };

    return reply.send({ logs, total: totalRow.c });
  });

  // POST /v1/governance/emergency — activate/deactivate emergency (#32)
  const emergencySchema = z.object({
    action: z.enum(['activate', 'deactivate']),
    reason: z.string().optional(),
    userEmail: z.string().email().optional(),
    userId: z.string().optional(),
  });

  app.post('/v1/governance/emergency', async (request, reply) => {
    const parsed = emergencySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }

    const { action, reason, userEmail, userId } = parsed.data;
    if (!isCreator(userEmail)) {
      return reply.status(403).send({ error: 'Forbidden: Sovereign Creator access required' });
    }

    if (action === 'activate' && !reason) {
      return reply.status(400).send({ error: 'Reason is required for activation' });
    }

    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    if (action === 'activate') {
      db.prepare(
        `INSERT OR REPLACE INTO emergency_state (id, active, activated_at, activated_by, reason, level, lifted_at, lifted_by, updated_at)
         VALUES (1, 1, ?, ?, ?, 4, NULL, NULL, ?)`,
      ).run(nowIso, userEmail ?? null, reason ?? null, now);
    } else {
      db.prepare(
        `INSERT OR REPLACE INTO emergency_state (id, active, activated_at, activated_by, reason, level, lifted_at, lifted_by, updated_at)
         VALUES (1, 0,
           (SELECT activated_at FROM emergency_state WHERE id = 1),
           (SELECT activated_by FROM emergency_state WHERE id = 1),
           (SELECT reason FROM emergency_state WHERE id = 1),
           4, ?, ?, ?)`,
      ).run(nowIso, userEmail ?? null, now);
    }

    // Write audit entry
    writeAuditEntry(db, {
      userId: userId ?? 'system',
      action: action === 'activate' ? 'emergency.activate' : 'emergency.deactivate',
      actorUid: userId ?? 'system',
      actorEmail: userEmail,
      severity: 'critical',
      metadata: { reason, timestamp: nowIso },
    });

    return reply.send({ ok: true, active: action === 'activate', timestamp: nowIso });
  });

  // GET /v1/governance/emergency — current emergency state (#32)
  app.get('/v1/governance/emergency', async (_request, reply) => {
    const row = db.prepare(`SELECT * FROM emergency_state WHERE id = 1`).get() as {
      active: number;
      activated_at: string | null;
      activated_by: string | null;
      reason: string | null;
      level: number;
      lifted_at: string | null;
      lifted_by: string | null;
      updated_at: number;
    } | undefined;

    if (!row) {
      return reply.send({ active: false, activatedAt: null, reason: null, level: 4 });
    }

    return reply.send({
      active: row.active === 1,
      activatedAt: row.activated_at,
      activatedBy: row.activated_by,
      reason: row.reason,
      level: row.level,
      liftedAt: row.lifted_at,
      liftedBy: row.lifted_by,
    });
  });

  // Drift events — returns recent drift signals for the frontend DriftView
  app.get('/v1/governance/drift-events', async (request, reply) => {
    const { userId, limit } = request.query as { userId?: string; limit?: string };
    if (!userId) {
      return reply.status(400).send({ error: 'userId query parameter required' });
    }

    try {
      const maxRows = Math.min(Number(limit) || 50, 100);
      const rows = db
        .prepare(
          `SELECT id, subject_type, magnitude, narrative, detected_at, resolved_at
           FROM drift_events
           WHERE user_id = ?
           ORDER BY detected_at DESC
           LIMIT ?`
        )
        .all(userId, maxRows) as Array<{
          id: string;
          subject_type: string;
          magnitude: number;
          narrative: string;
          detected_at: string;
          resolved_at: string | null;
        }>;

      // Transform to frontend DriftAlert shape
      const alerts = rows.map((row) => {
        let parsed: { description?: string; evidence?: string[]; severity?: string } = {};
        try { parsed = JSON.parse(row.narrative); } catch { /* use defaults */ }
        return {
          id: row.id,
          timestamp: row.detected_at,
          type: row.subject_type as 'value-drift' | 'goal-drift' | 'behavioral-drift',
          description: parsed.description ?? row.narrative,
          severity: (parsed.severity ?? (row.magnitude >= 0.7 ? 'high' : row.magnitude >= 0.4 ? 'medium' : 'low')) as 'low' | 'medium' | 'high',
          evidence: parsed.evidence ?? [],
          resolved: row.resolved_at !== null,
        };
      });

      // Compute overall alignment: 1.0 minus average magnitude of unresolved events (last 20)
      const unresolvedMagnitudes = rows
        .filter((r) => r.resolved_at === null)
        .slice(0, 20)
        .map((r) => r.magnitude);
      const avgMag = unresolvedMagnitudes.length > 0
        ? unresolvedMagnitudes.reduce((a, b) => a + b, 0) / unresolvedMagnitudes.length
        : 0;
      const overallAlignment = Math.max(0, Math.min(1, 1 - avgMag * 0.5));

      return reply.send({ alerts, overallAlignment });
    } catch (err) {
      request.log.error(err, 'governance/drift-events failed');
      return reply.send({ alerts: [], overallAlignment: 0.8 });
    }
  });
}

/** Inserts an audit entry into audit_entries — exported for use by other routes (#31). */
export function writeAuditEntry(
  db: Database.Database,
  entry: {
    userId: string;
    action: string;
    actorUid: string;
    actorEmail?: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    metadata?: Record<string, unknown>;
  },
): void {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO audit_entries (id, user_id, action, actor_uid, actor_email, severity, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    entry.userId,
    entry.action,
    entry.actorUid,
    entry.actorEmail ?? null,
    entry.severity,
    entry.metadata ? JSON.stringify(entry.metadata) : null,
    Date.now(),
  );
}
