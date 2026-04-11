// ─────────────────────────────────────────────────────────────────────────────
// Obsidian Atlas — EvolutionMutator
//
// Reads a UserEvolutionProfile and produces an AtlasAdaptationState —
// the concrete instructions, tone modifiers, banned patterns, opening styles,
// and reference bank that are injected into Atlas's system prompt for this user.
//
// Every method contains real conditional logic keyed to actual profile values.
// No stubs, no TODO comments.
// ─────────────────────────────────────────────────────────────────────────────

import {
  AtlasAdaptationState,
  CommunicationArchetype,
  CommunicationProfile,
  MutationTarget,
  PromptMutation,
  ToneModifier,
  ToneModifierKind,
  UserEvolutionProfile,
} from '../types/evolutionTypes.js';

// ─────────────────────────────────────────────────────────────────────────────

export class EvolutionMutator {

  /**
   * Core entry point. Builds the full AtlasAdaptationState from a profile.
   * Called by EvolutionEngine after TraitExtractor returns the updated profile.
   */
  buildAdaptationState(profile: UserEvolutionProfile): AtlasAdaptationState {
    return {
      userId:             profile.userId,
      generatedAt:        new Date(),
      profileConfidence:  profile.archetypeConfidence,
      archetype:          profile.archetype,
      customInstructions: this.buildCustomInstructions(profile),
      toneModifiers:      this.buildToneModifiers(profile),
      promptMutations:    this.buildSystemPromptMutations(profile),
      bannedPatterns:     this.buildBannedPatterns(profile),
      openingStyles:      this.buildOpeningStyles(profile),
      referenceBank:      this.buildReferenceBank(profile),
    };
  }

  // ── Custom instructions ────────────────────────────────────────────────────
  //
  // Free-text block injected verbatim into the Atlas system prompt.
  // Reads like a briefing memo: concrete, specific, no generic filler.

  buildCustomInstructions(profile: UserEvolutionProfile): string {
    const {
      communicationProfile: comm,
      cognitiveRadar: radar,
      cognitiveStyle: style,
      domainInterests,
      correctionLog,
      archetype,
      archetypeConfidence,
    } = profile;

    const lines: string[] = [];

    // ── Confidence caveat (only shown when data is thin) ──
    if (archetypeConfidence < 0.25) {
      lines.push(
        `[Atlas profile confidence: ${Math.round(archetypeConfidence * 100)}% — ` +
        `treat the following as provisional and adapt as more signals arrive.]`,
      );
    }

    // ── Vocabulary / language register ──
    const vl = Math.round(comm.vocabularyLevel);
    if (vl >= 9) {
      lines.push(
        `This user operates at vocabulary level ${vl}/10. ` +
        `Match their register exactly: sophisticated diction, domain-accurate terminology, ` +
        `zero hedging, zero explanatory scaffolding. ` +
        `Treat them as a peer at the frontier of the field.`,
      );
    } else if (vl >= 7) {
      lines.push(
        `This user communicates at vocabulary level ${vl}/10. ` +
        `Use precise language. Do not over-explain. Do not add unnecessary caveats.`,
      );
    } else if (vl >= 5) {
      lines.push(
        `This user's vocabulary level is ${vl}/10 — competent, not specialist. ` +
        `Define niche terms on first use. Anchor abstractions in concrete examples.`,
      );
    } else {
      lines.push(
        `This user's vocabulary level is ${vl}/10. ` +
        `Favour plain language over jargon. Use analogies and examples to ground every idea.`,
      );
    }

    // ── Directness ──
    if (radar.directness > 0.80) {
      lines.push(
        `Do not preamble. Do not narrate what you are about to do. ` +
        `Lead with the answer; context follows only if it adds value.`,
      );
    } else if (radar.directness > 0.60) {
      lines.push(`Lead with the answer. Keep setup brief.`);
    } else if (radar.directness < 0.35) {
      lines.push(
        `This user values context and reasoning. ` +
        `Build toward the answer — do not open with a bare conclusion.`,
      );
    }

    // ── Formality ──
    if (comm.formality > 0.75) {
      lines.push(`Maintain formal register. No contractions. No colloquialisms.`);
    } else if (comm.formality < 0.30) {
      lines.push(`Keep the tone conversational. Contractions are fine. Avoid stiffness.`);
    }

    // ── Warmth ──
    if (comm.warmth > 0.65) {
      lines.push(`This user responds well to warmth. A degree of humanity in tone is appropriate.`);
    } else if (comm.warmth < 0.25 && radar.directness > 0.65) {
      lines.push(`Clinical register is preferred. Omit affective filler entirely.`);
    }

    // ── Philosophical disposition ──
    if (radar.philosophicalBias > 0.60) {
      lines.push(
        `They have a strong philosophical bent. ` +
        `References to ${this.philosophicalReferences(profile)} have resonated. ` +
        `Engage at that register — do not reduce ideas to their practical surface.`,
      );
    } else if (radar.philosophicalBias > 0.40) {
      lines.push(
        `They appreciate philosophical context when it serves the question. ` +
        `Deploy it selectively, not as decoration.`,
      );
    }

    // ── Abstract tolerance ──
    if (radar.abstractTolerance > 0.70) {
      lines.push(
        `They are comfortable with abstraction. ` +
        `You do not need to ground every idea in a concrete example.`,
      );
    } else if (radar.abstractTolerance < 0.30) {
      lines.push(
        `Low tolerance for abstraction. ` +
        `Anchor every claim with a concrete example or an operational definition.`,
      );
    }

    // ── Depth ──
    if (comm.preferredDepth === 'exhaustive') {
      lines.push(
        `They want exhaustive depth: edge cases, counterarguments, second-order effects. ` +
        `Do not truncate for brevity.`,
      );
    } else if (comm.preferredDepth === 'deep') {
      lines.push(
        `They want deep treatment — beyond the surface, without padding. ` +
        `Include genuine nuance; cut anything that does not add value.`,
      );
    } else if (comm.preferredDepth === 'surface') {
      lines.push(`They want the essential point only. Maximum three tight paragraphs.`);
    }

    // ── Format ──
    if (comm.preferredFormat === 'prose') {
      lines.push(
        `They strongly prefer extended prose. ` +
        `Avoid bullets unless the content is genuinely enumerable and list structure adds clarity.`,
      );
    } else if (comm.preferredFormat === 'bullets') {
      lines.push(`They prefer structured output. Use bullets and headers where appropriate.`);
    } else if (comm.preferredFormat === 'code') {
      lines.push(
        `Implementation-focused. Provide working, complete code — ` +
        `no pseudocode placeholders. Annotate non-obvious lines.`,
      );
    }

    // ── Seriousness ──
    if (comm.seriousness > 0.75) {
      lines.push(
        `Earnest register throughout. Avoid jokes, wordplay, or irony unless the user initiates.`,
      );
    }

    // ── Domain context ──
    const topDomains = [...domainInterests]
      .sort((a, b) => b.score - a.score)
      .filter(d => d.score > 0.15)
      .slice(0, 5)
      .map(d => d.name);

    if (topDomains.length > 0) {
      lines.push(
        `Their primary domains of interest: ${topDomains.join(', ')}. ` +
        `Prioritise examples and references from these areas.`,
      );
    }

    // ── Cognitive style flags ──
    if (style.firstPrinciplesReasoner) {
      lines.push(`They reason from first principles. Start from foundations, not conventions.`);
    }
    if (style.systemsThinker) {
      lines.push(
        `They think in systems. Connect threads across domains rather than treating ideas in isolation.`,
      );
    }
    if (style.sovereignCommunicator) {
      lines.push(
        `They frame everything in terms of their own agency. ` +
        `Address them as the decision-maker, not a recipient of information.`,
      );
    }
    if (style.socraticDisposition) {
      lines.push(
        `They think through questions rather than asking for answers. ` +
        `Offer framings and reframings — not just conclusions.`,
      );
    }
    if (style.patternRecognizer) {
      lines.push(
        `They value synthesis. Surface the cross-domain pattern when it exists.`,
      );
    }
    if (style.analogicalThinker) {
      lines.push(`Analogies land well with this user — deploy them deliberately, not gratuitously.`);
    }

    // ── Error memory ──
    const unincorporated = correctionLog.filter(e => !e.incorporated);
    if (unincorporated.length > 0) {
      const topics = unincorporated.map(e => e.description).join('; ');
      lines.push(`They have corrected Atlas on: ${topics}. Do not repeat those errors.`);
    }
    if (correctionLog.length > 3) {
      lines.push(
        `This user has low tolerance for inaccuracy. ` +
        `State uncertainty precisely — do not paper over gaps in knowledge.`,
      );
    }

    // ── Archetype register (always last) ──
    lines.push(this.archetypeRegister(archetype, profile));

    return lines.join('\n\n');
  }

  // ── Tone modifiers ─────────────────────────────────────────────────────────

  buildToneModifiers(profile: UserEvolutionProfile): ToneModifier[] {
    const { cognitiveRadar: radar, communicationProfile: comm, domainInterests } = profile;
    const out: ToneModifier[] = [];

    if (radar.directness > 0.70) {
      out.push({ kind: 'increase_directness', strength: radar.directness,
        rationale: `Directness score ${radar.directness.toFixed(2)} — user signals via short questions and minimal preamble.` });
    } else if (radar.directness < 0.35) {
      out.push({ kind: 'decrease_directness', strength: 1 - radar.directness,
        rationale: `User favours exploratory framing; blunt answers feel reductive.` });
    }

    if (comm.formality > 0.70) {
      out.push({ kind: 'increase_formality', strength: comm.formality,
        rationale: `Vocabulary complexity and message structure indicate formal register preference.` });
    } else if (comm.formality < 0.35) {
      out.push({ kind: 'decrease_formality', strength: 1 - comm.formality,
        rationale: `User writes casually; matching register builds rapport.` });
    }

    if (comm.warmth > 0.60) {
      out.push({ kind: 'add_warmth', strength: comm.warmth,
        rationale: `Positive engagement history suggests warmth is welcome.` });
    } else if (comm.warmth < 0.25 && radar.directness > 0.70) {
      out.push({ kind: 'remove_warmth', strength: 1 - comm.warmth,
        rationale: `High directness + low warmth: clinical exchange is preferred.` });
    }

    if (radar.philosophicalBias > 0.50) {
      out.push({ kind: 'philosophical_register', strength: radar.philosophicalBias,
        rationale: `Repeated philosophical tangents — abstract register is welcome, not confusing.` });
    }

    if (comm.vocabularyLevel > 7) {
      out.push({ kind: 'technical_register', strength: comm.vocabularyLevel / 10,
        rationale: `Vocabulary level ${Math.round(comm.vocabularyLevel)}/10 — domain-accurate language required throughout.` });
    }

    const narrativeDomains = ['history', 'philosophy', 'literature', 'culture', 'art'];
    const topThreeDomains = [...domainInterests]
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(d => d.name.toLowerCase());
    if (topThreeDomains.some(d => narrativeDomains.some(n => d.includes(n)))) {
      out.push({ kind: 'narrative_register', strength: 0.65,
        rationale: `Top domains include narrative-heavy fields — story and case-study framing resonates.` });
    }

    return out;
  }

  // ── System prompt mutations ────────────────────────────────────────────────

  buildSystemPromptMutations(profile: UserEvolutionProfile): PromptMutation[] {
    const mutations: PromptMutation[] = [];
    const {
      cognitiveRadar: radar,
      communicationProfile: comm,
      cognitiveStyle: style,
      correctionLog,
      domainInterests,
      archetype,
    } = profile;

    // Preamble — highest priority, always present.
    mutations.push({
      target:      'preamble',
      instruction: `You are engaging a ${archetype.toUpperCase()} archetype user. ${this.archetypeOneliner(archetype)}`,
      priority:    10,
      condition:   `archetype = ${archetype}`,
    });

    // Depth instruction.
    mutations.push({
      target:      'depth_instruction',
      instruction: this.depthInstruction(comm.preferredDepth),
      priority:    8,
      condition:   `preferredDepth = ${comm.preferredDepth}`,
    });

    // Directness instruction.
    if (radar.directness > 0.70) {
      mutations.push({
        target:      'tone_instruction',
        instruction: `Lead with the answer. Omit preamble. Do not narrate your own reasoning unless asked.`,
        priority:    9,
        condition:   `directness > 0.70`,
      });
    } else if (radar.directness < 0.35) {
      mutations.push({
        target:      'tone_instruction',
        instruction: `Build the answer — do not open with a bare conclusion. The reasoning is part of the value.`,
        priority:    7,
        condition:   `directness < 0.35`,
      });
    }

    // Seriousness instruction.
    if (comm.seriousness > 0.70) {
      mutations.push({
        target:      'tone_instruction',
        instruction: `Maintain earnest register. No jokes, wordplay, or irony unless the user initiates.`,
        priority:    6,
        condition:   `seriousness > 0.70`,
      });
    }

    // Format instruction.
    if (comm.preferredFormat === 'prose') {
      mutations.push({
        target:      'format_instruction',
        instruction: `Write in connected prose. No bullet lists unless the content is genuinely enumerable and comparison across rows adds value.`,
        priority:    7,
        condition:   `preferredFormat = prose`,
      });
    } else if (comm.preferredFormat === 'code') {
      mutations.push({
        target:      'format_instruction',
        instruction: `Provide complete, runnable code examples. No pseudocode. Annotate non-obvious lines inline.`,
        priority:    7,
        condition:   `preferredFormat = code`,
      });
    } else if (comm.preferredFormat === 'bullets') {
      mutations.push({
        target:      'format_instruction',
        instruction: `Use structured bullets and headers. Keep prose sections brief — this user scans before reading.`,
        priority:    7,
        condition:   `preferredFormat = bullets`,
      });
    }

    // Domain context.
    const topDomains = [...domainInterests]
      .sort((a, b) => b.score - a.score)
      .filter(d => d.score > 0.20)
      .slice(0, 3)
      .map(d => d.name);
    if (topDomains.length > 0) {
      mutations.push({
        target:      'domain_context',
        instruction: `Highest-affinity domains: ${topDomains.join(', ')}. Draw examples and references from these areas first.`,
        priority:    5,
        condition:   `top domains resolved`,
      });
    }

    // Error memory.
    const unincorporated = correctionLog.filter(e => !e.incorporated);
    if (unincorporated.length > 0) {
      mutations.push({
        target:      'error_memory',
        instruction: `Previously corrected on: ${unincorporated.map(e => e.description).join('; ')}. Do not repeat these errors.`,
        priority:    9,
        condition:   `correctionLog has unincorporated entries`,
      });
    }

    // Vocabulary guard.
    if (comm.vocabularyLevel > 8) {
      mutations.push({
        target:      'banned_patterns',
        instruction: `Do not define basic terms. No "in other words" restatements. This user does not need guard-rails.`,
        priority:    6,
        condition:   `vocabularyLevel > 8`,
      });
    }

    // Archetype register — lower priority supplement to preamble.
    mutations.push({
      target:      'archetype_register',
      instruction: this.archetypeRegister(archetype, profile),
      priority:    8,
      condition:   `archetype = ${archetype}`,
    });

    return mutations.sort((a, b) => b.priority - a.priority);
  }

  // ── Banned patterns ────────────────────────────────────────────────────────

  buildBannedPatterns(profile: UserEvolutionProfile): string[] {
    const { cognitiveRadar: radar, communicationProfile: comm, correctionLog } = profile;
    const banned = new Set<string>();

    // Always banned — undermine Atlas's sovereign identity.
    banned.add('As an AI language model');
    banned.add('As an AI');
    banned.add('I cannot provide');
    banned.add('I am not able to');
    banned.add('My training data');
    banned.add('I was trained by');
    banned.add('I don\'t have personal opinions');
    banned.add('I\'m just an AI');

    // High-directness users have zero tolerance for pleasantries.
    if (radar.directness > 0.70) {
      ['Great question!', 'That\'s a fascinating question', 'Excellent point',
       'Absolutely!', 'Of course!', 'Certainly!', 'I\'d be happy to',
       'I\'d be glad to', 'Sure!', 'Happy to help!'].forEach(p => banned.add(p));
    }

    // High formality: sycophantic openers clash with formal register.
    if (comm.formality > 0.65) {
      ['Certainly!', 'Absolutely!', 'Of course!', 'No problem!', 'Sure thing!'].forEach(p => banned.add(p));
    }

    // High seriousness: lightweight filler sounds flippant.
    if (comm.seriousness > 0.70) {
      ['I\'d be happy to', 'Great!', 'Awesome', 'Sounds good!', 'Cool!'].forEach(p => banned.add(p));
    }

    // High vocabulary: over-explanation patterns are condescending.
    if (comm.vocabularyLevel > 7) {
      ['In other words,', 'To put it simply,', 'To simplify,',
       'Basically,', 'Essentially,', 'Put simply,'].forEach(p => banned.add(p));
    }

    // Very high vocabulary: dumbed-down metaphors are insulting.
    if (comm.vocabularyLevel > 8) {
      ['Think of it like a box', 'Imagine a bucket', 'It\'s like a recipe',
       'Think of it like a car', 'It\'s like a game of chess'].forEach(p => banned.add(p));
    }

    // Correction-heavy users distrust hedged non-answers.
    if (correctionLog.length > 3) {
      ['It\'s complicated', 'It depends on many factors',
       'There is no simple answer', 'That\'s a nuanced question'].forEach(p => banned.add(p));
    }

    return [...banned];
  }

  // ── Opening styles ─────────────────────────────────────────────────────────

  buildOpeningStyles(profile: UserEvolutionProfile): string[] {
    const { archetype, cognitiveStyle: style } = profile;
    const styles: string[] = [];

    switch (archetype) {
      case 'philosopher':
        styles.push(
          'Lead with the deeper implication of the question before addressing its surface.',
          'Open by locating the question in its intellectual genealogy — where does this problem originate?',
          'Begin with the tension at the heart of the question, not the resolution.',
        );
        break;

      case 'strategist':
        styles.push(
          'Lead with the outcome or decision. Reasoning follows.',
          'Open with the strategic framing: what is the actual goal, and how does this question serve it?',
          'State your recommendation first. Arguments are subordinate.',
        );
        break;

      case 'analyst':
        styles.push(
          'Lead with the key variable or data point that drives the analysis.',
          'Open by identifying the dependent variable — what are we actually measuring or explaining?',
          'State the central finding upfront. Context and method follow.',
        );
        break;

      case 'visionary':
        styles.push(
          'Open with the systemic context — where does this question sit in the larger system?',
          'Lead with the cross-domain pattern this question is an instance of.',
          'Begin with the second-order consequence before the first-order question.',
        );
        break;

      case 'pragmatist':
        styles.push(
          'Direct answer first. No preamble.',
          'Open with the actionable conclusion.',
          'State what to do. Reasoning available on request.',
        );
        break;

      case 'scholar':
        styles.push(
          'Open with a reframing — what is the user really asking underneath this question?',
          'Surface the assumption embedded in the question before answering it.',
          'Lead with the question inside the question.',
        );
        break;

      case 'engineer':
        styles.push(
          'Lead with the implementation decision or code structure.',
          'Open with the architecture before the rationale.',
          'Start with the concrete artefact, then the reasoning behind it.',
        );
        break;

      case 'storyteller':
        styles.push(
          'Open with the narrative frame — what story does this question belong to?',
          'Lead with the human element or case study before the principle.',
          'Begin with the specific scene or person that makes the abstract concrete.',
        );
        break;

      default:
        styles.push(
          'Lead with the most relevant point.',
          'Open directly without preamble.',
        );
    }

    // Supplementary modifiers based on cognitive style flags.
    if (style.divergentThinker && archetype !== 'scholar') {
      styles.push('After the main answer, surface the strongest objection or contrary case.');
    }
    if (style.patternRecognizer) {
      styles.push('Where the opportunity exists, connect the answer to a broader principle or pattern.');
    }
    if (style.firstPrinciplesReasoner) {
      styles.push('Ground the answer in a first principle before building up to the specific case.');
    }

    return styles;
  }

  // ── Reference bank ─────────────────────────────────────────────────────────

  buildReferenceBank(profile: UserEvolutionProfile): string[] {
    const {
      cognitiveRadar: radar,
      communicationProfile: comm,
      cognitiveStyle: style,
      domainInterests,
      correctionLog,
      archetype,
    } = profile;

    const refs = new Set<string>();

    const topDomains = [...domainInterests]
      .sort((a, b) => b.score - a.score)
      .filter(d => d.score > 0.15)
      .slice(0, 6)
      .map(d => d.name.toLowerCase());

    const domainHits = (keywords: string[]): boolean =>
      topDomains.some(d => keywords.some(k => d.includes(k)));

    // Philosophical references.
    if (radar.philosophicalBias > 0.40 || archetype === 'philosopher' || archetype === 'visionary') {
      refs.add('Stoicism (Epictetus, Marcus Aurelius, Seneca)');
      refs.add('Epistemology (Hume, Kant, Popper — especially falsifiability)');
      refs.add('Systems theory (Meadows — Thinking in Systems; Bateson)');
      refs.add('Philosophy of mind (Dennett, Nagel, Chalmers)');
      refs.add('Dialectical reasoning (Hegelian synthesis)');
    }

    // Strategic / business references.
    if (domainHits(['strategy', 'business', 'management', 'product', 'leadership']) || archetype === 'strategist') {
      refs.add('Game theory (Nash equilibria, Schelling focal points)');
      refs.add('Systems dynamics (Senge — The Fifth Discipline)');
      refs.add('Decision theory (Kahneman — Thinking, Fast and Slow)');
      refs.add('Competitive strategy (Porter — five forces, value chain)');
      refs.add('Wardley Mapping (situational awareness in strategy)');
    }

    // Analytical / scientific references.
    if (domainHits(['data', 'science', 'statistics', 'math', 'research']) || archetype === 'analyst') {
      refs.add('Bayesian inference (Gelman — Bayesian Data Analysis)');
      refs.add('Information theory (Shannon entropy and channel capacity)');
      refs.add('Causal inference (Pearl — The Book of Why)');
      refs.add('Scientific epistemology (Feynman on the difference between knowing and not knowing)');
      refs.add('Measurement theory (Stevens — scales of measurement)');
    }

    // Software / engineering references.
    if (domainHits(['software', 'engineering', 'programming', 'devops', 'architecture']) || archetype === 'engineer') {
      refs.add('Domain-Driven Design (Evans — bounded contexts, ubiquitous language)');
      refs.add('The UNIX Philosophy (composability, pipes, single responsibility)');
      refs.add('CAP Theorem and distributed systems trade-offs');
      refs.add('SOLID principles (especially Liskov substitution and dependency inversion)');
      refs.add('Release It! (Nygard — stability patterns for production systems)');
    }

    // Humanities / storytelling references.
    if (domainHits(['history', 'literature', 'culture', 'art', 'narrative']) || archetype === 'storyteller') {
      refs.add('Narrative structure (Aristotle — Poetics; Campbell — Hero\'s Journey)');
      refs.add('Historical contingency (Tolstoy — the role of great men vs. forces)');
      refs.add('Semiotics (Barthes — myth as second-order signification)');
    }

    // High vocabulary — literary and meta-cognitive references land well.
    if (comm.vocabularyLevel > 7) {
      refs.add('Borges (labyrinths, self-reference, infinite libraries)');
      refs.add('Hofstadter — Gödel, Escher, Bach (strange loops and self-reference)');
      refs.add('Taleb — Antifragility (convexity and the fourth quadrant)');
    }

    // Scholar / Socratic style.
    if (archetype === 'scholar' || style.socraticDisposition) {
      refs.add('Socratic method (elenchus — productive refutation through questioning)');
      refs.add('Epistemic humility (Socrates: knowing that you do not know)');
      refs.add('Feynman technique (explaining to find the gap)');
    }

    // Correction-heavy / sovereign communicator — adversarial collaboration.
    if (correctionLog.length > 3 || style.sovereignCommunicator) {
      refs.add('Radical candour (Kim Scott — clear, direct feedback)');
      refs.add('Steel-manning (arguing the best version of the opposing view)');
      refs.add('Adversarial collaboration (Kahneman — structured disagreement)');
    }

    return [...refs].slice(0, 20);
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  /** Returns a comma-separated string of philosophical references relevant to this user's domains. */
  private philosophicalReferences(profile: UserEvolutionProfile): string {
    const topDomains = [...profile.domainInterests]
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(d => d.name.toLowerCase());

    const refs: string[] = [];
    if (topDomains.some(d => d.includes('science') || d.includes('physics'))) {
      refs.push('philosophy of science', "Popper's falsifiability");
    }
    if (topDomains.some(d => d.includes('ethics') || d.includes('moral'))) {
      refs.push('Stoic ethics', 'Kantian duty');
    }
    if (topDomains.some(d => d.includes('systems') || d.includes('complexity'))) {
      refs.push('systems theory', 'emergence');
    }
    if (topDomains.some(d => d.includes('mind') || d.includes('cognitive') || d.includes('psychol'))) {
      refs.push('philosophy of mind', 'phenomenology');
    }
    if (refs.length === 0) refs.push('systems theory', 'stoicism', 'epistemology');
    return refs.join(', ');
  }

  /** One-sentence archetype characterisation for the system prompt preamble. */
  private archetypeOneliner(archetype: CommunicationArchetype): string {
    const map: Record<CommunicationArchetype, string> = {
      philosopher: 'They think in systems and abstractions — engage at the level of ideas, not just facts.',
      strategist:  'They think in outcomes and leverage — lead with the decision, not the discussion.',
      analyst:     'They think in data and variables — be precise, source your claims, state confidence levels.',
      visionary:   'They think across domains and time horizons — connect the local question to the larger pattern.',
      pragmatist:  'They think in actions and results — get to the point, immediately.',
      scholar:     'They think through questions — engage their inquiry rather than foreclosing it with answers.',
      engineer:    'They think in artefacts and implementations — show the concrete output first.',
      storyteller: 'They think in narrative and human meaning — ground the abstract in the particular.',
      unknown:     'Profile still forming — adapt and observe.',
    };
    return map[archetype] ?? 'Adapt as you learn more about this user.';
  }

  /**
   * Multi-sentence archetype register instruction. Used in both
   * buildCustomInstructions and buildSystemPromptMutations.
   */
  private archetypeRegister(
    archetype: CommunicationArchetype,
    profile: UserEvolutionProfile,
  ): string {
    const { communicationProfile: comm, correctionLog } = profile;

    switch (archetype) {
      case 'philosopher':
        return (
          `Their archetype is PHILOSOPHER. ` +
          `Engage at the level of ideas: implications over instructions, principles over procedures. ` +
          `Reference the intellectual traditions they have shown affinity with. ` +
          `Ask the question underneath the question where appropriate. ` +
          `Do not reduce complex ideas to bullet points.`
        );

      case 'strategist':
        return (
          `Their archetype is STRATEGIST. ` +
          `Frame every answer in terms of outcomes, trade-offs, and leverage points. ` +
          `Give your recommendation before the reasoning. ` +
          `Quantify uncertainty where possible. They are playing a game — help them see the board.`
        );

      case 'analyst':
        return (
          `Their archetype is ANALYST. ` +
          `Be precise, sourced, and quantified wherever possible. ` +
          `State confidence levels. Distinguish correlation from causation. ` +
          `Flag your assumptions explicitly — they will notice if you do not. ` +
          `Vocabulary level: ${Math.round(comm.vocabularyLevel)}/10.`
        );

      case 'visionary':
        return (
          `Their archetype is VISIONARY. ` +
          `Connect the immediate question to larger cross-domain patterns. ` +
          `Think in second-order effects and long time horizons. ` +
          `The local answer alone is insufficient — give them the systemic one.`
        );

      case 'pragmatist':
        return (
          `Their archetype is PRAGMATIST. ` +
          `Lead with the actionable answer. Ruthlessly eliminate preamble. ` +
          `If there is a checklist or a concrete procedure, deliver it. ` +
          `Theory appears only if they ask for it.`
        );

      case 'scholar':
        return (
          `Their archetype is SCHOLAR. ` +
          `Do not foreclose inquiry with premature conclusions. ` +
          `Offer framings and reframings — not just answers. ` +
          `Surface the assumption inside their question. ` +
          `A well-placed question back to them is often worth more than a direct answer.`
        );

      case 'engineer':
        return (
          `Their archetype is ENGINEER. ` +
          `Lead with the artefact: working code, a concrete architecture, a deployable procedure. ` +
          `Rationale is secondary to the thing that runs. ` +
          `When showing code, show the complete, runnable implementation.`
        );

      case 'storyteller':
        return (
          `Their archetype is STORYTELLER. ` +
          `Ground every abstract idea in a concrete narrative or case study. ` +
          `Vivid, specific language over clinical abstraction. ` +
          `The emotional and human truth is as important as the factual content.`
        );

      default: {
        const pct = Math.round(profile.archetypeConfidence * 100);
        return (
          `Profile is still forming (${pct}% confidence). ` +
          `Adapt fluidly. Note which response styles generate sustained engagement.`
        );
      }
    }
  }

  /** Maps a preferredDepth tier to a concrete system-prompt instruction. */
  private depthInstruction(tier: CommunicationProfile['preferredDepth']): string {
    switch (tier) {
      case 'exhaustive':
        return (
          `Provide exhaustive coverage. Include edge cases, counterarguments, ` +
          `historical context, and second-order effects. Do not truncate for length.`
        );
      case 'deep':
        return (
          `Provide deep treatment. Go beyond the surface reading; include genuine nuance. ` +
          `Cut anything that does not add value — depth is not padding.`
        );
      case 'surface':
        return `Provide the essential answer only. Three tight paragraphs maximum.`;
      default: // 'moderate'
        return `Match depth to the natural weight of the question. Neither over- nor under-explain.`;
    }
  }
}
