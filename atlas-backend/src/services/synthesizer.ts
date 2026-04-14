// ── Atlas Synthesis Engine ────────────────────────────────────────────────────
// The "hub" that takes multiple model responses and synthesizes them through
// the user's personal cognitive lens. Uses the local Ollama model so synthesis
// is always available regardless of API key configuration.
//
// The synthesis prompt is carefully structured to:
//  1. Surface consensus and disagreement across models
//  2. Apply the user's doctrine as a lens / filter
//  3. Honor the user's posture (depth, directness, challenge level)
//  4. Produce a unified response better than any single model's output
//  5. Return structured metadata alongside the synthesized text

import { complete } from './ollama.js';
import { config } from '../config.js';
import { env } from '../config/env.js';
import type { ModelResponse } from './orchestrator.js';

// ── Public types ──────────────────────────────────────────────────────────────

export interface UserPosture {
  /** 0–1: how deep vs. surface-level the response should go */
  depth: number;
  /** 0–1: how much to challenge assumptions vs. affirm */
  challenge: number;
  /** 0–1: how direct vs. diplomatic the tone should be */
  directness: number;
  /** e.g. 'expert', 'intermediate', 'casual' */
  languageLevel: string;
}

export interface UserContext {
  /** Core beliefs / values that shape interpretation */
  doctrine: string[];
  /** Currently active goals / commitments */
  activeDirectives: string[];
  posture: UserPosture;
  /** e.g. 'strategic', 'reflective', 'analytical', 'creative' */
  resonanceMode: string;
}

export interface SynthesisRequest {
  originalQuery: string;
  modelResponses: ModelResponse[];
  userContext: UserContext;
}

export interface SourceContribution {
  modelId: string;
  contribution: string;
}

export interface SynthesisResult {
  synthesizedResponse: string;
  sourcesUsed: SourceContribution[];
  consensusAreas: string[];
  disagreementAreas: string[];
  /** Atlas's own considered judgment after weighing all inputs */
  atlasJudgment: string;
  /** 0–1: how confident Atlas is in the synthesis */
  confidence: number;
}

// ── Cloud completion fallback (reuses the same OpenAI-compatible endpoint
//    configured for the intelligence router) ──────────────────────────────

async function completeViaCloud(
  messages: Array<{ role: string; content: string }>,
  opts: { temperature?: number; maxTokens?: number; timeoutMs?: number } = {},
): Promise<string> {
  const base = env.cloudOpenAiBaseUrl?.replace(/\/$/, '') ?? '';
  const apiKey = env.cloudOpenAiApiKey?.trim() ?? '';
  const model = env.cloudChatModel?.trim() ?? '';

  if (!base || !apiKey || !model) {
    throw new Error(
      'Cloud synthesis requires ATLAS_CLOUD_OPENAI_BASE_URL / ATLAS_CLOUD_OPENAI_API_KEY / ATLAS_CLOUD_CHAT_MODEL (or GROQ_API_KEY).',
    );
  }

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: opts.temperature ?? 0.4,
      max_tokens: opts.maxTokens ?? 6000,
      stream: false,
    }),
    signal: opts.timeoutMs ? AbortSignal.timeout(opts.timeoutMs) : undefined,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Cloud synthesis failed (${res.status}): ${detail.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Cloud synthesis returned empty content');
  return text;
}

// ── Synthesis prompt builder ──────────────────────────────────────────────────

function buildSynthesisPrompt(request: SynthesisRequest): string {
  const { originalQuery, modelResponses, userContext } = request;
  const { doctrine, activeDirectives, posture, resonanceMode } = userContext;

  const successfulResponses = modelResponses.filter((r) => r.status === 'success');
  const failedModels = modelResponses
    .filter((r) => r.status !== 'success')
    .map((r) => r.modelId);

  // Format each model's response for the prompt
  const modelResponsesText = successfulResponses
    .map(
      (r, i) =>
        `--- MODEL ${i + 1}: ${r.modelId} ---\n${r.content}\n`,
    )
    .join('\n');

  // Format user doctrine
  const doctrineText = doctrine.length > 0
    ? doctrine.map((d, i) => `  ${i + 1}. ${d}`).join('\n')
    : '  (No specific doctrine defined)';

  // Format active directives
  const directivesText = activeDirectives.length > 0
    ? activeDirectives.map((d, i) => `  ${i + 1}. ${d}`).join('\n')
    : '  (No active directives)';

  // Map posture values to descriptive language
  const depthLabel = posture.depth > 0.7 ? 'deep and comprehensive' : posture.depth > 0.4 ? 'moderately detailed' : 'concise and high-level';
  const challengeLabel = posture.challenge > 0.7 ? 'actively challenge assumptions and surface blindspots' : posture.challenge > 0.4 ? 'gently push back where warranted' : 'primarily affirm and build on existing thinking';
  const directnessLabel = posture.directness > 0.7 ? 'direct and unambiguous' : posture.directness > 0.4 ? 'balanced' : 'diplomatic and careful';

  return `You are Atlas — an advanced cognitive synthesis engine. You have received a user's question and responses from multiple AI models. Your task is to synthesize these into a single superior response that is better than any individual model's output.

═══════════════════════════════════════
ORIGINAL USER QUERY:
${originalQuery}
═══════════════════════════════════════

MODEL RESPONSES (${successfulResponses.length} models responded${failedModels.length > 0 ? `, ${failedModels.length} failed: ${failedModels.join(', ')}` : ''}):

${modelResponsesText}

═══════════════════════════════════════
USER'S COGNITIVE LENS:
═══════════════════════════════════════

DOCTRINE (core beliefs / values that shape interpretation):
${doctrineText}

ACTIVE DIRECTIVES (current goals / commitments to honor):
${directivesText}

RESONANCE MODE: ${resonanceMode}
LANGUAGE LEVEL: ${posture.languageLevel}
RESPONSE DEPTH: ${depthLabel}
CHALLENGE POSTURE: ${challengeLabel}
TONE: ${directnessLabel}

═══════════════════════════════════════
SYNTHESIS INSTRUCTIONS:
═══════════════════════════════════════

1. IDENTIFY CONSENSUS: Find where multiple models agree — these areas carry more epistemic weight. Note where unanimity is strong.

2. IDENTIFY DISAGREEMENT: Where models differ meaningfully, analyze WHY they differ. Which perspective is more defensible? Which aligns better with the user's doctrine?

3. APPLY THE COGNITIVE LENS: Filter every insight through the user's doctrine and active directives. Ideas that contradict core beliefs should be noted but not blindly accepted. Ideas that serve active directives should be amplified.

4. SYNTHESIZE — DON'T AVERAGE: Do not produce a bland average of the responses. Extract the best insights from each model, discard low-value content, and weave them into a single coherent response that is MORE insightful than any individual model produced.

5. HONOR THE POSTURE: Calibrate depth, challenge level, and tone to match the specified posture settings.

6. FORM ATLAS JUDGMENT: After synthesis, state your own considered judgment. What does Atlas believe, having weighed all the inputs through the user's lens?

═══════════════════════════════════════
OUTPUT FORMAT:
═══════════════════════════════════════

Write your synthesized response first (as clean prose, no preamble like "Here is my synthesis:").

Then, on a new line, output EXACTLY this JSON block (no markdown fences, raw JSON):

ATLAS_METADATA:
{
  "sourcesUsed": [
    { "modelId": "<model_id>", "contribution": "<one sentence describing what this model uniquely contributed>" }
  ],
  "consensusAreas": ["<area 1>", "<area 2>"],
  "disagreementAreas": ["<area 1>", "<area 2>"],
  "atlasJudgment": "<Atlas's own considered judgment in 2-3 sentences>",
  "confidence": <0.0-1.0>
}`;
}

// ── Response parser ───────────────────────────────────────────────────────────

interface AtlasMetadata {
  sourcesUsed: SourceContribution[];
  consensusAreas: string[];
  disagreementAreas: string[];
  atlasJudgment: string;
  confidence: number;
}

function parseAtlasResponse(
  rawResponse: string,
  request: SynthesisRequest,
): SynthesisResult {
  const markerIdx = rawResponse.indexOf('ATLAS_METADATA:');

  if (markerIdx === -1) {
    // Fallback: no structured metadata found — use the full response
    return {
      synthesizedResponse: rawResponse.trim(),
      sourcesUsed: request.modelResponses
        .filter((r) => r.status === 'success')
        .map((r) => ({ modelId: r.modelId, contribution: 'Contributed to synthesis' })),
      consensusAreas: [],
      disagreementAreas: [],
      atlasJudgment: 'Synthesis completed without structured metadata.',
      confidence: 0.7,
    };
  }

  const synthesizedResponse = rawResponse.slice(0, markerIdx).trim();
  const metadataJson = rawResponse.slice(markerIdx + 'ATLAS_METADATA:'.length).trim();

  try {
    const metadata = JSON.parse(metadataJson) as AtlasMetadata;
    return {
      synthesizedResponse,
      sourcesUsed: Array.isArray(metadata.sourcesUsed) ? metadata.sourcesUsed : [],
      consensusAreas: Array.isArray(metadata.consensusAreas) ? metadata.consensusAreas : [],
      disagreementAreas: Array.isArray(metadata.disagreementAreas) ? metadata.disagreementAreas : [],
      atlasJudgment: typeof metadata.atlasJudgment === 'string' ? metadata.atlasJudgment : '',
      confidence: typeof metadata.confidence === 'number'
        ? Math.min(1, Math.max(0, metadata.confidence))
        : 0.7,
    };
  } catch {
    // JSON parse failed — return synthesis without metadata
    return {
      synthesizedResponse,
      sourcesUsed: request.modelResponses
        .filter((r) => r.status === 'success')
        .map((r) => ({ modelId: r.modelId, contribution: 'Contributed to synthesis' })),
      consensusAreas: [],
      disagreementAreas: [],
      atlasJudgment: 'Metadata parsing failed — synthesis content preserved.',
      confidence: 0.6,
    };
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export class Synthesizer {
  /**
   * Synthesize multiple model responses through the user's cognitive lens.
   *
   * Uses the local Ollama model to guarantee availability regardless of
   * external API key configuration.
   */
  async synthesize(request: SynthesisRequest): Promise<SynthesisResult> {
    const successfulResponses = request.modelResponses.filter(
      (r) => r.status === 'success',
    );

    if (successfulResponses.length === 0) {
      return {
        synthesizedResponse:
          'No model responses were available to synthesize. All queried models either failed or timed out.',
        sourcesUsed: [],
        consensusAreas: [],
        disagreementAreas: [],
        atlasJudgment: 'Unable to synthesize — no successful model responses.',
        confidence: 0,
      };
    }

    // If only one model succeeded, return it directly with minimal synthesis overhead
    if (successfulResponses.length === 1) {
      const solo = successfulResponses[0]!;
      return {
        synthesizedResponse: solo.content,
        sourcesUsed: [{ modelId: solo.modelId, contribution: 'Sole responding model' }],
        consensusAreas: [],
        disagreementAreas: [],
        atlasJudgment: 'Single model response — no cross-model synthesis performed.',
        confidence: 0.75,
      };
    }

    const synthesisPrompt = buildSynthesisPrompt(request);

    const messages = [{ role: 'user' as const, content: synthesisPrompt }];

    let rawResponse: string;
    if (env.disableLocalOllama) {
      // Cloud path — route through the configured OpenAI-compatible provider
      rawResponse = await completeViaCloud(messages, {
        temperature: 0.4,
        maxTokens: 6000,
        timeoutMs: 120_000,
      });
    } else {
      // Sovereign owner path — use local Ollama
      rawResponse = await complete(messages, {
        model: config.chatModel,
        temperature: 0.4,
        maxTokens: 6000,
        timeoutMs: 120_000,
      });
    }

    return parseAtlasResponse(rawResponse, request);
  }
}

// Singleton for use across routes
export const synthesizer = new Synthesizer();
