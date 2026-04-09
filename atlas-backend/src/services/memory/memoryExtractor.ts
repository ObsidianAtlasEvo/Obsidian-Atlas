import { z } from 'zod';
import { env } from '../../config/env.js';
import type { MemoryCandidate, MemoryKind } from '../../types/atlas.js';
import type { ModelProvider } from '../model/modelProvider.js';

const TAG_HEURISTIC = 'extractor:v1-heuristic';
const TAG_LLM = 'extractor:v1-llm';

// ---------------------------------------------------------------------------
// Zod: structured memory candidates from background Ollama
// ---------------------------------------------------------------------------

export const llmMemoryCategorySchema = z.enum([
  'preference',
  'fact',
  'active_project',
  'rejected_behavior',
  'reusable_skill',
]);

export const memoryCandidateJsonSchema = z.object({
  category: llmMemoryCategorySchema,
  summary: z.string().min(1).max(400),
  detail: z.string().min(1).max(4000),
  confidence: z.number().min(0).max(1),
});

export const memoryExtractionArraySchema = z.object({
  candidates: z.array(memoryCandidateJsonSchema).max(12),
});

export type MemoryExtractionPayload = z.infer<typeof memoryExtractionArraySchema>;

function mapCategoryToKind(cat: z.infer<typeof llmMemoryCategorySchema>): MemoryKind {
  switch (cat) {
    case 'preference':
      return 'preference';
    case 'fact':
      return 'fact';
    case 'active_project':
      return 'project';
    case 'rejected_behavior':
      return 'rejection';
    case 'reusable_skill':
      return 'skill';
    default:
      return 'fact';
  }
}

function push(
  out: MemoryCandidate[],
  kind: MemoryKind,
  summary: string,
  detail: string,
  confidence: number,
  ruleId: string,
  tag: string
): void {
  if (confidence <= 0) return;
  out.push({
    kind,
    summary,
    detail,
    confidence: Math.min(1, Math.round(confidence * 100) / 100),
    tags: [tag, ruleId],
  });
}

/**
 * Deterministic extractor: pattern heuristics only, no model calls, no DB.
 */
export function extractMemoryCandidatesHeuristic(input: {
  userMessage: string;
  assistantMessage: string;
}): MemoryCandidate[] {
  const u = input.userMessage.trim();
  const a = input.assistantMessage.trim();
  const lower = u.toLowerCase();
  const combined = `${u}\n${a}`.toLowerCase();
  const out: MemoryCandidate[] = [];

  if (/\b(i prefer|i like|i'd rather|i would rather|please always|always use|never use)\b/i.test(u)) {
    push(out, 'preference', 'Stated preference in user message', u.slice(0, 280), 0.62, 'pref.phrase', TAG_HEURISTIC);
  }
  if (/\b(concise|brief|short answer|tl;dr|bullet points|no fluff)\b/i.test(lower)) {
    push(out, 'preference', 'Brevity / format preference', u.slice(0, 200), 0.58, 'pref.brevity', TAG_HEURISTIC);
  }
  if (/\b(my project|our project|i'm building|i am building|mvp|roadmap|sprint|release)\b/i.test(combined)) {
    push(out, 'project', 'Possible ongoing project mention', u.slice(0, 280) || a.slice(0, 280), 0.55, 'proj.keyword', TAG_HEURISTIC);
  }
  if (/\b(i want to|my goal|aiming to|plan to|trying to|hoping to)\b/i.test(lower)) {
    push(out, 'goal', 'Goal-oriented phrasing', u.slice(0, 280), 0.56, 'goal.phrase', TAG_HEURISTIC);
  }
  if (/\b(do not|don't|never|must not|avoid|strictly no)\b/i.test(u) && u.length < 400) {
    push(out, 'constraint', 'Prohibitive or constraint language', u.slice(0, 280), 0.54, 'constrain.neg', TAG_HEURISTIC);
  }
  if (/\b(formal|casual|friendly|professional|technical|rigorous|step by step)\b/i.test(lower)) {
    push(out, 'style', 'Tone or style cue', u.slice(0, 200), 0.52, 'style.adj', TAG_HEURISTIC);
  }
  if (/\b(i am a|i work as|i'm a|my role is|as a \w+ engineer|as a developer)\b/i.test(lower)) {
    push(out, 'identity', 'Possible role/identity cue', u.slice(0, 220), 0.5, 'id.role', TAG_HEURISTIC);
  }
  if (/\b(i live in|i'm based in|i am based in|my timezone is|i have \d+ (years?|kids?))\b/i.test(lower)) {
    push(out, 'fact', 'User-stated factual self-detail', u.slice(0, 220), 0.48, 'fact.self', TAG_HEURISTIC);
  }
  if (/\b(as you prefer|per your preference|you (?:asked|wanted) (?:for|me to))\b/i.test(a)) {
    push(out, 'preference', 'Assistant echoed a user preference', a.slice(0, 220), 0.45, 'pref.echo', TAG_HEURISTIC);
  }

  const seen = new Set<string>();
  const deduped: MemoryCandidate[] = [];
  for (const c of out) {
    const key = `${c.kind}:${c.summary.slice(0, 40)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(c);
  }

  return deduped.slice(0, 8);
}

function stripJsonFence(raw: string): string {
  const t = raw.trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)```$/m);
  return (m ? m[1] : t).trim();
}

/**
 * Background Ollama JSON extraction. Returns `[]` on failure (timeout, Zod, etc.).
 */
export async function extractMemoryCandidatesWithLlm(
  model: ModelProvider,
  input: { userMessage: string; assistantMessage: string }
): Promise<MemoryCandidate[]> {
  const system = `You are Atlas Memory Extractor v1. From the USER + ASSISTANT turn, extract durable items worth remembering.
Output ONLY valid JSON: {"candidates":[{"category":"preference|fact|active_project|rejected_behavior|reusable_skill","summary":"short label","detail":"verbatim or paraphrase","confidence":0-1}]}
Max 8 candidates. Use rejected_behavior when the user rejects Atlas behavior. Use reusable_skill for repeatable workflows. No markdown.`;

  const user = `USER:\n${input.userMessage.slice(0, 8000)}\n\nASSISTANT:\n${input.assistantMessage.slice(0, 8000)}`;

  try {
    const out = await model.generate({
      userId: 'evolution',
      messages: [{ role: 'user', content: user }],
      systemPrompt: system,
      jsonMode: true,
      temperature: 0.15,
      modelOverride: env.ollamaEvolutionModel,
      timeoutMs: env.evolutionLlmTimeoutMs,
    });

    const raw = JSON.parse(stripJsonFence(out.text));
    const parsed = memoryExtractionArraySchema.safeParse(raw);
    if (!parsed.success) {
      return [];
    }

    return parsed.data.candidates.map((c: z.infer<typeof memoryCandidateJsonSchema>) => ({
      kind: mapCategoryToKind(c.category),
      summary: c.summary,
      detail: c.detail,
      confidence: c.confidence,
      tags: [TAG_LLM, `cat:${c.category}`],
    }));
  } catch {
    return [];
  }
}

function dedupeCandidates(a: MemoryCandidate[]): MemoryCandidate[] {
  const seen = new Set<string>();
  const out: MemoryCandidate[] = [];
  for (const c of a) {
    const key = `${c.kind}:${c.summary.slice(0, 48)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out.slice(0, 16);
}

/**
 * Heuristic (sync) + optional LLM merge for the evolution pipeline.
 */
export async function extractMemoryCandidates(
  model: ModelProvider | undefined,
  input: { userMessage: string; assistantMessage: string }
): Promise<MemoryCandidate[]> {
  const h = extractMemoryCandidatesHeuristic(input);
  if (!model) {
    return h;
  }
  const llm = await extractMemoryCandidatesWithLlm(model, input);
  return dedupeCandidates([...h, ...llm]);
}
