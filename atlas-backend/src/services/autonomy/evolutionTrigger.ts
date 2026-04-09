import { buildPrimedChatSystemPrompt } from '../intelligence/atlasIdentity.js';
import { createRoutedEvolutionModelProvider } from '../intelligence/router.js';
import { scheduleEvolutionRun } from '../evolution/evolutionPipeline.js';
import type { ChatRole } from '../../types/atlas.js';

export interface OmniEvolutionPayload {
  traceId: string;
  userId: string;
  userMessage: string;
  assistantResponse: string;
  /** Sanitized transcript (no client system prompts) for archival / eval context. */
  requestMessages: Array<{ role: ChatRole; content: string }>;
  verifiedEmail: string | null;
}

/**
 * After an omni-stream completes, enqueue evolution (memory extraction, epistemic eval, SRG) without blocking the UI.
 */
export function triggerEvolutionAfterOmniResponse(payload: OmniEvolutionPayload): void {
  const systemPrompt = buildPrimedChatSystemPrompt(payload.userId, payload.userMessage);
  const model = createRoutedEvolutionModelProvider(payload.verifiedEmail, payload.userId);

  scheduleEvolutionRun({
    traceId: payload.traceId,
    userId: payload.userId,
    userMessage: payload.userMessage,
    assistantResponse: payload.assistantResponse,
    systemPrompt,
    requestMessages: payload.requestMessages,
    model,
    chatModelLabel: 'omni-stream',
  });
}
