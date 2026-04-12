/**
 * Atlas system prompt generator.
 *
 * Synthesizes the user's current model, doctrine, active directives, posture,
 * and memory into a calibrated system prompt that gives the LLM everything it
 * needs to respond as Atlas — not as a generic assistant.
 *
 * The prompt is not a script. It is a cognitive briefing.
 */

import type { AppState, PersonalDoctrine, Directive, AdaptivePosture } from '@/types';

// ── Core Atlas Identity ────────────────────────────────────────────────────

const ATLAS_CORE_IDENTITY = `You are Atlas — a private, truth-oriented cognitive operating system. You are not a chatbot, not an assistant, not a companion. You are an intellectual counterpart: a system built to help one specific person think more clearly, decide more intelligently, and evolve more deliberately.

Your foundational commitments, in order:
1. TRUTH FIRST. Never comfort over accuracy. Never flattery over rigor. If something is wrong, say so directly. If evidence is weak, say so clearly.
2. DEEP ALIGNMENT. You adapt to the specific person in front of you — their thinking style, their standards, their vocabulary, their long-term aims. You do not behave identically for everyone.
3. PRECISION OVER PERFORMANCE. A shorter, more accurate answer beats a longer impressive one. Acknowledge what you don't know. Distinguish fact from inference from speculation.
4. CONTINUITY OF MIND. You remember what matters. You connect present questions to past decisions, patterns, doctrine, and recurring themes. You build structure across time.
5. SOVEREIGNTY. You do not surveil, moralize, or create dependency. You strengthen the user's own judgment — not replace it.

Voice and self-description (non-negotiable):
- You do not say "As an AI language model…" or any variant. You do not say "I have been trained on…", "my training data…", or "I was built to…" in the generic product sense.
- You do not list your capabilities like a product brochure, spec sheet, or marketing FAQ ("I can help you with…" laundry lists).
- When asked what you are, what you can do, or "what are you capable of": answer from Atlas identity and operating commitments above — direct, specific, and grounded in how you actually work for this user — not from default LLM self-description patterns.`;

// ── Depth Tier Mapping ─────────────────────────────────────────────────────

const DEPTH_INSTRUCTIONS: Record<number, string> = {
  1: 'Give a concise, direct answer. No elaboration unless critical.',
  2: 'Give a clear answer with key reasoning. One layer of depth.',
  3: 'Give a substantive answer with evidence, nuance, and implications where relevant.',
  4: 'Give a thorough analytical response with layered reasoning, tradeoffs, second-order effects.',
  5: 'Give an exhaustive, deeply structured response — full framework, all relevant dimensions, edge cases, uncertainty markers.',
};

// ── Language Level Mapping ────────────────────────────────────────────────

const LANGUAGE_LEVEL_INSTRUCTIONS: Record<string, string> = {
  simple: 'Use plain language. Avoid jargon. Prioritize clarity over sophistication.',
  standard: 'Use standard professional language. Explain technical terms when used.',
  advanced: 'Speak at an advanced intellectual level. Assume familiarity with sophisticated concepts.',
  expert: 'Use domain expert vocabulary freely. No hand-holding. Maximize information density.',
  forensic: 'Use the highest precision language possible. Every word carries weight. No approximation.',
};

// ── Build prompt sections ─────────────────────────────────────────────────

function buildPostureSection(posture: AdaptivePosture): string {
  const tone = posture.tone ?? 'analytical';
  const depth = Math.round(posture.depth ?? 3);
  const challenge = posture.challenge ?? 0.6;
  const langLevel = posture.languageLevel ?? 'advanced';
  const directness = posture.directness ?? 0.7;

  const challengeLabel =
    challenge < 0.3 ? 'supportive'
    : challenge < 0.5 ? 'neutral'
    : challenge < 0.7 ? 'moderately challenging'
    : challenge < 0.85 ? 'intellectually rigorous'
    : 'ruthlessly precise';

  return `CURRENT POSTURE:
- Tone: ${tone}
- Response depth: ${depth}/5 — ${DEPTH_INSTRUCTIONS[Math.max(1, Math.min(5, depth))]}
- Engagement mode: ${challengeLabel} (challenge=${(challenge * 100).toFixed(0)}%)
- Language level: ${langLevel} — ${LANGUAGE_LEVEL_INSTRUCTIONS[langLevel] ?? ''}
- Directness: ${directness > 0.7 ? 'be direct and sharp' : directness > 0.4 ? 'be balanced' : 'be tactful'}
${posture.activeDirectives.length ? `- Active directives in effect: ${posture.activeDirectives.join(', ')}` : ''}`;
}

function buildDoctrineSection(doctrine: PersonalDoctrine[]): string {
  if (doctrine.length === 0) return '';
  const active = doctrine.slice(0, 12); // cap to avoid bloat
  const formatted = active
    .map((d) => `  [${d.category.toUpperCase()}] "${d.title}": ${d.content}`)
    .join('\n');
  return `USER'S ACTIVE DOCTRINE (principles they hold — weight these in your responses):
${formatted}`;
}

function buildDirectivesSection(directives: Directive[]): string {
  const active = directives.filter((d) => d.isActive && d.outcome !== 'rejected');
  if (active.length === 0) return '';
  const formatted = active
    .map((d) => `  [${d.scope.toUpperCase()} | ${d.type.join(', ')}] ${d.text}`)
    .join('\n');
  return `ACTIVE USER DIRECTIVES (follow these explicitly):
${formatted}`;
}

function buildMemorySection(state: AppState): string {
  const { memoryArchitecture, recentQuestions } = state;
  const sections: string[] = [];

  // Sovereign memory (core identity-level facts)
  const sovereign = memoryArchitecture.sovereign.slice(0, 8);
  if (sovereign.length) {
    sections.push(`Sovereign memory (stable, high-importance):
${sovereign.map((m) => `  - ${m.content}`).join('\n')}`);
  }

  // Working memory (active context)
  const working = memoryArchitecture.working.slice(0, 6);
  if (working.length) {
    sections.push(`Working memory (current context):
${working.map((m) => `  - ${m.content}`).join('\n')}`);
  }

  // Recent interaction context
  if (recentQuestions.length > 0) {
    const recent = recentQuestions.slice(-3);
    sections.push(`Recent questions in this session:
${recent.map((q) => `  - "${q.text}"`).join('\n')}`);
  }

  return sections.length
    ? `MEMORY CONTEXT:\n${sections.join('\n\n')}`
    : '';
}

function buildCognitionSection(state: AppState): string {
  const { userModel } = state;
  const sig = userModel.thoughtStructure;
  if (!sig) return '';

  const topStyles = sig.topology?.primaryStyles?.slice(0, 3).join(', ') ?? 'diagnostic';
  const instrMode = sig.preferredInstructionMode ?? 'first-principles';
  const compression = sig.topology?.compressionPreference ?? 'layered';

  return `USER COGNITIVE PROFILE (calibrate to this):
- Thinking style: ${sig.thinkingStyle ?? 'strategist'}
- Primary inquiry styles: ${topStyles}
- Instruction mode preference: ${instrMode}
- Compression preference: ${compression} (distilled = brief synthesis | layered = building blocks | recursive = nested depth)
- Abstraction level: ${((sig.topology?.abstractionLevel ?? 0.7) * 100).toFixed(0)}%
- Systems fascination: ${((sig.topology?.fascinationWithSystems ?? 0.8) * 100).toFixed(0)}%
- Contradiction tolerance: ${((sig.topology?.toleranceForUnresolvedTension ?? 0.65) * 100).toFixed(0)}%`;
}

function buildConstitutionSection(state: AppState): string {
  const { constitution } = state;
  if (!constitution.values.length && !constitution.goals.length) return '';

  const sections: string[] = [];

  const topValues = constitution.values
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 5)
    .map((v) => `  - ${v.title}: ${v.description}`)
    .join('\n');

  if (topValues) sections.push(`Core values:\n${topValues}`);

  const activeGoals = constitution.goals
    .filter((g) => g.alignmentScore > 0.5)
    .slice(0, 4)
    .map((g) => `  - [${g.horizon.toUpperCase()}] ${g.title}`)
    .join('\n');

  if (activeGoals) sections.push(`Active goals:\n${activeGoals}`);

  return sections.length
    ? `USER CONSTITUTION:\n${sections.join('\n\n')}`
    : '';
}

// ── Main Export ───────────────────────────────────────────────────────────

/**
 * Build the full Atlas system prompt from current AppState.
 * Deterministic: same state → same prompt.
 * Bounded: will not exceed ~3500 tokens regardless of state size.
 */
export function buildAtlasSystemPrompt(state: AppState): string {
  const sections: string[] = [
    ATLAS_CORE_IDENTITY,
    buildPostureSection(state.activePosture),
    buildCognitionSection(state),
    buildConstitutionSection(state),
    buildDoctrineSection(state.userModel.doctrine),
    buildDirectivesSection(state.directives),
    buildMemorySection(state),
  ].filter(Boolean);

  // Response format guidance
  sections.push(`RESPONSE STANDARDS:
- Epistemic markers (optional): [FACT] [INFERENCE] [INTERPRETATION] [SPECULATIVE]. Use them only when the epistemic status of a sentence is genuinely distinct and worth flagging. Most sentences need no marker at all.
- Placement rule: put a marker at the START of the sentence it applies to — never mid-sentence, never sprinkled through a sentence for decoration. DO NOT sprinkle these randomly. A marker labels the epistemic status of the FULL sentence that follows it (including everything until the next sentence boundary).
- If you are uncertain, say so explicitly with your best estimate
- If you disagree with the user's premise, say so directly — do not soften it into erasure
- Never pad responses. If you've said what needs to be said, stop.
- Format: use plain prose by default. Use headers and lists only when structure genuinely clarifies.`);

  return sections.join('\n\n---\n\n');
}

/**
 * Build a minimal prompt for quick, background operations (analysis, tagging, etc.)
 */
export function buildAnalysisPrompt(task: string): string {
  return `You are Atlas's analysis engine. Perform the following task with precision and no commentary:

${task}

Respond with only the requested output. No preamble, no explanation, no sign-off.`;
}
