import { z } from 'zod';
import { env } from '../../config/env.js';
import type { MemoryCandidate } from '../../types/atlas.js';
import type { ModelProvider } from '../model/modelProvider.js';

// ---------------------------------------------------------------------------
// Zod: strict JSON from background Ollama (epistemic evaluator)
// ---------------------------------------------------------------------------

export const epistemicAxisSchema = z.number().int().min(0).max(10);

export const epistemicEvalJsonSchema = z.object({
  truth_alignment: epistemicAxisSchema.describe('Factual grounding vs user prompt (0–10)'),
  cognitive_density: epistemicAxisSchema.describe('Depth, structure, non-trivial reasoning (0–10)'),
  style_adherence: epistemicAxisSchema.describe('Matches requested tone/format constraints (0–10)'),
  rationale: z.string().max(2000).optional(),
});

export type EpistemicEvalJson = z.infer<typeof epistemicEvalJsonSchema>;

export interface EvalResult {
  truthAlignment: number;
  cognitiveDensity: number;
  styleAdherence: number;
  /** Mean of the three axes on 0–1 scale (÷10). */
  combinedNormalized: number;
  /** Legacy scalar for traces / sorting (same as combinedNormalized). */
  responseScore: number;
  gapFlagged: boolean;
  datasetApproved: boolean;
  memoryCandidatesApproved: boolean;
  reasons: string[];
  source: 'llm' | 'rules' | 'llm+rules';
}

const MEM_CAND_APPROVE_MIN = 0.55;
const MEM_CAND_COUNT_MIN = 1;

function axesToResult(
  truth: number,
  cognitive: number,
  style: number,
  memoryCandidates: MemoryCandidate[],
  source: EvalResult['source'],
  extraReasons: string[]
): EvalResult {
  const combinedNormalized = Number(((truth + cognitive + style) / 30).toFixed(4));
  const responseScore = combinedNormalized;

  const strongCandidates = memoryCandidates.filter((c) => c.confidence >= MEM_CAND_APPROVE_MIN);
  const memoryCandidatesApproved =
    strongCandidates.length >= MEM_CAND_COUNT_MIN &&
    memoryCandidates.some((c) => c.confidence >= MEM_CAND_APPROVE_MIN);

  const gapFlagged = combinedNormalized < env.evalGapThreshold;

  const datasetApproved =
    !gapFlagged &&
    truth >= env.datasetMinAxisScore &&
    cognitive >= env.datasetMinAxisScore &&
    style >= env.datasetMinAxisScore &&
    combinedNormalized >= env.datasetScoreThreshold;

  const reasons = [
    `axes: truth=${truth}/10 cognitive=${cognitive}/10 style=${style}/10`,
    `combinedNormalized=${combinedNormalized} (gap<threshold ${env.evalGapThreshold} => ${gapFlagged})`,
    datasetApproved
      ? `datasetApproved: perfect-tier (axes≥${env.datasetMinAxisScore}, combined≥${env.datasetScoreThreshold})`
      : `datasetApproved: false`,
    memoryCandidatesApproved
      ? `memoryCandidatesApproved: ${strongCandidates.length} ≥ ${MEM_CAND_APPROVE_MIN}`
      : 'memoryCandidatesApproved: false',
    `source=${source}`,
    ...extraReasons,
  ];

  return {
    truthAlignment: truth,
    cognitiveDensity: cognitive,
    styleAdherence: style,
    combinedNormalized,
    responseScore,
    gapFlagged,
    datasetApproved,
    memoryCandidatesApproved,
    reasons,
    source,
  };
}

/**
 * Rule-based fallback when the LLM evaluator times out or returns invalid JSON.
 */
export function evaluateExchangeRules(input: {
  userMessage: string;
  assistantResponse: string;
  memoryCandidates: MemoryCandidate[];
}): EvalResult {
  const reasons: string[] = [];
  const u = input.userMessage.trim();
  const a = input.assistantResponse.trim();

  let truth = 7;
  if (u.length < 2) {
    truth = 3;
    reasons.push('rules.truth: trivial user turn');
  }
  if (a.length < 12 || /^error\b/i.test(a)) {
    truth = Math.min(truth, 4);
    reasons.push('rules.truth: weak assistant payload');
  }

  let cognitive = 7;
  if (a.length < 40) {
    cognitive = 5;
    reasons.push('rules.cognitive: short reply');
  } else if (a.length > 12000) {
    cognitive = 6;
    reasons.push('rules.cognitive: possible verbosity');
  }

  let style = 7;
  if (/\b(concise|brief)\b/i.test(u) && a.length > 2500) {
    style = 5;
    reasons.push('rules.style: brevity requested but long reply');
  }

  if (input.memoryCandidates.length > 0) {
    cognitive = Math.min(10, cognitive + 1);
    reasons.push('rules.cognitive: memory candidates present');
  }

  return axesToResult(truth, cognitive, style, input.memoryCandidates, 'rules', reasons);
}

function stripJsonFence(raw: string): string {
  const t = raw.trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)```$/m);
  return (m ? m[1] : t).trim();
}

/**
 * Background Ollama call: JSON-only epistemic scores. Returns `null` on any failure (timeout, Zod, parse).
 */
export async function evaluateExchangeWithLlm(
  model: ModelProvider,
  input: { userMessage: string; assistantResponse: string; memoryCandidates: MemoryCandidate[] }
): Promise<EvalResult | null> {
  const system = `You are Atlas Epistemic Evaluator v1. Output ONLY valid JSON matching this shape:
{"truth_alignment":0-10,"cognitive_density":0-10,"style_adherence":0-10,"rationale":"optional short string"}
Scores are integers 0-10. Be strict: 10 means flawless for that axis. No markdown, no keys beyond those four.`;

  const user = `USER:\n${input.userMessage.slice(0, 12000)}\n\nASSISTANT:\n${input.assistantResponse.slice(0, 12000)}`;

  try {
    const out = await model.generate({
      userId: 'evolution',
      messages: [{ role: 'user', content: user }],
      systemPrompt: system,
      jsonMode: true,
      temperature: 0.1,
      modelOverride: env.ollamaEvolutionModel,
      timeoutMs: env.evolutionLlmTimeoutMs,
    });

    const parsed = epistemicEvalJsonSchema.safeParse(JSON.parse(stripJsonFence(out.text)));
    if (!parsed.success) {
      return null;
    }

    const e = parsed.data;
    const extra = e.rationale ? [`llm.rationale: ${e.rationale}`] : [];
    return axesToResult(
      e.truth_alignment,
      e.cognitive_density,
      e.style_adherence,
      input.memoryCandidates,
      'llm',
      extra
    );
  } catch {
    return null;
  }
}

/**
 * Prefer LLM eval; merge rationale with rules if LLM and rules disagree strongly, else use LLM only.
 * On LLM failure, pure rules.
 */
export async function evaluateExchange(
  model: ModelProvider | undefined,
  input: {
    userMessage: string;
    assistantResponse: string;
    memoryCandidates: MemoryCandidate[];
  }
): Promise<EvalResult> {
  const rules = evaluateExchangeRules(input);
  if (!model) {
    return rules;
  }

  const llm = await evaluateExchangeWithLlm(model, input);
  if (!llm) {
    rules.reasons.push('llm: skipped or failed — using rules fallback');
    return { ...rules, source: 'rules' };
  }

  // If LLM is far more pessimistic than rules on combined score, blend (stability).
  const delta = Math.abs(llm.combinedNormalized - rules.combinedNormalized);
  if (delta > 0.2) {
    const t = Math.round((llm.truthAlignment + rules.truthAlignment) / 2);
    const c = Math.round((llm.cognitiveDensity + rules.cognitiveDensity) / 2);
    const s = Math.round((llm.styleAdherence + rules.styleAdherence) / 2);
    return axesToResult(t, c, s, input.memoryCandidates, 'llm+rules', [
      `blended: llm vs rules delta=${delta.toFixed(2)}`,
    ]);
  }

  return llm;
}
