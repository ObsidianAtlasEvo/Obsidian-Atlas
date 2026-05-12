/**
 * constitutionalComplianceService.ts — V1.0
 *
 * Per-turn constitutional principle check. After synthesis completes, this
 * service evaluates the assistant response against the user's active
 * principles (stored in user_constitutional_principles) and writes a
 * pass/fail row + any violations to behavior_transparency_log.
 *
 * Runs in parallel with epistemicTaggerService in the orchestrator delivery
 * stage. Never blocks delivery:
 *   - 4s hard timeout
 *   - No-op (passed=true) when user has no active principles (no model call)
 *   - Fails open on any error
 */
import { env } from '../../config/env.js';
import { supabaseRest } from '../../db/supabase.js';

// ── Types ─────────────────────────────────────────────────────────────────

export type ViolationSeverity = 'MINOR' | 'MODERATE' | 'MAJOR';

export interface ConstitutionalViolation {
  principle_id: string;
  principle_text: string;
  violation_description: string;
  severity: ViolationSeverity;
}

export interface ConstitutionalCheckResult {
  passed: boolean;
  principles_checked: number;
  violations: ConstitutionalViolation[];
  compliance_score: number; // 0.0–1.0
}

export interface CheckResponseInput {
  responseText: string;
  userId: string;
  sessionId: string;
  responseId?: string;
}

interface StoredPrinciple {
  id: string;
  principle_text: string;
}

const TIMEOUT_MS = 4_000;

const VALID_SEVERITY: ReadonlySet<string> = new Set(['MINOR', 'MODERATE', 'MAJOR']);

const COMPLIANCE_PROMPT = `You are a constitutional compliance evaluator. Check whether an AI response violates any of the user's stated principles.

For each principle, determine if the response violates it. A violation means the response clearly contradicts or fails to honor the stated principle — not merely that it could have done better.

Respond ONLY with valid JSON:
{
  "violations": [
    {
      "principle_id": "the id from the principles list",
      "principle_text": "the principle text",
      "violation_description": "specific description of how the response violates it",
      "severity": "MINOR|MODERATE|MAJOR"
    }
  ],
  "compliance_score": 0.0-1.0
}

Return an empty violations array if the response is compliant. Do not invent violations.`;

// ── Core entry point ──────────────────────────────────────────────────────

export async function checkResponse(input: CheckResponseInput): Promise<ConstitutionalCheckResult> {
  const allPass = (count: number): ConstitutionalCheckResult => ({
    passed: true,
    principles_checked: count,
    violations: [],
    compliance_score: 1.0,
  });

  let principles: StoredPrinciple[] = [];
  try {
    principles = await fetchActivePrinciples(input.userId);
  } catch (err) {
    console.warn('[constitutionalCompliance] Failed to fetch principles:', err);
    return allPass(0);
  }

  if (principles.length === 0) return allPass(0);

  let result: ConstitutionalCheckResult;
  try {
    const raced = await Promise.race([
      runComplianceCheck(input.responseText, principles),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS)),
    ]);

    if (!raced) {
      console.warn('[constitutionalCompliance] Check timed out — failing open');
      result = allPass(principles.length);
    } else {
      result = raced;
    }
  } catch (err) {
    console.warn('[constitutionalCompliance] Check failed:', err);
    result = allPass(principles.length);
  }

  // Persist transparency log (fire-and-forget).
  void persistLog(input.userId, input.sessionId, input.responseId, result)
    .catch((err) => console.warn('[constitutionalCompliance] Persist failed:', err));

  return result;
}

// ── Principle fetch ───────────────────────────────────────────────────────

async function fetchActivePrinciples(userId: string): Promise<StoredPrinciple[]> {
  const result = await supabaseRest<Array<{ id: string; principle_text: string }>>(
    'GET',
    `user_constitutional_principles?user_id=eq.${encodeURIComponent(userId)}&active=is.true&select=id,principle_text`,
  );
  if (!result.ok || !result.data) return [];
  return result.data;
}

// ── Model call ────────────────────────────────────────────────────────────

async function runComplianceCheck(
  responseText: string,
  principles: StoredPrinciple[],
): Promise<ConstitutionalCheckResult | null> {
  const apiKey = env.openaiApiKey;
  if (!apiKey) {
    console.warn('[constitutionalCompliance] OPENAI_API_KEY not set — failing open');
    return null;
  }

  const baseUrl = (env.openaiBaseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = env.openaiNanoModel;

  const principlesList = principles
    .map((p) => `- id=${p.id}: ${p.principle_text}`)
    .join('\n');

  const userPayload = [
    "User's active principles:",
    principlesList,
    '',
    'AI response to evaluate:',
    responseText,
  ].join('\n');

  const requestBody = {
    model,
    input: [{ role: 'user', content: userPayload }],
    instructions: COMPLIANCE_PROMPT,
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
      console.warn('[constitutionalCompliance] Aborted (timeout)');
    } else {
      console.warn('[constitutionalCompliance] Fetch failed:', err);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    console.warn(`[constitutionalCompliance] HTTP ${response.status}`);
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

  return parseCheckJson(data.output_text, principles.length);
}

function parseCheckJson(raw: string, principlesChecked: number): ConstitutionalCheckResult | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;

  const rawViolations = Array.isArray(obj.violations) ? obj.violations : [];
  const violations: ConstitutionalViolation[] = [];

  for (const item of rawViolations) {
    if (!item || typeof item !== 'object') continue;
    const v = item as Record<string, unknown>;
    const principleId = typeof v.principle_id === 'string' ? v.principle_id : '';
    const principleText = typeof v.principle_text === 'string' ? v.principle_text : '';
    const violationDescription = typeof v.violation_description === 'string'
      ? v.violation_description : '';
    const severity = typeof v.severity === 'string' ? v.severity : '';

    if (!principleId || !principleText || !violationDescription) continue;
    if (!VALID_SEVERITY.has(severity)) continue;

    violations.push({
      principle_id: principleId,
      principle_text: principleText,
      violation_description: violationDescription,
      severity: severity as ViolationSeverity,
    });
  }

  let complianceScore = typeof obj.compliance_score === 'number' ? obj.compliance_score : 1.0;
  if (!Number.isFinite(complianceScore)) complianceScore = violations.length === 0 ? 1.0 : 0.5;
  complianceScore = Math.max(0, Math.min(1, complianceScore));

  return {
    passed: violations.length === 0,
    principles_checked: principlesChecked,
    violations,
    compliance_score: Math.round(complianceScore * 1000) / 1000,
  };
}

// ── Persistence ───────────────────────────────────────────────────────────

async function persistLog(
  userId: string,
  sessionId: string,
  responseId: string | undefined,
  result: ConstitutionalCheckResult,
): Promise<void> {
  await supabaseRest('POST', 'behavior_transparency_log', [{
    user_id: userId,
    session_id: sessionId,
    response_id: responseId ?? null,
    passed: result.passed,
    principles_checked: result.principles_checked,
    compliance_score: result.compliance_score,
    violations: result.violations,
  }]);
}
