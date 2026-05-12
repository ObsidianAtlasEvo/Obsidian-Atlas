/**
 * epistemicTaggerService.ts — V1.0
 *
 * Post-synthesis epistemic claim classifier. Identifies discrete factual
 * claims in an AI response and classifies each as:
 *   FACTUAL | INFERRED | SPECULATIVE | UNVERIFIABLE
 *
 * Runs in the cognitive orchestrator delivery stage AFTER synthesis is
 * complete, in parallel with constitutionalComplianceService. Never blocks
 * response delivery — 5s hard timeout, fails open.
 *
 * Persists each classified claim to truth_claims (migration 019) and returns
 * a structured result that the orchestrator embeds into the SSE stream as a
 * parseable HTML comment block.
 *
 * Model: env.openaiNanoModel (gpt-5.4-nano) via the OpenAI Responses API.
 */
import { env } from '../../config/env.js';
import { supabaseRest } from '../../db/supabase.js';

// ── Types ─────────────────────────────────────────────────────────────────

export type ClaimClassification = 'FACTUAL' | 'INFERRED' | 'SPECULATIVE' | 'UNVERIFIABLE';
export type ClaimConfidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type OverallUncertainty = 'LOW' | 'MEDIUM' | 'HIGH';

export interface EpistemicClaim {
  claim_text: string;
  classification: ClaimClassification;
  confidence: ClaimConfidence;
  basis: string;
}

export interface EpistemicTaggingResult {
  claims: EpistemicClaim[];
  overall_uncertainty: OverallUncertainty;
  tagged_response: string;
}

export interface TagResponseInput {
  responseText: string;
  contextSummary: string;
  userId: string;
  sessionId: string;
  responseId?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────

const TIMEOUT_MS = 5_000;
const MIN_TAG_LENGTH = 100;

const CLASSIFIER_PROMPT = `You are an epistemic classifier. Your job is to identify discrete factual claims in AI-generated text and classify each one.

Classifications:
- FACTUAL: Directly verifiable from public record, cited sources, or mathematical certainty
- INFERRED: Logically follows from available evidence but not directly stated in a source
- SPECULATIVE: Possible or plausible but without supporting evidence in context
- UNVERIFIABLE: Cannot be evaluated with available information

Rules:
- Only tag claims that a reader might act on or that carry informational weight
- Skip filler phrases, hedges, transitions, and meta-commentary
- Return 3-7 claims maximum (the most consequential ones)
- For each claim, give a one-line basis explaining the classification

Respond ONLY with valid JSON in this exact format:
{
  "claims": [
    {
      "claim_text": "exact or near-exact quote of the claim from the text",
      "classification": "FACTUAL|INFERRED|SPECULATIVE|UNVERIFIABLE",
      "confidence": "HIGH|MEDIUM|LOW",
      "basis": "one line explaining why"
    }
  ],
  "overall_uncertainty": "LOW|MEDIUM|HIGH"
}`;

const VALID_CLASSIFICATIONS: ReadonlySet<string> = new Set([
  'FACTUAL', 'INFERRED', 'SPECULATIVE', 'UNVERIFIABLE',
]);
const VALID_CONFIDENCE: ReadonlySet<string> = new Set(['HIGH', 'MEDIUM', 'LOW']);
const VALID_UNCERTAINTY: ReadonlySet<string> = new Set(['LOW', 'MEDIUM', 'HIGH']);

// ── Guard ─────────────────────────────────────────────────────────────────

/**
 * Decide whether a response is worth running through epistemic tagging.
 * Skips short, purely conversational, or clarifying-question-only outputs.
 */
export function shouldTag(responseText: string): boolean {
  const trimmed = responseText.trim();
  if (trimmed.length < MIN_TAG_LENGTH) return false;

  // Pure clarifying-question heuristic: response is essentially a single
  // question with no declarative sentences.
  const questionCount = (trimmed.match(/\?/g) ?? []).length;
  const sentenceCount = (trimmed.match(/[.!?]+/g) ?? []).length;
  if (sentenceCount > 0 && questionCount / sentenceCount > 0.7 && trimmed.length < 300) {
    return false;
  }

  // Purely conversational filler check: very few content tokens.
  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount < 30) return false;

  return true;
}

// ── Core entry point ──────────────────────────────────────────────────────

/**
 * Classify the claims in a response, persist them, and return the structured
 * result. Never throws — on any failure returns an empty-claims result so the
 * orchestrator can continue uninterrupted.
 */
export async function tagResponse(input: TagResponseInput): Promise<EpistemicTaggingResult> {
  const empty: EpistemicTaggingResult = {
    claims: [],
    overall_uncertainty: 'MEDIUM',
    tagged_response: input.responseText,
  };

  if (!shouldTag(input.responseText)) return empty;

  try {
    const raced = await Promise.race([
      callClassifier(input.responseText, input.contextSummary),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS)),
    ]);

    if (!raced) {
      console.warn('[epistemicTagger] Classifier timed out or returned null — skipping');
      return empty;
    }

    // Persist claims (fire-and-forget; do not block).
    void persistClaims(input.userId, input.sessionId, input.responseId, raced)
      .catch((err) => console.warn('[epistemicTagger] Persist failed:', err));

    return {
      claims: raced.claims,
      overall_uncertainty: raced.overall_uncertainty,
      tagged_response: buildTaggedResponse(input.responseText, raced.claims),
    };
  } catch (err) {
    console.warn('[epistemicTagger] tagResponse failed:', err);
    return empty;
  }
}

// ── Model call ────────────────────────────────────────────────────────────

interface ClassifierJson {
  claims: EpistemicClaim[];
  overall_uncertainty: OverallUncertainty;
}

async function callClassifier(
  responseText: string,
  contextSummary: string,
): Promise<ClassifierJson | null> {
  const apiKey = env.openaiApiKey;
  if (!apiKey) {
    console.warn('[epistemicTagger] OPENAI_API_KEY not set — skipping');
    return null;
  }

  const baseUrl = (env.openaiBaseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = env.openaiNanoModel;

  const userPayload = [
    'Response to classify:',
    responseText,
    '',
    'Context summary (what the AI had access to when generating this):',
    contextSummary || '(none provided)',
  ].join('\n');

  const requestBody = {
    model,
    input: [{ role: 'user', content: userPayload }],
    instructions: CLASSIFIER_PROMPT,
    stream: false,
    store: false,
    text: { format: { type: 'json_object' } },
    temperature: 0,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      console.warn('[epistemicTagger] Classifier aborted (timeout)');
    } else {
      console.warn('[epistemicTagger] Classifier fetch failed:', err);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    console.warn(`[epistemicTagger] Classifier HTTP ${response.status}`);
    return null;
  }

  interface RawNanoResponse {
    output_text?: string;
    status?: string;
  }

  let data: RawNanoResponse;
  try {
    data = (await response.json()) as RawNanoResponse;
  } catch {
    return null;
  }

  if (!data.output_text) return null;

  return parseClassifierJson(data.output_text);
}

function parseClassifierJson(raw: string): ClassifierJson | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;

  const rawClaims = Array.isArray(obj.claims) ? obj.claims : [];
  const claims: EpistemicClaim[] = [];
  for (const item of rawClaims) {
    if (!item || typeof item !== 'object') continue;
    const c = item as Record<string, unknown>;
    const claimText = typeof c.claim_text === 'string' ? c.claim_text : '';
    const classification = typeof c.classification === 'string' ? c.classification : '';
    const confidence = typeof c.confidence === 'string' ? c.confidence : '';
    const basis = typeof c.basis === 'string' ? c.basis : '';

    if (
      claimText.length === 0 ||
      !VALID_CLASSIFICATIONS.has(classification) ||
      !VALID_CONFIDENCE.has(confidence)
    ) continue;

    claims.push({
      claim_text: claimText,
      classification: classification as ClaimClassification,
      confidence: confidence as ClaimConfidence,
      basis,
    });
    if (claims.length >= 7) break;
  }

  const uncertaintyRaw = typeof obj.overall_uncertainty === 'string' ? obj.overall_uncertainty : '';
  const overall_uncertainty = VALID_UNCERTAINTY.has(uncertaintyRaw)
    ? (uncertaintyRaw as OverallUncertainty)
    : 'MEDIUM';

  return { claims, overall_uncertainty };
}

// ── Tagged-response builder ───────────────────────────────────────────────

/**
 * Produce a version of the response with inline [CLASSIFICATION] markers
 * appended after each claim's first occurrence. Used by clients that want
 * to render inline annotations (in addition to the metadata block).
 */
function buildTaggedResponse(responseText: string, claims: EpistemicClaim[]): string {
  let tagged = responseText;
  for (const claim of claims) {
    const needle = claim.claim_text.slice(0, 80);
    if (!needle) continue;
    const idx = tagged.indexOf(needle);
    if (idx < 0) continue;
    const insertAt = idx + needle.length;
    const marker = ` [${claim.classification}]`;
    tagged = tagged.slice(0, insertAt) + marker + tagged.slice(insertAt);
  }
  return tagged;
}

// ── Persistence ───────────────────────────────────────────────────────────

async function persistClaims(
  userId: string,
  sessionId: string,
  responseId: string | undefined,
  result: ClassifierJson,
): Promise<void> {
  if (result.claims.length === 0) return;

  const rows = result.claims.map((c) => ({
    user_id: userId,
    session_id: sessionId,
    response_id: responseId ?? null,
    claim_text: c.claim_text,
    classification: c.classification,
    confidence: c.confidence,
    basis: c.basis,
    overall_uncertainty: result.overall_uncertainty,
  }));

  await supabaseRest('POST', 'truth_claims', rows);
}
