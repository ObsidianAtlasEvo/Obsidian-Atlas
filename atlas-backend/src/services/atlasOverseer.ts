// =============================================================================
// Obsidian Atlas — AtlasOverseer
//
// The mandatory final stage in the chat pipeline. Every raw synthesis output
// passes through here before it reaches the user. The Overseer evaluates
// quality, depth, and truth; rewrites the response through Atlas's identity;
// then rewrites it again through the lens of this specific user's evolved
// profile.
//
// It is not a moderation filter. It is an intelligence translator.
// =============================================================================

import {
  type AtlasAdaptationState,
  type EnhancementType,
} from '../types/evolutionTypes.js';

// ─────────────────────────────────────────────────────────────────────────────
// Public type definitions
// ─────────────────────────────────────────────────────────────────────────────

export interface OverseerInput {
  userId: string;
  sessionId: string;
  originalQuery: string;
  /** The merged output from the multi-model synthesis stage. */
  rawSynthesis: string;
  /** Individual model responses before synthesis. */
  modelResponses: ModelResponse[];
  /** 'analytical' | 'strategic' | 'reflective' | etc. */
  queryMode: string;
  /** From EvolutionEngine — null when no profile exists yet. */
  adaptationState: AtlasAdaptationState | null;
  /** The full Atlas system prompt used for this request. */
  atlasSystemPrompt: string;
}

export interface ModelResponse {
  model: string;
  provider: string;
  content: string;
  durationMs: number;
  status: 'success' | 'error' | 'timeout';
  tokenCount?: number;
}

export interface OverseerEvaluation {
  /** 0–1 composite quality score. */
  qualityScore: number;
  /** 0–1 depth of the response. */
  depthScore: number;
  /** 0–1 internal consistency across models. */
  truthScore: number;
  /** 0–1 fit with Atlas identity/voice. */
  alignmentScore: number;
  /** 0–1 fit with this specific user's evolved profile. */
  userAlignmentScore: number;
  issues: OverseerIssue[];
  /** 0–1 proportion of models that agreed. */
  consensusStrength: number;
  /** Model names whose content diverged from consensus. */
  dissents: string[];
  requiresEnhancement: boolean;
  enhancementType: EnhancementType;
}

export type OverseerIssueType =
  | 'shallow'
  | 'generic'
  | 'wrong_tone'
  | 'wrong_depth'
  | 'inconsistent'
  | 'over_hedged'
  | 'wrong_format'
  | 'banned_pattern'
  | 'missing_nuance';

export interface OverseerIssue {
  type: OverseerIssueType;
  severity: 'minor' | 'moderate' | 'critical';
  description: string;
  /** Short excerpt where the issue was detected. */
  location?: string;
}

export interface OverseerOutput {
  /** The response the user actually sees. */
  finalResponse: string;
  evaluation: OverseerEvaluation;
  enhancementApplied: EnhancementType;
  /** The system prompt used for the overseer LLM call — for debugging. */
  overseerPromptUsed: string;
  processingMs: number;
  /** True if the evolution profile changed the response during user-voice pass. */
  userVoiceApplied: boolean;
  overseerVersion: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal constants
// ─────────────────────────────────────────────────────────────────────────────

const OVERSEER_VERSION = '1.0.0';

/** Patterns that must never appear in an Atlas response. */
const ATLAS_BANNED_FILLERS: readonly string[] = [
  'Certainly!',
  'Great question!',
  'As an AI',
  "I'd be happy to",
  'I hope this helps',
  'Of course!',
  'Absolutely!',
  'Sure thing',
  'No problem!',
  'I apologize for',
  "I'm just an AI",
  'I cannot provide',
  'I am not able to',
  'Please note that',
  'It is important to note',
  'It is worth noting',
  'Having said that,',
  'That being said,',
  'With that in mind,',
  'In conclusion,',
  'To summarize,',
  'Feel free to ask',
];

/** Regex patterns for empty hedges with no substantive follow-through. */
const EMPTY_HEDGE_PATTERNS: readonly RegExp[] = [
  /\bit depends\b(?! on )/gi,
  /\bthere are many factors\b/gi,
  /\bvarious perspectives\b/gi,
  /\bmany people believe\b/gi,
  /\bsome would argue\b(?! that [a-z])/gi,
  /\bthis is a complex (topic|issue|question)\b/gi,
  /\bit'?s not (?:that |so )?simple\b(?!\s*[—:-])/gi,
];

// Default quality thresholds — can be overridden by OverseerTrainer data
const DEFAULT_MIN_DEPTH = 0.4;
const DEFAULT_MIN_QUALITY = 0.5;
const DEFAULT_MIN_ALIGNMENT = 0.5;
const DEFAULT_FULL_REWRITE_BELOW = 0.3;

// ─────────────────────────────────────────────────────────────────────────────
// AtlasOverseer
// ─────────────────────────────────────────────────────────────────────────────

export class AtlasOverseer {
  constructor(
    /** Groq API key — Overseer uses Groq/Llama by default (fast). */
    private readonly groqApiKey: string,
    private readonly overseerModel: string = 'llama-3.3-70b-versatile',
  ) {}

  // ─── Main entry point ─────────────────────────────────────────────────────

  /**
   * Called after multi-model synthesis, before response delivery.
   * This is the only public method that external callers need.
   */
  async evaluate(input: OverseerInput): Promise<OverseerOutput> {
    const startMs = Date.now();

    // Stage 1 — score the raw synthesis
    const evaluation = this.evaluateSynthesis(input);

    // Stage 2 — build the overseer system prompt
    const systemPrompt = this.buildOverseerSystemPrompt(
      evaluation,
      input.adaptationState,
    );

    // Stage 3 — build the enhancement/translation instruction
    const userPrompt =
      evaluation.enhancementType === 'none'
        ? this.buildLightPolishInstruction(input)
        : this.buildEnhancementInstruction(input, evaluation);

    // Stage 4 — run the Groq LLM
    const rawEnhanced = await this.runOverseerModel(systemPrompt, userPrompt);

    // Stage 5 — apply user voice (no LLM — pure string transforms)
    const { result: finalResponse, changed: userVoiceApplied } =
      this.applyUserVoice(rawEnhanced, input.adaptationState, evaluation);

    return {
      finalResponse,
      evaluation,
      enhancementApplied: evaluation.enhancementType,
      overseerPromptUsed: systemPrompt,
      processingMs: Date.now() - startMs,
      userVoiceApplied,
      overseerVersion: OVERSEER_VERSION,
    };
  }

  // ─── Stage 1: evaluateSynthesis ───────────────────────────────────────────

  private evaluateSynthesis(input: OverseerInput): OverseerEvaluation {
    const { rawSynthesis, originalQuery, modelResponses, adaptationState } = input;
    const issues: OverseerIssue[] = [];

    // ── Depth ──────────────────────────────────────────────────────────────
    const depthScore = this.scoreDepth(rawSynthesis, originalQuery);

    if (depthScore < 0.25) {
      issues.push({
        type: 'shallow',
        severity: 'critical',
        description: 'Response is critically thin — too short or has fewer than two distinct claims.',
        location: rawSynthesis.slice(0, 120),
      });
    } else if (depthScore < DEFAULT_MIN_DEPTH) {
      issues.push({
        type: 'shallow',
        severity: 'moderate',
        description: 'Response addresses the query but remains at surface level.',
      });
    }

    // ── Truth / consistency ────────────────────────────────────────────────
    const { score: truthScore, dissents } = this.scoreConsistency(modelResponses);

    if (truthScore < 0.45) {
      issues.push({
        type: 'inconsistent',
        severity: 'critical',
        description: `Strong model disagreement detected. Dissenting: ${dissents.join(', ')}.`,
      });
    } else if (truthScore < 0.65) {
      issues.push({
        type: 'inconsistent',
        severity: 'moderate',
        description: `Moderate model disagreement. Dissenting: ${dissents.join(', ')}.`,
      });
    }

    // ── Banned filler patterns ─────────────────────────────────────────────
    const bannedPool: string[] = [
      ...ATLAS_BANNED_FILLERS,
      ...(adaptationState?.bannedPatterns ?? []),
    ];
    const foundBanned = this.detectBannedPatterns(rawSynthesis, bannedPool);

    for (const pattern of foundBanned) {
      const idx = rawSynthesis.indexOf(pattern);
      issues.push({
        type: 'banned_pattern',
        severity: 'moderate',
        description: `Banned filler pattern found: "${pattern}"`,
        location: rawSynthesis.slice(Math.max(0, idx - 20), idx + pattern.length + 30).trim(),
      });
    }

    // ── Empty hedging ──────────────────────────────────────────────────────
    let hedgeCount = 0;
    for (const re of EMPTY_HEDGE_PATTERNS) {
      const cloned = new RegExp(re.source, re.flags);
      if (cloned.test(rawSynthesis)) hedgeCount++;
    }

    if (hedgeCount >= 3) {
      issues.push({
        type: 'over_hedged',
        severity: 'moderate',
        description: `${hedgeCount} empty hedge patterns — dilutes directness without adding nuance.`,
      });
    } else if (hedgeCount >= 1) {
      issues.push({
        type: 'over_hedged',
        severity: 'minor',
        description: `${hedgeCount} hedge phrase(s) with no substantive follow-through.`,
      });
    }

    // ── Atlas alignment score ──────────────────────────────────────────────
    // Starts at 1.0, penalised by corporate voice patterns and absence of
    // specificity; slightly rewarded by causal / analytical language.
    let alignmentScore = 1.0;
    alignmentScore -= foundBanned.length * 0.1;
    alignmentScore -= hedgeCount * 0.07;

    const specificityHits = (rawSynthesis.match(
      /\b\d[\d.,]*[%x]?\b|\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})*\b|\b(?:specifically|namely|precisely|for instance|in particular)\b/g,
    ) ?? []).length;

    if (specificityHits < 3) {
      alignmentScore -= 0.15;
      issues.push({
        type: 'generic',
        severity: 'minor',
        description: 'Response lacks specific numbers, named references, or precise claims.',
      });
    }

    const causalHits = (rawSynthesis.match(
      /\b(?:because|therefore|as a result|consequently|which means|this implies|hence|thus|given that|since)\b/gi,
    ) ?? []).length;
    if (causalHits >= 2) alignmentScore += 0.05;

    alignmentScore = clamp(alignmentScore, 0, 1);

    // ── User alignment score ───────────────────────────────────────────────
    let userAlignmentScore = 0.7; // neutral default when no profile

    if (adaptationState) {
      const bulletCount = (rawSynthesis.match(/^[-*•]\s/gm) ?? []).length;
      const { toneModifiers } = adaptationState;

      const wantsDirectness = toneModifiers.some(
        (m) => m.kind === 'increase_directness' && m.strength > 0.5,
      );
      const wantsNarrative = toneModifiers.some(
        (m) => m.kind === 'narrative_register',
      );

      if (wantsDirectness && hedgeCount > 1) {
        userAlignmentScore -= 0.2;
        issues.push({
          type: 'wrong_tone',
          severity: 'moderate',
          description: 'User profile demands directness; response hedges excessively.',
        });
      }

      if (wantsNarrative && bulletCount > 4) {
        userAlignmentScore -= 0.15;
        issues.push({
          type: 'wrong_format',
          severity: 'minor',
          description: 'User prefers prose; response is heavily bulleted.',
        });
      }

      // Check depth preference from promptMutations
      const depthMutation = adaptationState.promptMutations.find(
        (m) => m.target === 'depth_instruction',
      );
      if (depthMutation) {
        const wantsDeep =
          /deep|exhaustive/i.test(depthMutation.instruction);
        const wantsSurface = /surface|brief|concise/i.test(depthMutation.instruction);

        if (wantsDeep && depthScore < 0.5) {
          userAlignmentScore -= 0.2;
          issues.push({
            type: 'wrong_depth',
            severity: 'moderate',
            description: 'User profile expects deep responses; this one is too shallow.',
          });
        } else if (wantsSurface && depthScore > 0.8) {
          userAlignmentScore -= 0.1;
          issues.push({
            type: 'wrong_depth',
            severity: 'minor',
            description: 'User prefers concise responses; this one may be over-expanded.',
          });
        }
      }

      userAlignmentScore = clamp(userAlignmentScore, 0, 1);
    }

    // ── Composite quality ──────────────────────────────────────────────────
    const qualityScore = clamp(
      depthScore * 0.35 +
        truthScore * 0.25 +
        alignmentScore * 0.25 +
        userAlignmentScore * 0.15,
      0,
      1,
    );

    // ── Consensus strength ─────────────────────────────────────────────────
    const successCount = modelResponses.filter((m) => m.status === 'success').length;
    const consensusStrength =
      successCount > 0
        ? clamp((successCount - dissents.length) / successCount, 0, 1)
        : 0;

    // ── Determine enhancement type ─────────────────────────────────────────
    const enhancementType = this.selectEnhancementType(
      qualityScore,
      depthScore,
      truthScore,
      alignmentScore,
      userAlignmentScore,
      dissents,
      issues,
    );

    return {
      qualityScore,
      depthScore,
      truthScore,
      alignmentScore,
      userAlignmentScore,
      issues,
      consensusStrength,
      dissents,
      requiresEnhancement: enhancementType !== 'none',
      enhancementType,
    };
  }

  // ─── Stage 2: buildOverseerSystemPrompt ───────────────────────────────────

  private buildOverseerSystemPrompt(
    evaluation: OverseerEvaluation,
    adaptationState: AtlasAdaptationState | null,
  ): string {
    // User profile section
    const userProfile = adaptationState?.customInstructions
      ? `\n\n──── USER PROFILE ────\n${adaptationState.customInstructions}\n──────────────────────`
      : `\n\n──── USER PROFILE ────\nNo evolved profile yet. Default to a highly intelligent, curious adult. Never condescend. Never over-explain fundamentals unless they are genuinely contested.\n──────────────────────`;

    // Issue summary
    const issueLines = evaluation.issues.map(
      (i) => `  • [${i.severity.toUpperCase()}] ${i.type}: ${i.description}`,
    );
    const issueBlock =
      issueLines.length > 0
        ? `\n\nKnown issues in the draft (fix all of these):\n${issueLines.join('\n')}`
        : '';

    // Score context
    const scoreBlock =
      `\n\nDraft scores: ` +
      `depth=${evaluation.depthScore.toFixed(2)}, ` +
      `truth=${evaluation.truthScore.toFixed(2)}, ` +
      `atlas_alignment=${evaluation.alignmentScore.toFixed(2)}, ` +
      `user_alignment=${evaluation.userAlignmentScore.toFixed(2)}, ` +
      `consensus=${evaluation.consensusStrength.toFixed(2)}`;

    return (
      `You are the Atlas Overseer — the final intelligence layer before a response reaches the user.\n` +
      `You are not a safety filter. You are a quality enforcer, truth arbiter, and voice translator.\n` +
      `\n` +
      `Your mandate:\n` +
      `1. QUALITY: If the response is shallow, make it deeper. If generic, make it specific. Depth means\n` +
      `   multiple distinct claims, concrete references, causal reasoning — not padded length.\n` +
      `2. TRUTH: If models disagreed, arbitrate on evidence and logical coherence, not popularity.\n` +
      `   Commit to the most defensible position. Briefly note dissent; do not hide it with vague hedging.\n` +
      `3. VOICE: Every response must sound like Atlas — precise, direct, intellectually serious, never\n` +
      `   corporate. Atlas leads with the insight. Atlas does not soften hard truths with filler.\n` +
      `   Atlas treats the user as a peer-level intellect.\n` +
      `4. USER LENS: Calibrate depth, vocabulary, format, and register to this specific user's profile.\n` +
      `   The same information delivered at the wrong register is a failure.\n` +
      `\n` +
      `You never use these patterns under any circumstances:\n` +
      `"Certainly!", "Great question!", "As an AI", "I'd be happy to", "I hope this helps",\n` +
      `"It is important to note", "Having said that,", "That being said,", "In conclusion,",\n` +
      `"To summarize,", "Feel free to ask", "It is worth noting".\n` +
      `\n` +
      `You are the last defender of response quality. If you would not be satisfied reading this\n` +
      `response yourself, rewrite it.` +
      userProfile +
      issueBlock +
      scoreBlock
    );
  }

  // ─── Stage 3: buildEnhancementInstruction ────────────────────────────────

  private buildEnhancementInstruction(
    input: OverseerInput,
    evaluation: OverseerEvaluation,
  ): string {
    const { rawSynthesis, originalQuery, modelResponses, adaptationState } = input;
    const { enhancementType, dissents, issues } = evaluation;

    switch (enhancementType) {
      case 'depth_expansion': {
        const depthTier = this.resolveDepthTierFromProfile(adaptationState);
        const weaknesses = issues
          .filter((i) => i.type === 'shallow' || i.type === 'generic' || i.type === 'missing_nuance')
          .map((i) => i.description)
          .join('; ') || 'response lacks multiple distinct claims and specific evidence';

        return (
          `TASK: DEPTH EXPANSION\n\n` +
          `The draft addresses the question but stays at surface level. Expand it.\n` +
          `Specific weaknesses to correct: ${weaknesses}\n` +
          `Expected depth tier: "${depthTier}" — do not add length without adding substance.\n` +
          `Do not repeat the question. Do not add a preamble. Begin with the substantive answer.\n\n` +
          `ORIGINAL QUERY:\n${originalQuery}\n\n` +
          `DRAFT TO EXPAND:\n${rawSynthesis}\n\n` +
          `Produce the expanded response now. No meta-commentary.`
        );
      }

      case 'voice_translation': {
        const archetype = adaptationState?.archetype ?? 'unknown';
        const vocabLevel = this.resolveVocabLevel(adaptationState);
        const toneNotes = adaptationState?.toneModifiers
          .slice(0, 3)
          .map((m) => m.kind.replace(/_/g, ' '))
          .join(', ') || 'direct, precise, intellectually serious';

        return (
          `TASK: VOICE TRANSLATION\n\n` +
          `The factual content is correct but the voice is wrong for this user.\n` +
          `User archetype: ${archetype}. Vocabulary level: ${vocabLevel}. Tone direction: ${toneNotes}.\n` +
          `Rewrite in Atlas's voice calibrated specifically for this user.\n` +
          `Do not change the factual content — only delivery, register, and structure.\n` +
          `Strip all filler phrases. Lead with the insight, not the setup.\n\n` +
          `ORIGINAL QUERY:\n${originalQuery}\n\n` +
          `DRAFT TO RETRANSLATE:\n${rawSynthesis}\n\n` +
          `Produce the retranslated response now. No meta-commentary.`
        );
      }

      case 'truth_arbitration': {
        const dissentDetails = modelResponses
          .filter((m) => dissents.includes(m.model) && m.status === 'success')
          .slice(0, 5)
          .map((m) => `[${m.model}]:\n${m.content.slice(0, 400).trim()}`)
          .join('\n\n---\n\n');

        return (
          `TASK: TRUTH ARBITRATION\n\n` +
          `These models gave answers that conflict with the synthesis or with each other:\n` +
          `${dissents.join(', ')}\n\n` +
          `Arbitrate. Choose the most logically defensible position and state it directly.\n` +
          `One sentence acknowledging the disagreement is acceptable; do not turn it into an academic debate.\n` +
          `The user can handle complexity. Do not paper over the conflict with vague hedging.\n\n` +
          `ORIGINAL QUERY:\n${originalQuery}\n\n` +
          `SYNTHESIS (majority position):\n${rawSynthesis}\n\n` +
          `DISSENTING POSITIONS:\n${dissentDetails}\n\n` +
          `Produce the arbitrated response now. No meta-commentary.`
        );
      }

      case 'structural_reform': {
        const wantsProse = adaptationState?.toneModifiers.some(
          (m) => m.kind === 'narrative_register',
        ) ?? false;
        const structureNote = wantsProse
          ? 'This user strongly prefers flowing prose. Convert bullet lists to integrated prose paragraphs.'
          : 'Restructure for clarity. Use headers only where sections are genuinely distinct. Eliminate redundancy.';

        return (
          `TASK: STRUCTURAL REFORM\n\n` +
          `The factual content is correct but is poorly structured for this user.\n` +
          `${structureNote}\n` +
          `Do not change the factual content — only organisation and format.\n\n` +
          `ORIGINAL QUERY:\n${originalQuery}\n\n` +
          `DRAFT TO RESTRUCTURE:\n${rawSynthesis}\n\n` +
          `Produce the restructured response now. No meta-commentary.`
        );
      }

      case 'full_rewrite': {
        const sourceResponses = modelResponses
          .filter((m) => m.status === 'success')
          .slice(0, 8)
          .map((m) => `[${m.model} / ${m.provider}]:\n${m.content.slice(0, 600).trim()}`)
          .join('\n\n---\n\n');

        return (
          `TASK: FULL REWRITE\n\n` +
          `The synthesis is inadequate. Use the source material from the contributing models\n` +
          `to write a new response from scratch. The synthesis is provided for reference only —\n` +
          `do not follow its structure or voice.\n\n` +
          `Write in Atlas's voice: direct, specific, intellectually serious, never corporate.\n\n` +
          `ORIGINAL QUERY:\n${originalQuery}\n\n` +
          `INADEQUATE SYNTHESIS (reference only — do not follow):\n${rawSynthesis}\n\n` +
          `SOURCE MATERIAL FROM CONTRIBUTING MODELS:\n${sourceResponses}\n\n` +
          `Produce the full rewrite now. No meta-commentary.`
        );
      }

      default:
        // Fallback safety net — should never be reached
        return this.buildLightPolishInstruction(input);
    }
  }

  private buildLightPolishInstruction(input: OverseerInput): string {
    return (
      `TASK: VOICE POLISH\n\n` +
      `The following response is substantively good. Apply minimal editing only:\n` +
      `  1. Remove any filler phrases or hollow affirmations.\n` +
      `  2. Sharpen the opening sentence — lead with the insight, not the setup.\n` +
      `  3. Ensure the response doesn't trail off or beg for follow-up questions.\n` +
      `Do not restructure, add content, or alter any factual claims.\n\n` +
      `ORIGINAL QUERY:\n${input.originalQuery}\n\n` +
      `DRAFT:\n${input.rawSynthesis}\n\n` +
      `Produce the polished response now.`
    );
  }

  // ─── Stage 4: runOverseerModel ────────────────────────────────────────────

  private async runOverseerModel(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<string> {
    const endpoint = 'https://api.groq.com/openai/v1/chat/completions';

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.groqApiKey}`,
      },
      body: JSON.stringify({
        model: this.overseerModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.4,
        max_tokens: 4096,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => 'unknown error');
      throw new Error(`[AtlasOverseer] Groq API error ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('[AtlasOverseer] Groq returned an empty response body');
    }

    return content.trim();
  }

  // ─── Stage 5: applyUserVoice ──────────────────────────────────────────────

  /**
   * Post-processing pass — no LLM call. Applies user profile preferences via
   * pure string transforms. Returns the modified text and a flag indicating
   * whether any change was made.
   */
  private applyUserVoice(
    response: string,
    adaptationState: AtlasAdaptationState | null,
    evaluation: OverseerEvaluation,
  ): { result: string; changed: boolean } {
    let current = response;
    let changed = false;

    // Always strip any remaining banned fillers (LLM may have re-introduced them)
    const bannedPool: string[] = [
      ...ATLAS_BANNED_FILLERS,
      ...(adaptationState?.bannedPatterns ?? []),
    ];

    for (const pattern of bannedPool) {
      if (current.includes(pattern)) {
        // Attempt a clean removal: strip the phrase and normalise whitespace
        current = current
          .split(pattern)
          .join('')
          .replace(/\s{2,}/g, ' ')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        changed = true;
      }
    }

    if (!adaptationState) {
      return { result: current, changed };
    }

    // ── Ideal response length check ────────────────────────────────────────
    const wordCount = current.split(/\s+/).filter(Boolean).length;
    const formatMutation = adaptationState.promptMutations.find(
      (m) => m.target === 'format_instruction',
    );
    const prefersBrief =
      formatMutation !== undefined && /\bbrief\b|\bconcise\b/i.test(formatMutation.instruction);

    if (prefersBrief && wordCount > 400) {
      // Cannot safely truncate without a further LLM call — flag it so the
      // caller can decide whether to run a length-reduction pass
      evaluation.issues.push({
        type: 'wrong_depth',
        severity: 'minor',
        description:
          `Response is ${wordCount} words; user profile prefers brief responses (≤400 words). ` +
          `Consider a dedicated length-reduction pass.`,
      });
      changed = true;
    }

    // ── Prose preference: convert first heavy bullet block ─────────────────
    const wantsProse = adaptationState.toneModifiers.some(
      (m) => m.kind === 'narrative_register',
    );

    if (wantsProse) {
      // Match a bullet block of 3 or more consecutive bullet lines
      const bulletBlockRe = /^([ \t]*[-*•]\s.+\n?){3,}/m;
      const match = bulletBlockRe.exec(current);
      if (match) {
        const block = match[0];
        const items = block
          .split('\n')
          .filter((line) => /^[ \t]*[-*•]\s/.test(line))
          .map((line) => line.replace(/^[ \t]*[-*•]\s+/, '').trim())
          .filter(Boolean);

        if (items.length >= 3) {
          const prose = items.join('; ') + '.';
          current = current.replace(block, prose + '\n');
          changed = true;
        }
      }
    }

    return { result: current.trim(), changed };
  }

  // ─── Utilities ────────────────────────────────────────────────────────────

  /** Returns the subset of `banned` that appear literally in `text`. */
  private detectBannedPatterns(text: string, banned: readonly string[]): string[] {
    return banned.filter((p) => text.includes(p));
  }

  /**
   * Scores response depth on a 0–1 scale.
   *
   * Penalties:
   *   - Under 60 words:  −0.50
   *   - Under 150 words: −0.35
   *   - Under 300 words: −0.10
   *   - Fewer than 2 distinct sentences (>20 chars): −0.20
   *   - Fewer than 2 specificity markers: −0.15
   *   - Query coverage < 30%: −0.20
   *
   * Rewards:
   *   - 2+ causal/evidential phrases: +0.05
   */
  private scoreDepth(text: string, query: string): number {
    let score = 1.0;

    const wordCount = text.split(/\s+/).filter(Boolean).length;
    if (wordCount < 60) score -= 0.5;
    else if (wordCount < 150) score -= 0.35;
    else if (wordCount < 300) score -= 0.1;

    const sentences = text
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 20);
    if (sentences.length < 2) score -= 0.2;
    else if (sentences.length < 4) score -= 0.05;

    // Specificity: numbers, proper names, precise qualifier words
    const specMatches = (text.match(
      /\b\d[\d.,]*[%x]?\b|\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})*\b|\b(?:specifically|namely|precisely|in particular)\b/g,
    ) ?? []).length;
    if (specMatches < 2) score -= 0.15;

    // Causal reasoning
    const causalCount = (text.match(
      /\b(?:because|therefore|as a result|consequently|which means|this implies|hence|thus|given that|since)\b/gi,
    ) ?? []).length;
    if (causalCount >= 2) score += 0.05;

    // Query coverage
    const queryTerms = query
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 4);
    if (queryTerms.length > 0) {
      const textLC = text.toLowerCase();
      const covered = queryTerms.filter((w) => textLC.includes(w)).length;
      if (covered / queryTerms.length < 0.3) score -= 0.2;
    }

    return clamp(score, 0, 1);
  }

  /**
   * Scores internal consistency across model responses by building a
   * consensus vocabulary (words in >50% of responses) and measuring how
   * well each response covers it. Returns a 0–1 score and a list of
   * model names whose coverage was below 40%.
   */
  private scoreConsistency(
    responses: ModelResponse[],
  ): { score: number; dissents: string[] } {
    const successful = responses.filter((m) => m.status === 'success');

    if (successful.length === 0) return { score: 0.5, dissents: [] };
    if (successful.length === 1) return { score: 1.0, dissents: [] };

    // Build per-model word sets (words > 5 chars, lowercased)
    const fingerprints = successful.map((m) => ({
      model: m.model,
      words: new Set(
        m.content
          .toLowerCase()
          .split(/\W+/)
          .filter((w) => w.length > 5),
      ),
    }));

    // Consensus vocabulary: words appearing in ≥50% of responses
    const freq = new Map<string, number>();
    for (const { words } of fingerprints) {
      for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
    }
    const quorum = Math.ceil(successful.length * 0.5);
    const consensus = new Set(
      [...freq.entries()].filter(([, c]) => c >= quorum).map(([w]) => w),
    );

    if (consensus.size === 0) {
      // No shared vocabulary — near-total disagreement
      return {
        score: 0.2,
        dissents: successful.slice(1).map((m) => m.model),
      };
    }

    const coverages = fingerprints.map(({ model, words }) => {
      const covered = [...consensus].filter((w) => words.has(w)).length;
      return { model, coverage: covered / consensus.size };
    });

    const dissents = coverages
      .filter(({ coverage }) => coverage < 0.4)
      .map(({ model }) => model);

    const avgCoverage =
      coverages.reduce((s, { coverage }) => s + coverage, 0) / coverages.length;

    const dissentRatio = dissents.length / successful.length;
    const score = clamp(avgCoverage * (1 - dissentRatio * 0.3), 0, 1);

    return { score, dissents };
  }

  // ─── Enhancement type selection ───────────────────────────────────────────

  private selectEnhancementType(
    qualityScore: number,
    depthScore: number,
    truthScore: number,
    alignmentScore: number,
    userAlignmentScore: number,
    dissents: string[],
    issues: OverseerIssue[],
  ): EnhancementType {
    if (qualityScore < DEFAULT_FULL_REWRITE_BELOW) return 'full_rewrite';

    if (truthScore < 0.5 && dissents.length > 0) return 'truth_arbitration';

    if (depthScore < DEFAULT_MIN_DEPTH) return 'depth_expansion';

    const hasFormatIssue = issues.some(
      (i) => i.type === 'wrong_format' && i.severity !== 'minor',
    );
    if (hasFormatIssue && userAlignmentScore < 0.5) return 'structural_reform';

    if (alignmentScore < DEFAULT_MIN_ALIGNMENT || userAlignmentScore < 0.5) {
      return 'voice_translation';
    }

    // Secondary depth check — moderate shallowness still warrants expansion
    if (depthScore < 0.55 && issues.some((i) => i.type === 'shallow')) {
      return 'depth_expansion';
    }

    return 'none';
  }

  // ─── Profile resolution helpers ───────────────────────────────────────────

  private resolveDepthTierFromProfile(
    adaptationState: AtlasAdaptationState | null,
  ): string {
    if (!adaptationState) return 'moderate';
    const m = adaptationState.promptMutations.find(
      (pm) => pm.target === 'depth_instruction',
    );
    if (!m) return 'moderate';
    if (/exhaustive/i.test(m.instruction)) return 'exhaustive';
    if (/\bdeep\b/i.test(m.instruction)) return 'deep';
    if (/surface|brief/i.test(m.instruction)) return 'surface';
    return 'moderate';
  }

  private resolveVocabLevel(
    adaptationState: AtlasAdaptationState | null,
  ): string {
    if (!adaptationState) return 'advanced';
    const m = adaptationState.promptMutations.find(
      (pm) => pm.target === 'tone_instruction',
    );
    if (!m) return 'advanced';
    if (/technical|expert/i.test(m.instruction)) return 'technical / expert';
    if (/accessible|simple/i.test(m.instruction)) return 'accessible';
    return 'advanced';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
