/**
 * Atlas Explanation Routes
 * Phase 4 Section 4 — Explainability Layer
 *
 * POST /v1/governance/nlsummary — generate a natural-language digest
 * of governance explanation entries via Groq LLM with rule-based fallback.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const entrySchema = z.object({
  id: z.string().optional(),
  eventType: z.string(),
  targetId: z.string(),
  actorId: z.string(),
  timestamp: z.string(),
  humanSummary: z.string(),
  technicalDetail: z.string(),
  policyLayer: z.string().optional(),
  ttlDays: z.number().optional(),
});

const bodySchema = z.object({
  entries: z.array(entrySchema),
});

type NLEntry = z.infer<typeof entrySchema>;

interface NLSummary {
  text: string;
  generatedAt: string;
  entryCount: number;
  method: 'llm' | 'rule-based';
}

function buildRuleBasedSummary(entries: NLEntry[]): string {
  if (entries.length === 0) {
    return 'No policy violations or critical events detected in the provided entries.';
  }

  const byType = new Map<string, number>();
  for (const e of entries) {
    byType.set(e.eventType, (byType.get(e.eventType) ?? 0) + 1);
  }

  const topEvents = [...byType.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([type, count]) => `${type} (${count})`)
    .join(', ');

  const actors = new Set(entries.map((e) => e.actorId));
  const targets = new Set(entries.map((e) => e.targetId));

  return [
    `${entries.length} governance event${entries.length > 1 ? 's' : ''} analyzed.`,
    `Top event types: ${topEvents}.`,
    `Unique actors: ${actors.size}. Unique targets: ${targets.size}.`,
  ].join(' ');
}

async function tryGroqSummary(entries: NLEntry[]): Promise<string | null> {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return null;

  const prompt = [
    'You are a governance analyst. Summarize the following governance events into a concise weekly digest.',
    'Focus on patterns, severity, and recommended actions. Keep it under 200 words.',
    '',
    JSON.stringify(
      entries.map((e) => ({
        event: e.eventType,
        target: e.targetId,
        summary: e.humanSummary,
        detail: e.technicalDetail,
      })),
      null,
      2
    ),
  ].join('\n');

  try {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 512,
        temperature: 0.3,
      }),
    });

    if (!resp.ok) return null;

    const data = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}

export function registerExplanationRoutes(app: FastifyInstance): void {
  app.post('/v1/governance/nlsummary', async (request, reply) => {
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: 'validation_error', details: parsed.error.flatten() });
    }

    const { entries } = parsed.data;

    // Try LLM first
    const llmText = await tryGroqSummary(entries);
    if (llmText) {
      const result: NLSummary = {
        text: llmText,
        generatedAt: new Date().toISOString(),
        entryCount: entries.length,
        method: 'llm',
      };
      return reply.send(result);
    }

    // Rule-based fallback
    const result: NLSummary = {
      text: buildRuleBasedSummary(entries),
      generatedAt: new Date().toISOString(),
      entryCount: entries.length,
      method: 'rule-based',
    };
    return reply.send(result);
  });
}
