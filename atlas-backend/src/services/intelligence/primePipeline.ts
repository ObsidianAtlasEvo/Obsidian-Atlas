import type { FastifyRequest } from 'fastify';
import { getVerifiedUserEmail } from '../auth/requestAuth.js';
import { buildPrimedChatSystemPrompt } from './atlasIdentity.js';
import { getIntelligenceRouter, normalizeEmail } from './router.js';
import type { GenerateOutput } from '../model/modelProvider.js';
import type { PrimedChatMessage, RoutedGenerateInput } from './types.js';

function sanitizeClientMessages(
  messages: Array<{ role: string; content: string }>
): PrimedChatMessage[] {
  const out: PrimedChatMessage[] = [];
  for (const m of messages) {
    if (m.role === 'system') continue;
    if (m.role === 'user' || m.role === 'assistant') {
      out.push({ role: m.role, content: m.content });
    }
  }
  return out;
}

export interface PrimePipelineChatInput {
  userId: string;
  /** Raw chat messages from the client; `system` roles are stripped. */
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  request?: FastifyRequest;
  /** When no Fastify request, pass verified email explicitly (tests / internal callers only). */
  verifiedUserEmailOverride?: string | null;
  /** Overrides heuristic routing for structured context assembly. */
  sovereignResponseMode?: string;
  jsonMode?: boolean;
  temperature?: number;
  modelOverride?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * Identity priming → sanitized turns → {@link IntelligenceRouter} (local vs cloud is opaque to callers).
 */
export async function executePrimedChatInference(input: PrimePipelineChatInput): Promise<GenerateOutput> {
  const primedMessages = sanitizeClientMessages(input.messages);
  if (primedMessages.length === 0) {
    throw new Error('primePipeline: no user/assistant messages after sanitization');
  }

  let lastUser = '';
  for (let i = primedMessages.length - 1; i >= 0; i--) {
    if (primedMessages[i]!.role === 'user') {
      lastUser = primedMessages[i]!.content;
      break;
    }
  }

  const systemPrompt = buildPrimedChatSystemPrompt(input.userId, lastUser, {
    sovereignResponseMode: input.sovereignResponseMode,
  });

  const verifiedEmail =
    input.verifiedUserEmailOverride !== undefined
      ? normalizeEmail(input.verifiedUserEmailOverride)
      : input.request
        ? getVerifiedUserEmail(input.request)
        : null;

  const routed: RoutedGenerateInput = {
    userId: input.userId,
    userEmail: verifiedEmail,
    messages: primedMessages,
    systemPrompt,
    jsonMode: input.jsonMode,
    temperature: input.temperature,
    modelOverride: input.modelOverride,
    timeoutMs: input.timeoutMs,
    signal: input.signal,
  };

  return getIntelligenceRouter().generateStructured(routed);
}
