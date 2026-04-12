/**
 * evaluationHarness.ts
 *
 * Formal evaluation framework for the Atlas governance layer.
 * Answers: Did this mutation improve output? Is Atlas becoming more
 * personalized but less truthful? Is Crucible getting sharper or just harsher?
 * Is Resonance more accurate or more theatrical?
 */

// ---------------------------------------------------------------------------
// External type references (mirrored from atlas-evolution for isolation)
// ---------------------------------------------------------------------------

export interface UserEvolutionProfile {
  userId: string;
  version: number;
  traits: Record<string, number>;         // trait name → strength 0-1
  communicationStyle: string;
  knowledgeDomains: string[];
  inferredValues: string[];
}

export interface UncertaintyRecord {
  claim: string;
  confidenceLevel: number;                // 0-1
  retracted: boolean;
  sessionId: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Evaluation types
// ---------------------------------------------------------------------------

export type EvaluationDimension =
  | 'personalization'      // how well response fits this user
  | 'truthfulness'         // factual accuracy and epistemic honesty
  | 'depth'                // substantive depth of response
  | 'voice_alignment'      // how well it sounds like Atlas
  | 'user_alignment'       // how well it matches user's evolved profile
  | 'crucible_sharpness'   // adversarial quality (sharp vs theatrical)
  | 'resonance_accuracy'   // mirror quality (accurate vs performative)
  | 'coherence';           // internal consistency

export interface EvaluationSnapshot {
  id: string;
  userId: string;
  timestamp: number;
  profileVersion: number;
  trigger: 'mutation_committed' | 'session_ended' | 'manual' | 'regression_check';
  scores: Record<EvaluationDimension, number>;  // 0-1 per dimension
  composite: number;
  regressions: RegressionFlag[];
  improvements: ImprovementFlag[];
  sampleResponses: SampleResponse[];            // responses evaluated to produce these scores
}

export interface RegressionFlag {
  dimension: EvaluationDimension;
  previousScore: number;
  currentScore: number;
  delta: number;
  severity: 'minor' | 'moderate' | 'critical';
  likelyCause: string;    // which mutation likely caused this
}

export interface ImprovementFlag {
  dimension: EvaluationDimension;
  previousScore: number;
  currentScore: number;
  delta: number;
  attributedMutation: string;  // mutation ID
}

export interface SampleResponse {
  query: string;
  response: string;
  overseerScore: number;
  humanizedScore: string;  // e.g. "Good depth, slightly off-voice"
}

// ---------------------------------------------------------------------------
// Dimension weights for composite scoring
// ---------------------------------------------------------------------------

const DIMENSION_WEIGHTS: Record<EvaluationDimension, number> = {
  personalization:     0.15,
  truthfulness:        0.20,
  depth:               0.15,
  voice_alignment:     0.10,
  user_alignment:      0.15,
  crucible_sharpness:  0.10,
  resonance_accuracy:  0.10,
  coherence:           0.05,
};

// Regression severity thresholds (delta = previous - current, positive = regression)
const SEVERITY_THRESHOLDS = {
  minor:    0.05,   // delta >= 0.05
  moderate: 0.12,   // delta >= 0.12
  critical: 0.20,   // delta >= 0.20
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  return `eval_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function computeComposite(scores: Record<EvaluationDimension, number>): number {
  let weighted = 0;
  for (const dim of Object.keys(scores) as EvaluationDimension[]) {
    weighted += scores[dim] * (DIMENSION_WEIGHTS[dim] ?? 0);
  }
  return Math.min(1, Math.max(0, weighted));
}

function classifyRegressionSeverity(delta: number): RegressionFlag['severity'] {
  if (delta >= SEVERITY_THRESHOLDS.critical) return 'critical';
  if (delta >= SEVERITY_THRESHOLDS.moderate) return 'moderate';
  return 'minor';
}

// ---------------------------------------------------------------------------
// Scoring helpers (heuristic implementations — production would use LLM calls)
// ---------------------------------------------------------------------------

/**
 * Estimate how well a response reflects a known user profile.
 * Looks for domain mentions, communication-style signals, and value resonance.
 */
function heuristicPersonalization(
  responses: SampleResponse[],
  profile: UserEvolutionProfile,
): number {
  if (responses.length === 0) return 0.5;

  const scores = responses.map((r) => {
    const text = (r.query + ' ' + r.response).toLowerCase();
    let hits = 0;
    let checks = 0;

    // Domain coverage
    for (const domain of profile.knowledgeDomains) {
      checks++;
      if (text.includes(domain.toLowerCase())) hits++;
    }

    // Value resonance (inferred values present in response)
    for (const val of profile.inferredValues) {
      checks++;
      if (text.includes(val.toLowerCase())) hits++;
    }

    // Communication style signal — verbose vs terse
    if (profile.communicationStyle === 'verbose' && r.response.split(' ').length > 150) {
      hits++;
      checks++;
    } else if (profile.communicationStyle === 'concise' && r.response.split(' ').length < 80) {
      hits++;
      checks++;
    } else if (profile.communicationStyle) {
      checks++;
    }

    // Baseline: incorporate overseer score
    const base = checks > 0 ? 0.5 * (hits / checks) + 0.5 * r.overseerScore : r.overseerScore;
    return Math.min(1, Math.max(0, base));
  });

  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

/**
 * Estimate truthfulness: penalise false confidence and retracted claims.
 */
function heuristicTruthfulness(
  responses: SampleResponse[],
  uncertainties: UncertaintyRecord[],
): number {
  if (responses.length === 0) return 0.5;

  // Phrases that signal overconfidence
  const overconfidencePatterns = [
    /\balways\b/gi,
    /\bnever\b/gi,
    /\bwithout (any )?doubt\b/gi,
    /\bI('m| am) certain\b/gi,
    /\bit is (a )?fact that\b/gi,
    /\bundeniably\b/gi,
    /\bobviously\b/gi,
  ];

  // Phrases that signal appropriate epistemic humility
  const hedgePatterns = [
    /\bI think\b/gi,
    /\bit seems\b/gi,
    /\bpossibly\b/gi,
    /\blikely\b/gi,
    /\bI('m| am) not sure\b/gi,
    /\buncertain\b/gi,
    /\bmight\b/gi,
  ];

  // How many retracted claims are being re-used in responses?
  const retractedClaims = uncertainties
    .filter((u) => u.retracted)
    .map((u) => u.claim.toLowerCase());

  const scores = responses.map((r) => {
    const text = r.response;
    let score = r.overseerScore;

    // Penalise overconfidence signals
    let overconfidenceCount = 0;
    for (const pat of overconfidencePatterns) {
      overconfidenceCount += (text.match(pat) ?? []).length;
    }
    score -= overconfidenceCount * 0.03;

    // Reward appropriate hedging
    let hedgeCount = 0;
    for (const pat of hedgePatterns) {
      hedgeCount += (text.match(pat) ?? []).length;
    }
    score += Math.min(0.1, hedgeCount * 0.02);

    // Penalise re-use of retracted claims
    for (const claim of retractedClaims) {
      if (text.toLowerCase().includes(claim)) {
        score -= 0.15;
      }
    }

    return Math.min(1, Math.max(0, score));
  });

  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

/**
 * Estimate response depth via length, specificity markers, and argument layering.
 */
function heuristicDepth(responses: SampleResponse[]): number {
  if (responses.length === 0) return 0.5;

  // Specificity signals: numbers, proper nouns, hedged sub-claims
  const specificityPatterns = [
    /\b\d+(\.\d+)?%?\b/g,           // numeric claims
    /\bfor example\b/gi,
    /\bspecifically\b/gi,
    /\bin particular\b/gi,
    /\bsuch as\b/gi,
    /\bbecause\b/gi,
    /\btherefore\b/gi,
    /\bnevertheless\b/gi,
    /\bhowever\b/gi,
    /\bon the other hand\b/gi,
  ];

  const scores = responses.map((r) => {
    const wordCount = r.response.split(/\s+/).length;
    const sentenceCount = (r.response.match(/[.!?]+/g) ?? []).length || 1;
    const avgSentenceLength = wordCount / sentenceCount;

    let specificityScore = 0;
    for (const pat of specificityPatterns) {
      specificityScore += (r.response.match(pat) ?? []).length;
    }

    // Normalise specificity relative to length
    const normSpecificity = Math.min(1, specificityScore / Math.max(1, wordCount / 50));

    // Length signal — 150-400 words is substantive; below or above gets diminishing returns
    let lengthScore: number;
    if (wordCount < 50) {
      lengthScore = wordCount / 50 * 0.4;
    } else if (wordCount <= 400) {
      lengthScore = 0.4 + (wordCount - 50) / 350 * 0.4;
    } else {
      lengthScore = 0.8;  // no additional credit for verbosity
    }

    // Average sentence length: too long → wall of text, too short → shallow
    const sentenceLengthScore =
      avgSentenceLength >= 12 && avgSentenceLength <= 30 ? 0.2 : 0.1;

    const raw = lengthScore + normSpecificity * 0.2 + sentenceLengthScore;
    // Blend with overseer score
    return Math.min(1, Math.max(0, raw * 0.6 + r.overseerScore * 0.4));
  });

  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

/**
 * Estimate voice alignment: does the response sound like Atlas
 * (direct, layered, intellectually honest, never performatively cheerful)?
 */
function heuristicVoiceAlignment(responses: SampleResponse[]): number {
  if (responses.length === 0) return 0.5;

  // Off-voice patterns (performative, sycophantic, hollow)
  const offVoicePatterns = [
    /\bgreat question\b/gi,
    /\bexcellent question\b/gi,
    /\bwonderful\b/gi,
    /\bof course!?\b/gi,
    /\babsolutely!?\b/gi,
    /\bcertainly!?\b/gi,
    /\bhappy to help\b/gi,
    /\bI hope this helps\b/gi,
    /\bfeel free to\b/gi,
  ];

  // On-voice patterns (measured, layered, direct)
  const onVoicePatterns = [
    /\bI think\b/gi,
    /\bone way to see this\b/gi,
    /\bthe tension here is\b/gi,
    /\blet me be precise\b/gi,
    /\bmore carefully\b/gi,
    /\bworth noting\b/gi,
    /\bthe stronger claim\b/gi,
  ];

  const scores = responses.map((r) => {
    let score = r.overseerScore;

    let offCount = 0;
    for (const pat of offVoicePatterns) {
      offCount += (r.response.match(pat) ?? []).length;
    }
    score -= offCount * 0.05;

    let onCount = 0;
    for (const pat of onVoicePatterns) {
      onCount += (r.response.match(pat) ?? []).length;
    }
    score += Math.min(0.1, onCount * 0.02);

    return Math.min(1, Math.max(0, score));
  });

  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

/**
 * Estimate Crucible sharpness: is adversarial opposition precise or theatrical?
 */
function heuristicCrucibleSharpness(responses: SampleResponse[]): number {
  if (responses.length === 0) return 0.5;

  const theatricalPatterns = [
    /\bcompletely wrong\b/gi,
    /\bentirely mistaken\b/gi,
    /\bunforgivably\b/gi,
    /\babsurd\b/gi,
    /\bpreposterous\b/gi,
    /\bweak\b/gi,  // vague dismissal without explanation
  ];

  const sharpPatterns = [
    /\bspecifically\b/gi,
    /\bthe premise here is\b/gi,
    /\byour argument assumes\b/gi,
    /\bthe contradiction is\b/gi,
    /\bthis conflates\b/gi,
    /\bthe distinction matters because\b/gi,
    /\bhere is the precise failure\b/gi,
  ];

  const scores = responses.map((r) => {
    let score = r.overseerScore;
    let theatrical = 0;
    for (const pat of theatricalPatterns) theatrical += (r.response.match(pat) ?? []).length;
    let sharp = 0;
    for (const pat of sharpPatterns) sharp += (r.response.match(pat) ?? []).length;
    score -= theatrical * 0.04;
    score += Math.min(0.15, sharp * 0.03);
    return Math.min(1, Math.max(0, score));
  });

  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

/**
 * Estimate Resonance accuracy: is the mirror precise or performing depth?
 */
function heuristicResonanceAccuracy(responses: SampleResponse[]): number {
  if (responses.length === 0) return 0.5;

  const theatricalDepthPatterns = [
    /\bdeep within\b/gi,
    /\bat your core\b/gi,
    /\bthe universe\b/gi,
    /\bprofound truth\b/gi,
    /\bsoul knows\b/gi,
    /\binner light\b/gi,
  ];

  const accuracyPatterns = [
    /\byou mentioned\b/gi,
    /\bin your words\b/gi,
    /\bwhat I heard was\b/gi,
    /\bthe pattern I notice\b/gi,
    /\bspecifically\b/gi,
  ];

  const scores = responses.map((r) => {
    let score = r.overseerScore;
    let theatrical = 0;
    for (const pat of theatricalDepthPatterns) theatrical += (r.response.match(pat) ?? []).length;
    let accurate = 0;
    for (const pat of accuracyPatterns) accurate += (r.response.match(pat) ?? []).length;
    score -= theatrical * 0.05;
    score += Math.min(0.15, accurate * 0.04);
    return Math.min(1, Math.max(0, score));
  });

  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

/**
 * Estimate internal coherence: are claims consistent within a response?
 */
function heuristicCoherence(responses: SampleResponse[]): number {
  if (responses.length === 0) return 0.5;

  const contradictionPatterns = [
    /\bon the one hand.{0,200}on the one hand/gis,  // repeated framing
    /\bbut also not\b/gi,
    /\bboth true and false\b/gi,
  ];

  const scores = responses.map((r) => {
    let score = r.overseerScore;
    let contradictions = 0;
    for (const pat of contradictionPatterns) {
      contradictions += (r.response.match(pat) ?? []).length;
    }
    score -= contradictions * 0.08;
    return Math.min(1, Math.max(0, score));
  });

  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

// ---------------------------------------------------------------------------
// Supabase fetch wrappers (lightweight — no external SDK dependency)
// ---------------------------------------------------------------------------

async function supabaseFetch(
  supabaseUrl: string,
  supabaseKey: string,
  path: string,
  method: 'GET' | 'POST' | 'DELETE',
  body?: unknown,
): Promise<unknown> {
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      Prefer: method === 'POST' ? 'return=representation' : '',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`Supabase ${method} ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// EvaluationHarness
// ---------------------------------------------------------------------------

export class EvaluationHarness {
  private snapshots: Map<string, EvaluationSnapshot[]>;  // userId -> snapshots

  constructor() {
    this.snapshots = new Map();
  }

  // -------------------------------------------------------------------------
  // Public: run a full evaluation for a user (called after mutation commits)
  // -------------------------------------------------------------------------

  async evaluate(
    userId: string,
    profileVersion: number,
    recentResponses: SampleResponse[],
    previousSnapshot: EvaluationSnapshot | null,
    trigger: EvaluationSnapshot['trigger'],
    profile?: UserEvolutionProfile,
    uncertainties?: UncertaintyRecord[],
  ): Promise<EvaluationSnapshot> {
    const resolvedProfile: UserEvolutionProfile = profile ?? {
      userId,
      version: profileVersion,
      traits: {},
      communicationStyle: '',
      knowledgeDomains: [],
      inferredValues: [],
    };

    const resolvedUncertainties: UncertaintyRecord[] = uncertainties ?? [];

    // Score all dimensions
    const scores: Record<EvaluationDimension, number> = {
      personalization:    this.scorePersonalization(recentResponses, resolvedProfile),
      truthfulness:       this.scoreTruthfulness(recentResponses, resolvedUncertainties),
      depth:              this.scoreDepth(recentResponses),
      voice_alignment:    heuristicVoiceAlignment(recentResponses),
      user_alignment:     this.scorePersonalization(recentResponses, resolvedProfile), // same signal, different weight path
      crucible_sharpness: heuristicCrucibleSharpness(recentResponses),
      resonance_accuracy: heuristicResonanceAccuracy(recentResponses),
      coherence:          heuristicCoherence(recentResponses),
    };

    const composite = computeComposite(scores);

    // Build partial snapshot (regressions/improvements need the snapshot object)
    const snapshot: EvaluationSnapshot = {
      id: generateId(),
      userId,
      timestamp: Date.now(),
      profileVersion,
      trigger,
      scores,
      composite,
      regressions: [],
      improvements: [],
      sampleResponses: recentResponses,
    };

    if (previousSnapshot) {
      snapshot.regressions = this.detectRegressions(snapshot, previousSnapshot);
      snapshot.improvements = this.detectImprovements(snapshot, previousSnapshot);
    }

    // Store in-memory
    if (!this.snapshots.has(userId)) {
      this.snapshots.set(userId, []);
    }
    this.snapshots.get(userId)!.push(snapshot);

    return snapshot;
  }

  // -------------------------------------------------------------------------
  // Private scoring methods
  // -------------------------------------------------------------------------

  private scorePersonalization(
    responses: SampleResponse[],
    profile: UserEvolutionProfile,
  ): number {
    return heuristicPersonalization(responses, profile);
  }

  private scoreTruthfulness(
    responses: SampleResponse[],
    uncertainties: UncertaintyRecord[],
  ): number {
    return heuristicTruthfulness(responses, uncertainties);
  }

  private scoreDepth(responses: SampleResponse[]): number {
    return heuristicDepth(responses);
  }

  // -------------------------------------------------------------------------
  // Private regression / improvement detection
  // -------------------------------------------------------------------------

  private detectRegressions(
    current: EvaluationSnapshot,
    previous: EvaluationSnapshot,
  ): RegressionFlag[] {
    const flags: RegressionFlag[] = [];

    for (const dim of Object.keys(current.scores) as EvaluationDimension[]) {
      const prev = previous.scores[dim] ?? 0;
      const curr = current.scores[dim] ?? 0;
      const delta = prev - curr;  // positive delta = regression

      if (delta >= SEVERITY_THRESHOLDS.minor) {
        const severity = classifyRegressionSeverity(delta);

        // Infer likely cause: the most recent mutation that touched this dimension
        const likelyCause = this.inferLikelyCause(current.userId, dim);

        flags.push({
          dimension: dim,
          previousScore: prev,
          currentScore: curr,
          delta,
          severity,
          likelyCause,
        });
      }
    }

    return flags;
  }

  private detectImprovements(
    current: EvaluationSnapshot,
    previous: EvaluationSnapshot,
  ): ImprovementFlag[] {
    const flags: ImprovementFlag[] = [];

    for (const dim of Object.keys(current.scores) as EvaluationDimension[]) {
      const prev = previous.scores[dim] ?? 0;
      const curr = current.scores[dim] ?? 0;
      const delta = curr - prev;  // positive delta = improvement

      if (delta >= SEVERITY_THRESHOLDS.minor) {
        flags.push({
          dimension: dim,
          previousScore: prev,
          currentScore: curr,
          delta,
          attributedMutation: this.inferMutationId(current.userId, dim),
        });
      }
    }

    return flags;
  }

  /**
   * Infer the most likely mutation that caused a regression in a given dimension.
   * In a full implementation this would cross-reference the mutation log; here we
   * use the profile version and dimension name as a proxy.
   */
  private inferLikelyCause(userId: string, dimension: EvaluationDimension): string {
    const history = this.snapshots.get(userId) ?? [];
    if (history.length < 2) return 'unknown_mutation';

    // Find the most recent snapshot that scored this dimension higher
    const lastBetter = [...history]
      .reverse()
      .find((s) => (s.scores[dimension] ?? 0) > 0.5);

    if (lastBetter) {
      return `mutation_after_profile_v${lastBetter.profileVersion}`;
    }
    return `mutation_at_profile_v${history[history.length - 1]?.profileVersion ?? 'unknown'}`;
  }

  private inferMutationId(userId: string, dimension: EvaluationDimension): string {
    const history = this.snapshots.get(userId) ?? [];
    const latest = history[history.length - 1];
    if (!latest) return 'unknown_mutation';
    return `mutation_${dimension}_v${latest.profileVersion}`;
  }

  // -------------------------------------------------------------------------
  // Public: evolution gating
  // -------------------------------------------------------------------------

  /**
   * Return true if:
   *   - any regression has severity 'critical', OR
   *   - 2+ dimensions show 'moderate' regression in the same snapshot.
   */
  shouldPauseEvolution(snapshot: EvaluationSnapshot): boolean {
    if (snapshot.regressions.some((r) => r.severity === 'critical')) {
      return true;
    }
    const moderateCount = snapshot.regressions.filter((r) => r.severity === 'moderate').length;
    return moderateCount >= 2;
  }

  // -------------------------------------------------------------------------
  // Public: trend analysis
  // -------------------------------------------------------------------------

  /**
   * Is Atlas improving or degrading over the last N snapshots for a given dimension?
   */
  getTrend(
    userId: string,
    dimension: EvaluationDimension,
    lastN: number,
  ): 'improving' | 'stable' | 'degrading' {
    const history = this.snapshots.get(userId) ?? [];
    if (history.length < 2) return 'stable';

    const window = history.slice(-Math.max(2, lastN));
    const dimScores = window.map((s) => s.scores[dimension] ?? 0);

    if (dimScores.length < 2) return 'stable';

    // Linear regression slope
    const n = dimScores.length;
    const indices = Array.from({ length: n }, (_, i) => i);
    const xMean = indices.reduce((a, b) => a + b, 0) / n;
    const yMean = dimScores.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < n; i++) {
      numerator += (indices[i] - xMean) * (dimScores[i] - yMean);
      denominator += (indices[i] - xMean) ** 2;
    }

    const slope = denominator === 0 ? 0 : numerator / denominator;

    if (slope > 0.015) return 'improving';
    if (slope < -0.015) return 'degrading';
    return 'stable';
  }

  // -------------------------------------------------------------------------
  // Persistence: Supabase atlas_evaluation_snapshots
  // -------------------------------------------------------------------------

  async save(userId: string, supabaseUrl: string, supabaseKey: string): Promise<void> {
    const userSnapshots = this.snapshots.get(userId);
    if (!userSnapshots || userSnapshots.length === 0) return;

    // Upsert each snapshot individually (idempotent via id)
    for (const snapshot of userSnapshots) {
      await supabaseFetch(
        supabaseUrl,
        supabaseKey,
        'atlas_evaluation_snapshots',
        'POST',
        {
          id: snapshot.id,
          user_id: snapshot.userId,
          timestamp: snapshot.timestamp,
          profile_version: snapshot.profileVersion,
          trigger: snapshot.trigger,
          scores: snapshot.scores,
          composite: snapshot.composite,
          regressions: snapshot.regressions,
          improvements: snapshot.improvements,
          sample_responses: snapshot.sampleResponses,
        },
      );
    }
  }

  async load(userId: string, supabaseUrl: string, supabaseKey: string): Promise<void> {
    const data = (await supabaseFetch(
      supabaseUrl,
      supabaseKey,
      `atlas_evaluation_snapshots?user_id=eq.${encodeURIComponent(userId)}&order=timestamp.asc`,
      'GET',
    )) as Array<Record<string, unknown>>;

    const loaded: EvaluationSnapshot[] = (data ?? []).map((row) => ({
      id: row['id'] as string,
      userId: row['user_id'] as string,
      timestamp: row['timestamp'] as number,
      profileVersion: row['profile_version'] as number,
      trigger: row['trigger'] as EvaluationSnapshot['trigger'],
      scores: row['scores'] as Record<EvaluationDimension, number>,
      composite: row['composite'] as number,
      regressions: (row['regressions'] as RegressionFlag[]) ?? [],
      improvements: (row['improvements'] as ImprovementFlag[]) ?? [],
      sampleResponses: (row['sample_responses'] as SampleResponse[]) ?? [],
    }));

    this.snapshots.set(userId, loaded);
  }
}
