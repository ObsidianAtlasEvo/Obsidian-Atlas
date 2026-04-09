import { env } from '../../config/env.js';
import {
  executeAtlasTool,
  OLLAMA_ATLAS_TOOLS,
  type OllamaToolDefinition,
  type ToolExecutionContext,
} from '../inference/toolRegistry.js';
import type {
  EmbeddingInput,
  GenerateInput,
  GenerateOutput,
  ModelProvider,
} from './modelProvider.js';

export type { OllamaToolDefinition, ToolExecutionContext } from '../inference/toolRegistry.js';

async function postJson(url: string, body: unknown, init?: { signal?: AbortSignal }): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: init?.signal,
  });

  const rawText = await res.text();
  let data: unknown;
  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch {
    throw new Error(`Ollama returned non-JSON (${res.status}) at ${url}: ${rawText.slice(0, 200)}`);
  }

  if (!res.ok) {
    const detail =
      typeof data === 'object' && data !== null && 'error' in data
        ? String((data as { error?: unknown }).error)
        : rawText.slice(0, 300);
    throw new Error(`Ollama request failed (${res.status}) at ${url}: ${detail}`);
  }

  return data;
}

function assertRecord(x: unknown, context: string): Record<string, unknown> {
  if (typeof x !== 'object' || x === null) {
    throw new Error(`Ollama ${context}: expected JSON object, got ${typeof x}`);
  }
  return x as Record<string, unknown>;
}

function buildChatMessages(
  systemPrompt: string | undefined,
  messages: GenerateInput['messages']
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  if (systemPrompt?.trim()) {
    out.push({ role: 'system', content: systemPrompt.trim() });
  }
  for (const m of messages) {
    out.push({ role: m.role, content: m.content });
  }
  return out;
}

/** Normalize tool arguments: Ollama may return a JSON object or a string. */
export function parseToolCallArguments(raw: unknown): unknown {
  if (raw === null || raw === undefined) return {};
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return {};
    try {
      return JSON.parse(s) as unknown;
    } catch {
      return { _unparsed_arguments: raw };
    }
  }
  return raw;
}

function assistantHistoryEntry(message: Record<string, unknown>): Record<string, unknown> {
  const role = message.role === 'assistant' ? 'assistant' : String(message.role ?? 'assistant');
  const content = typeof message.content === 'string' ? message.content : '';
  const entry: Record<string, unknown> = { role, content };
  if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
    entry.tool_calls = message.tool_calls;
  }
  return entry;
}

async function appendToolResultsToMessages(
  toolCalls: unknown[],
  execute: (name: string, args: unknown) => Promise<string>,
  apiMessages: Record<string, unknown>[]
): Promise<void> {
  for (const tc of toolCalls) {
    if (typeof tc !== 'object' || tc === null) continue;
    const t = tc as Record<string, unknown>;
    const fn = t.function;
    if (typeof fn !== 'object' || fn === null) continue;
    const f = fn as Record<string, unknown>;
    const name = typeof f.name === 'string' ? f.name : '';
    const args = parseToolCallArguments(f.arguments);
    let output: string;
    try {
      output = await execute(name, args);
    } catch (e) {
      output = JSON.stringify({
        error: 'tool_execution_exception',
        message: e instanceof Error ? e.message : String(e),
      });
    }
    apiMessages.push({ role: 'tool', tool_name: name, content: output });
  }
}

export type OllamaToolChatInput = {
  userId: string;
  messages: GenerateInput['messages'];
  systemPrompt?: string;
  /** Defaults to Atlas sovereign tools (vector + memory + clock). */
  tools?: readonly OllamaToolDefinition[];
  toolContext: ToolExecutionContext;
  modelOverride?: string;
  temperature?: number;
  timeoutMs?: number;
  /** Guardrail for runaway loops (each model round with tool_calls counts as one). */
  maxToolRounds?: number;
};

export type OllamaToolChatResult = {
  text: string;
  model: string;
  toolRounds: number;
  /** Messages sent to Ollama after the run (system/user/assistant/tool…). */
  ollamaMessages: Record<string, unknown>[];
  promptTokens?: number;
  completionTokens?: number;
};

/**
 * Multi-turn `/api/chat` with Ollama `tools`: runs tool_calls locally via {@link executeAtlasTool},
 * appends `role: tool` results, and continues until the model returns plain content or `maxToolRounds`.
 */
export async function ollamaChatWithTools(input: OllamaToolChatInput): Promise<OllamaToolChatResult> {
  if (input.toolContext.userId !== input.userId) {
    throw new Error('ollamaChatWithTools: toolContext.userId must equal userId');
  }

  const model = input.modelOverride?.trim() || env.ollamaChatModel;
  const tools = input.tools ?? OLLAMA_ATLAS_TOOLS;
  const maxRounds = input.maxToolRounds ?? 24;

  const apiMessages = buildChatMessages(input.systemPrompt, input.messages);
  const runOneTool = (name: string, args: unknown) => executeAtlasTool(name, args, input.toolContext);

  let toolRounds = 0;
  let lastPromptTokens: number | undefined;
  let lastCompletionTokens: number | undefined;

  while (toolRounds < maxRounds) {
    toolRounds += 1;

    const body: Record<string, unknown> = {
      model,
      messages: apiMessages,
      tools,
      stream: false,
      options: { temperature: input.temperature ?? 0.35 },
    };

    const controller = new AbortController();
    const timeout = input.timeoutMs
      ? setTimeout(() => controller.abort(), input.timeoutMs)
      : undefined;

    let data: Record<string, unknown>;
    try {
      data = assertRecord(
        await postJson(`${env.ollamaBaseUrl}/chat`, body, { signal: controller.signal }),
        'chat response'
      );
    } finally {
      if (timeout) clearTimeout(timeout);
    }

    const message = data.message;
    if (typeof message !== 'object' || message === null) {
      throw new Error('Ollama tool chat: missing message object');
    }
    const m = message as Record<string, unknown>;

    if (typeof data.prompt_eval_count === 'number') {
      lastPromptTokens = data.prompt_eval_count;
    }
    if (typeof data.eval_count === 'number') {
      lastCompletionTokens = data.eval_count;
    }

    apiMessages.push(assistantHistoryEntry(m));

    const toolCalls = m.tool_calls;
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
      const content = typeof m.content === 'string' ? m.content.trim() : '';
      return {
        text: content,
        model,
        toolRounds,
        ollamaMessages: apiMessages,
        promptTokens: lastPromptTokens,
        completionTokens: lastCompletionTokens,
      };
    }

    await appendToolResultsToMessages(toolCalls, runOneTool, apiMessages);
  }

  return {
    text:
      '[atlas] Tool loop stopped: maxToolRounds exceeded. Narrow the task or raise maxToolRounds on the request.',
    model,
    toolRounds,
    ollamaMessages: apiMessages,
    promptTokens: lastPromptTokens,
    completionTokens: lastCompletionTokens,
  };
}

export type AtlasOllamaProvider = ModelProvider & {
  chatWithTools(input: OllamaToolChatInput): Promise<OllamaToolChatResult>;
};

export function createOllamaModelProvider(): AtlasOllamaProvider {
  const base = env.ollamaBaseUrl;
  const chatModel = env.ollamaChatModel;
  const embedModel = env.ollamaEmbedModel;

  return {
    async generate(input: GenerateInput): Promise<GenerateOutput> {
      const msgs: { role: string; content: string }[] = [];
      if (input.systemPrompt?.trim()) {
        msgs.push({ role: 'system', content: input.systemPrompt.trim() });
      }
      for (const m of input.messages) {
        msgs.push({ role: m.role, content: m.content });
      }

      const model = input.modelOverride?.trim() || chatModel;

      const body: Record<string, unknown> = {
        model,
        messages: msgs,
        stream: false,
        options: { temperature: input.temperature ?? 0.35 },
      };
      if (input.jsonMode) body.format = 'json';

      const controller = new AbortController();
      const timeout = input.timeoutMs
        ? setTimeout(() => controller.abort(), input.timeoutMs)
        : undefined;

      let data: Record<string, unknown>;
      try {
        data = assertRecord(
          await postJson(`${base}/chat`, body, { signal: controller.signal }),
          'chat response'
        );
      } finally {
        if (timeout) clearTimeout(timeout);
      }
      const message = data.message;
      if (typeof message !== 'object' || message === null || !('content' in message)) {
        throw new Error('Ollama chat: missing message.content in response');
      }
      const content = (message as { content?: unknown }).content;
      if (typeof content !== 'string') {
        throw new Error('Ollama chat: message.content must be a string');
      }

      const promptEval = data.prompt_eval_count;
      const evalCount = data.eval_count;

      return {
        text: content.trim(),
        model,
        promptTokens: typeof promptEval === 'number' ? promptEval : undefined,
        completionTokens: typeof evalCount === 'number' ? evalCount : undefined,
      };
    },

    async embed(input: EmbeddingInput): Promise<number[][]> {
      if (input.input.length === 0) {
        throw new Error('Ollama embed: input.input must be non-empty');
      }

      const controller = new AbortController();
      const timeout = input.timeoutMs
        ? setTimeout(() => controller.abort(), input.timeoutMs)
        : undefined;

      let data: Record<string, unknown>;
      try {
        data = assertRecord(
          await postJson(
            `${base}/embed`,
            {
              model: embedModel,
              input: input.input.length === 1 ? input.input[0]! : input.input,
            },
            { signal: controller.signal }
          ),
          'embed response'
        );
      } finally {
        if (timeout) clearTimeout(timeout);
      }

      const expected = input.input.length;
      const out: number[][] = [];

      const embeddings = data.embeddings;
      if (Array.isArray(embeddings)) {
        for (let i = 0; i < embeddings.length; i++) {
          const row = embeddings[i];
          if (!Array.isArray(row) || row.some((v) => typeof v !== 'number')) {
            throw new Error(`Ollama embed: embeddings[${i}] must be number[]`);
          }
          out.push(row as number[]);
        }
      } else if (expected === 1 && Array.isArray(data.embedding)) {
        const row = data.embedding as unknown[];
        if (row.some((v) => typeof v !== 'number')) {
          throw new Error('Ollama embed: embedding must be number[]');
        }
        out.push(row as number[]);
      } else {
        throw new Error('Ollama embed: response must include embeddings[] or embedding[]');
      }

      if (out.length !== expected) {
        throw new Error(`Ollama embed: expected ${expected} embedding vector(s), got ${out.length}`);
      }

      return out;
    },

    chatWithTools(input: OllamaToolChatInput): Promise<OllamaToolChatResult> {
      return ollamaChatWithTools(input);
    },
  };
}
