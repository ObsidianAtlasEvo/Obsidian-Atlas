import type { GenerateOutput } from '../model/modelProvider.js';

/** Chat roles after server-side sanitization (client-supplied system prompts are stripped). */
export type PrimedMessageRole = 'user' | 'assistant';

export interface PrimedChatMessage {
  role: PrimedMessageRole;
  content: string;
}

/**
 * Unified request surface for both local Ollama and cloud OpenAI-compatible APIs.
 * `userEmail` must be populated from verified auth on the server — never trust unauthenticated input for routing.
 */
export interface RoutedGenerateInput {
  userId: string;
  /** Verified email from OAuth/session; null forces public (cloud) path. */
  userEmail: string | null | undefined;
  messages: PrimedChatMessage[];
  /** Full primed system string (Atlas Identity + Reality Graph + policy substrate). */
  systemPrompt: string;
  jsonMode?: boolean;
  temperature?: number;
  modelOverride?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface StreamChunk {
  textDelta: string;
  done: boolean;
}

/** Both compute backends expose the same operations so Action Modules stay agnostic. */
export interface IntelligenceSurface {
  readonly surfaceId: 'local-ollama' | 'cloud-openai-compatible';

  generateStructured(input: RoutedGenerateInput): Promise<GenerateOutput>;

  generateStreaming(
    input: RoutedGenerateInput,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<GenerateOutput>;
}
