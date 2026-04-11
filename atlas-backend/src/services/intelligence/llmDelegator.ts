import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../../config/env.js';
import { getPolicyProfile } from '../evolution/policyStore.js';
import {
  executeLocalOllama,
  resolveOmniComputeLane,
  type GroqRoutingDecision,
} from './omniRouter.js';
import { messagesWithPrimeDirective, type DelegatorMessage } from './primeDirective.js';
import { isSovereignOwnerEmail } from './router.js';
import { runMaximumClarityTrack } from './maximumClarityPipeline.js';
import {
  executeSwarmPipeline,
  planSwarmExecution,
  swarmPlanToGroqRoutingDecision,
  type SwarmTickerHandler,
} from './swarmOrchestrator.js';
import type { MirrorforgeState } from './telemetryTranslator.js';

export type StreamDeltaHandler = (textDelta: string) => void;

function resolveGroqExecution(): { base: string; apiKey: string; model: string } {
  const apiKey = env.groqApiKey?.trim() || env.cloudOpenAiApiKey?.trim();
  if (!apiKey) {
    throw new Error('Groq execution requires GROQ_API_KEY or ATLAS_CLOUD_OPENAI_API_KEY');
  }
  const base = (
    env.groqBaseUrl?.trim() ||
    env.cloudOpenAiBaseUrl?.trim() ||
    'https://api.groq.com/openai/v1'
  ).replace(/\/$/, '');
  const model =
    env.groqDelegateModel?.trim() ||
    env.cloudChatModel?.trim() ||
    'llama-3.1-8b-instant';
  return { base, apiKey, model };
}

function openAiStyleMessages(msgs: DelegatorMessage[]): { role: string; content: string }[] {
  return msgs.map((m) => ({ role: m.role, content: m.content }));
}

async function groqChatNonStream(
  msgs: DelegatorMessage[],
  options: { jsonMode?: boolean; temperature?: number; maxTokens?: number; signal?: AbortSignal }
): Promise<{ text: string; model: string }> {
  const { base, apiKey, model } = resolveGroqExecution();
  const body: Record<string, unknown> = {
    model,
    messages: openAiStyleMessages(msgs),
    temperature: options.temperature ?? 0.2,
    max_tokens: options.maxTokens ?? 2048,
    stream: false,
  };
  if (options.jsonMode) body.response_format = { type: 'json_object' };

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: options.signal,
  });
  const rawText = await res.text();
  let data: unknown;
  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch {
    throw new Error(`Groq non-stream: invalid JSON (${res.status})`);
  }
  if (!res.ok) {
    throw new Error(`Groq non-stream failed (${res.status}): ${rawText.slice(0, 200)}`);
  }
  const d = data as Record<string, unknown>;
  const choices = d.choices as unknown[] | undefined;
  const c0 = choices?.[0] as Record<string, unknown> | undefined;
  const message = c0?.message as Record<string, unknown> | undefined;
  const content = typeof message?.content === 'string' ? message.content : '';
  const mId = typeof d.model === 'string' ? d.model : model;
  return { text: content.trim(), model: mId };
}

async function groqChatStream(
  msgs: DelegatorMessage[],
  onDelta: StreamDeltaHandler,
  options: { temperature?: number; signal?: AbortSignal; timeoutMs?: number }
): Promise<{ fullText: string; model: string }> {
  const { base, apiKey, model } = resolveGroqExecution();
  const body: Record<string, unknown> = {
    model,
    messages: openAiStyleMessages(msgs),
    temperature: options.temperature ?? 0.35,
    stream: true,
  };

  const controller = new AbortController();
  const t = options.timeoutMs ? setTimeout(() => controller.abort(), options.timeoutMs) : undefined;
  let full = '';

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: options.signal ?? controller.signal,
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Groq stream failed (${res.status}): ${errText.slice(0, 200)}`);
    }
    if (!res.body) throw new Error('Groq stream: empty body');

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buffer = '';
    let outModel = model;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += dec.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';
      for (const block of parts) {
        for (const line of block.split('\n')) {
          const s = line.trim();
          if (!s.startsWith('data:')) continue;
          const payload = s.slice(5).trim();
          if (payload === '[DONE]') continue;
          let data: Record<string, unknown>;
          try {
            data = JSON.parse(payload) as Record<string, unknown>;
          } catch {
            continue;
          }
          if (typeof data.model === 'string') outModel = data.model;
          const choices = data.choices;
          if (!Array.isArray(choices) || !choices[0]) continue;
          const ch = choices[0] as Record<string, unknown>;
          const delta = ch.delta as Record<string, unknown> | undefined;
          const piece = typeof delta?.content === 'string' ? delta.content : '';
          if (piece) {
            full += piece;
            onDelta(piece);
          }
        }
      }
    }
    return { fullText: full.trim(), model: outModel };
  } finally {
    if (t) clearTimeout(t);
  }
}

function splitSystemAndRest(msgs: DelegatorMessage[]): { system: string; rest: DelegatorMessage[] } {
  const first = msgs[0];
  if (first?.role === 'system') {
    return { system: first.content, rest: msgs.slice(1) };
  }
  return { system: '', rest: msgs };
}

function geminiModelId(): string {
  return env.geminiModel?.trim() || 'gemini-2.0-flash';
}

async function geminiGenerateStream(
  msgs: DelegatorMessage[],
  onDelta: StreamDeltaHandler,
  options: { signal?: AbortSignal; timeoutMs?: number }
): Promise<{ fullText: string; model: string }> {
  const key = env.geminiApiKey?.trim();
  if (!key) throw new Error('Gemini execution requires GEMINI_API_KEY');

  const { system, rest } = splitSystemAndRest(msgs);
  const model = geminiModelId();
  const ai = new GoogleGenerativeAI(key);

  const contents = rest.map((m) => ({
    role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
    parts: [{ text: m.content }],
  }));

  const controller = new AbortController();
  const t = options.timeoutMs ? setTimeout(() => controller.abort(), options.timeoutMs) : undefined;
  let full = '';

  try {
    const stream = await ai.getGenerativeModel({ model: "gemini-1.5-flash" }).generateContentStream({
      contents,
      systemInstruction: system || undefined,
      generationConfig: {

        temperature: 0.35,
      },
    });

    for await (const chunk of stream.stream) {
      const piece = typeof chunk.text === 'string' ? chunk.text : '';
      if (piece) {
        full += piece;
        onDelta(piece);
      }
    }
    return { fullText: full.trim(), model };
  } finally {
    if (t) clearTimeout(t);
  }
}

async function ollamaChatStream(
  msgs: DelegatorMessage[],
  onDelta: StreamDeltaHandler,
  options: { model?: string; signal?: AbortSignal; timeoutMs?: number }
): Promise<{ fullText: string; model: string }> {
  const model = options.model?.trim() || env.ollamaChatModel;
  const body = {
    model,
    messages: openAiStyleMessages(msgs),
    stream: true,
    options: { temperature: 0.35 },
  };

  const controller = new AbortController();
  const t = options.timeoutMs ? setTimeout(() => controller.abort(), options.timeoutMs) : undefined;
  let full = '';

  try {
    const res = await fetch(`${env.ollamaBaseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: options.signal ?? controller.signal,
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Ollama stream failed (${res.status}): ${errText.slice(0, 200)}`);
    }
    if (!res.body) throw new Error('Ollama stream: empty body');

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += dec.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const s = line.trim();
        if (!s) continue;
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(s) as Record<string, unknown>;
        } catch {
          continue;
        }
        const message = data.message as Record<string, unknown> | undefined;
        const piece = typeof message?.content === 'string' ? message.content : '';
        if (piece) {
          full += piece;
          onDelta(piece);
        }
      }
    }
    return { fullText: full.trim(), model };
  } finally {
    if (t) clearTimeout(t);
  }
}

const OUTLINE_USER_TAG =
  'Produce a concise markdown OUTLINE only (headings + bullets) for how you will fully answer the user’s latest request. Do not write the final answer yet. Keep under ~800 words.';

/**
 * Multi-agent: Groq drafts outline (non-stream), Gemini streams the expanded answer with the same Prime Directive.
 */
async function executeMultiAgentStream(
  prepared: DelegatorMessage[],
  onDelta: StreamDeltaHandler,
  options: { signal?: AbortSignal; timeoutMs?: number }
): Promise<{ fullText: string; model: string }> {
  const outlineMsgs: DelegatorMessage[] = [...prepared, { role: 'user', content: OUTLINE_USER_TAG }];
  let outline: string;
  try {
    const out = await groqChatNonStream(outlineMsgs, {
      temperature: 0.25,
      maxTokens: 1200,
      signal: options.signal,
    });
    outline = out.text;
  } catch {
    outline =
      '(Outline step failed — answer the user directly with full rigor, using the same Prime Directive.)';
  }

  const expandMsgs: DelegatorMessage[] = [
    ...prepared,
    {
      role: 'user',
      content: `The Omni-Router assigned a two-phase plan. Expand the following OUTLINE into the full Atlas response (rigorous, structural, truth-first).\n\n--- OUTLINE ---\n${outline}\n--- END OUTLINE ---`,
    },
  ];

  const { fullText, model } = await geminiGenerateStream(expandMsgs, onDelta, options);
  return { fullText, model: `multi_agent:${model}` };
}

function lastUserMessage(messages: ReadonlyArray<{ role: string; content: string }>): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role === 'user') return messages[i]!.content;
  }
  return '';
}

export interface OmniOrchestrationStreamInput {
  userId: string;
  verifiedEmail: string | null;
  messages: ReadonlyArray<{ role: string; content: string }>;
  /** Short transcript slice for routing (optional). */
  conversationSnippet?: string;
  mirrorforge?: Partial<MirrorforgeState>;
  maximumClarity?: boolean;
  onDelta: StreamDeltaHandler;
  onSwarmTicker?: SwarmTickerHandler;
  onClarityTerminal?: (message: string) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * Swarm orchestrator: PolicyProfile + Chief-of-Staff plan + universal execution (Prime Directive on every call).
 */
export async function evaluateRouteThenExecuteStream(
  input: OmniOrchestrationStreamInput
): Promise<{ fullText: string; surface: string; model: string; routing: GroqRoutingDecision }> {
  const policyProfile = getPolicyProfile(input.userId);
  const userPrompt = lastUserMessage(input.messages);

  if (resolveOmniComputeLane(input.verifiedEmail) === 'sovereign_local') {
    const routing: GroqRoutingDecision = {
      target: 'local_gpu',
      rationale: 'god_mode_local_bypass',
    };
    const { fullText, surface, model } = await executeLocalOllama({
      userId: input.userId,
      messages: input.messages.map((m) => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      })),
      onDelta: input.onDelta,
      signal: input.signal,
      timeoutMs: input.timeoutMs ?? 240_000,
    });
    return { fullText, surface, model, routing };
  }

  if (input.maximumClarity === true) {
    const routing: GroqRoutingDecision = {
      target: 'multi_agent',
      rationale: 'maximum_clarity_consensus_track',
    };
    const { fullText, modelLabel } = await runMaximumClarityTrack({
      userId: input.userId,
      userPrompt,
      onTerminal: input.onClarityTerminal,
      onDelta: input.onDelta,
      signal: input.signal,
      timeoutMs: input.timeoutMs ?? 240_000,
    });
    return { fullText, surface: 'maximum_clarity', model: modelLabel, routing };
  }

  const plan = await planSwarmExecution({
    userPrompt,
    conversationSnippet: input.conversationSnippet,
    sovereignEligible: isSovereignOwnerEmail(input.verifiedEmail),
    policyProfile,
    mirrorforge: input.mirrorforge,
    signal: input.signal,
  });
  const routing = swarmPlanToGroqRoutingDecision(plan);
  const { fullText, surface, model } = await executeSwarmPipeline({
    userId: input.userId,
    plan,
    messages: input.messages,
    onDelta: input.onDelta,
    onSwarmTicker: input.onSwarmTicker,
    signal: input.signal,
    timeoutMs: input.timeoutMs,
  });
  return { fullText, surface, model, routing };
}

export interface DelegatorStreamInput {
  userId: string;
  routing: GroqRoutingDecision;
  /** Raw client messages (system roles ignored — Prime Directive replaces them). */
  messages: ReadonlyArray<{ role: string; content: string }>;
  onDelta: StreamDeltaHandler;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * Executes the routed surface with the Iron-Clad Prime Directive prepended to the message stack.
 */
export async function executeRoutedDelegatorStream(
  input: DelegatorStreamInput
): Promise<{ fullText: string; surface: string; model: string }> {
  const prepared = messagesWithPrimeDirective(input.userId, input.messages);
  const target = input.routing.target;
  const opt = { signal: input.signal, timeoutMs: input.timeoutMs };

  switch (target) {
    case 'local_gpu': {
      const { fullText, model } = await ollamaChatStream(prepared, input.onDelta, opt);
      return { fullText, surface: 'local_gpu', model };
    }
    case 'gemini_pro': {
      const { fullText, model } = await geminiGenerateStream(prepared, input.onDelta, opt);
      return { fullText, surface: 'gemini_pro', model };
    }
    case 'multi_agent': {
      const { fullText, model } = await executeMultiAgentStream(prepared, input.onDelta, opt);
      return { fullText, surface: 'multi_agent', model };
    }
    case 'groq':
    default: {
      const { fullText, model } = await groqChatStream(prepared, input.onDelta, {
        ...opt,
        temperature: 0.35,
      });
      return { fullText, surface: 'groq', model };
    }
  }
}

/* ────────────────────────────────────────────────────
 *  Simple non-streaming completion for internal services
 *  (governance console, evaluation harness, etc.)
 * ──────────────────────────────────────────────────── */
export async function complete(
  prompt: string,
  options?: { maxTokens?: number; temperature?: number; jsonMode?: boolean },
): Promise<string> {
  const msgs: DelegatorMessage[] = [{ role: 'user', content: prompt }];
  const { text } = await groqChatNonStream(msgs, {
    maxTokens: options?.maxTokens ?? 600,
    temperature: options?.temperature ?? 0.3,
    jsonMode: options?.jsonMode,
  });
  return text;
}
