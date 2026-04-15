/**
 * Governance Console Routes
 * Phase 3/4 — Backend endpoints for Sovereign Creator Console
 *
 * Replaces the localhost:11434 Ollama dependency for console commands.
 * Routes through the existing LLM infrastructure (omniRouter / llmDelegator).
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDb } from '../db/sqlite.js';

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

const CREATOR_EMAIL = 'crowleyrc62@gmail.com';

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

  // Drift events — returns recent drift signals for the frontend DriftView
  app.get('/v1/governance/drift-events', async (request, reply) => {
    const { userId, limit } = request.query as { userId?: string; limit?: string };
    if (!userId) {
      return reply.status(400).send({ error: 'userId query parameter required' });
    }

    try {
      const db = getDb();
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
