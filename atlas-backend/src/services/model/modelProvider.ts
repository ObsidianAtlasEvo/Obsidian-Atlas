export interface GenerateInput {
  userId: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  systemPrompt?: string;
  jsonMode?: boolean;
  temperature?: number;
  /** Override chat model (e.g. smaller model for evolution tasks). */
  modelOverride?: string;
  /** Abort slow background calls without failing the main request path. */
  timeoutMs?: number;
}

export interface GenerateOutput {
  text: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
}

export interface EmbeddingInput {
  input: string[];
  /** Optional; aborts the HTTP request to Ollama (large batches on slow disks). */
  timeoutMs?: number;
}

export interface ModelProvider {
  generate(input: GenerateInput): Promise<GenerateOutput>;
  embed(input: EmbeddingInput): Promise<number[][]>;
}
