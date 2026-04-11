/**
 * Governance Console Routes
 * Phase 3/4 — Backend endpoints for Sovereign Creator Console
 *
 * Replaces the localhost:11434 Ollama dependency for console commands.
 * Routes through the existing LLM infrastructure (omniRouter / llmDelegator).
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

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
      const { llmDelegator } = await import('../services/intelligence/llmDelegator.js');
      const prompt = buildGovernancePrompt(command, admin);
      const raw = await llmDelegator.complete(prompt, { maxTokens: 400, temperature: 0.3 });

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
      const { llmDelegator } = await import('../services/intelligence/llmDelegator.js');
      const prompt = buildGovernancePrompt(command, admin);
      const raw = await llmDelegator.complete(prompt, { maxTokens: 600, temperature: 0.3 });

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
}
