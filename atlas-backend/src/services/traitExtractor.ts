// ─────────────────────────────────────────────────────────────────────────────
// Obsidian Atlas — TraitExtractor
//
// Processes a batch of EvolutionSignals and returns an updated
// UserEvolutionProfile. No mutation of the input profile — always returns
// a fresh object. All continuous values are updated via exponential moving
// average (α = 0.15) so a single noisy signal cannot whipsaw the profile.
// ─────────────────────────────────────────────────────────────────────────────

import {
  CommunicationArchetype,
  CommunicationProfile,
  CognitiveRadarValues,
  CognitiveStyle,
  CorrectionLogEntry,
  DomainInterest,
  EvolutionSignal,
  UserEvolutionProfile,
} from '../types/evolutionTypes.js';

// ── EMA helpers ───────────────────────────────────────────────────────────────

/** Smoothing factor. At α=0.15 a single signal moves any value by ≤15 % of its range. */
const ALPHA = 0.15;

function ema(current: number, target: number, alpha: number = ALPHA): number {
  return alpha * target + (1 - alpha) * current;
}

function clamp(v: number, lo: number = 0, hi: number = 1): number {
  return Math.max(lo, Math.min(hi, v));
}

// ─────────────────────────────────────────────────────────────────────────────

export class TraitExtractor {

  /**
   * Main entry point. Accepts the current profile and all pending signals for
   * this user, returns a fully updated profile. Awaited by EvolutionEngine
   * after each flush interval.
   */
  async extractAndUpdate(
    profile: UserEvolutionProfile,
    signals: EvolutionSignal[],
  ): Promise<UserEvolutionProfile> {
    if (signals.length === 0) return profile;

    // Shallow-clone the top level; every sub-object is replaced below.
    const next: UserEvolutionProfile = { ...profile };

    // 1. Decay domain scores before applying new boosts.
    const decayed = this.decayDomainScores(profile.domainInterests, profile.lastUpdated);

    // 2. Update each facet.
    next.cognitiveRadar       = this.updateCognitiveRadar(profile.cognitiveRadar, signals);
    next.communicationProfile = this.updateCommunicationProfile(profile.communicationProfile, next.cognitiveRadar, signals);
    next.cognitiveStyle       = this.updateCognitiveStyle(profile.cognitiveStyle, profile.cognitiveRadar, profile.domainInterests, signals);
    next.domainInterests      = this.updateDomainInterests(decayed, signals);
    next.correctionLog        = this.updateCorrectionLog(profile.correctionLog, signals);

    // 3. Archetype + confidence depend on the updated facets — run last.
    next.archetype           = this.classifyArchetype(next, signals);
    next.archetypeConfidence = this.updateArchetypeConfidence(profile.archetypeConfidence, profile.totalSignalsProcessed + signals.length);

    // 4. Bookkeeping.
    next.totalSignalsProcessed = profile.totalSignalsProcessed + signals.length;
    next.profileVersion        = profile.profileVersion + 1;
    next.lastUpdated           = Date.now();

    return next;
  }

  // ── Cognitive radar ────────────────────────────────────────────────────────
  //
  // Six continuous dimensions on 0–1 scales, all updated via EMA.
  // The radar is the source of truth; CommunicationProfile syncs from it.

  private updateCognitiveRadar(
    prev: CognitiveRadarValues,
    signals: EvolutionSignal[],
  ): CognitiveRadarValues {
    const r = { ...prev };

    const vocabSamples          = signals.filter(s => s.type === 'vocabulary_sample');
    const philosophicalTangents = signals.filter(s => s.type === 'philosophical_tangent');
    const contrarianPushes      = signals.filter(s => s.type === 'contrarian_push');
    const depthRequests         = signals.filter(s => s.type === 'depth_request');
    const simplifyRequests      = signals.filter(s => s.type === 'simplify_request');
    const questionPatterns      = signals.filter(s => s.type === 'question_pattern');
    const corrections           = signals.filter(s => s.type === 'correction_issued');
    const shortEngagements      = signals.filter(s => s.type === 'engagement_short');

    // ── formality ──
    // High-complexity vocabulary → formality up; casual low-complexity → formality down.
    for (const sig of vocabSamples) {
      const complexity = sig.complexityScore ?? sig.vocabularyLevel ?? 5;
      if (complexity > 7) {
        r.formality = ema(r.formality, clamp(r.formality + 0.10));
      } else if (complexity < 4) {
        r.formality = ema(r.formality, clamp(r.formality - 0.08));
      }
    }

    // ── directness ──
    // Short direct questions, short engagements, and corrections all push directness up.
    for (const sig of questionPatterns) {
      if (sig.isShortDirect) {
        r.directness = ema(r.directness, clamp(r.directness + 0.12));
      }
    }
    if (shortEngagements.length > 0) {
      const fraction = shortEngagements.length / Math.max(1, signals.length);
      r.directness = ema(r.directness, clamp(r.directness + fraction * 0.10));
    }
    for (const _ of corrections) {
      r.directness = ema(r.directness, clamp(r.directness + 0.08));
    }

    // ── philosophicalBias ──
    for (const _ of philosophicalTangents) {
      r.philosophicalBias = ema(r.philosophicalBias, clamp(r.philosophicalBias + 0.15));
    }
    for (const _ of contrarianPushes) {
      r.philosophicalBias = ema(r.philosophicalBias, clamp(r.philosophicalBias + 0.06));
    }

    // ── abstractTolerance ──
    for (const _ of philosophicalTangents) {
      r.abstractTolerance = ema(r.abstractTolerance, clamp(r.abstractTolerance + 0.12));
    }
    // Assumption-challenges also signal tolerance for non-concrete thinking.
    const assumptionChallenges = signals.filter(s => s.type === 'assumption_challenged');
    for (const _ of assumptionChallenges) {
      r.abstractTolerance = ema(r.abstractTolerance, clamp(r.abstractTolerance + 0.07));
    }

    // ── depthPreference ──
    // Map the running ratio of depth vs simplify requests onto 0–1.
    const totalDepth = depthRequests.length + simplifyRequests.length;
    if (totalDepth > 0) {
      const ratio = depthRequests.length / totalDepth; // 0=all-simplify, 1=all-depth
      r.depthPreference = ema(r.depthPreference, ratio);
    }

    // ── vocabularyLevel (normalised 0–1) ──
    for (const sig of vocabSamples) {
      if (sig.vocabularyLevel !== undefined) {
        r.vocabularyLevel = ema(r.vocabularyLevel, sig.vocabularyLevel / 10);
      }
    }

    r.formality         = clamp(r.formality);
    r.directness        = clamp(r.directness);
    r.philosophicalBias = clamp(r.philosophicalBias);
    r.abstractTolerance = clamp(r.abstractTolerance);
    r.depthPreference   = clamp(r.depthPreference);
    r.vocabularyLevel   = clamp(r.vocabularyLevel);

    return r;
  }

  // ── Communication profile ──────────────────────────────────────────────────
  //
  // Syncs concrete values (vocabularyLevel 1–10, formality, directness, warmth,
  // seriousness, preferredFormat, preferredDepth) from both radar EMA values
  // and signal-specific observations.

  private updateCommunicationProfile(
    prev: CommunicationProfile,
    radar: CognitiveRadarValues,
    signals: EvolutionSignal[],
  ): CommunicationProfile {
    const c = { ...prev };

    const vocabSamples      = signals.filter(s => s.type === 'vocabulary_sample');
    const formatSignals     = signals.filter(s => s.type === 'format_preference');
    const depthRequests     = signals.filter(s => s.type === 'depth_request');
    const simplifyRequests  = signals.filter(s => s.type === 'simplify_request');
    const praises           = signals.filter(s => s.type === 'praise_issued');
    const corrections       = signals.filter(s => s.type === 'correction_issued');
    const philosophicals    = signals.filter(s => s.type === 'philosophical_tangent');
    const longEngagements   = signals.filter(s => s.type === 'engagement_long');
    const shortEngagements  = signals.filter(s => s.type === 'engagement_short');

    // vocabularyLevel: raw 1–10 from vocab_sample signals.
    for (const sig of vocabSamples) {
      if (sig.vocabularyLevel !== undefined) {
        c.vocabularyLevel = clamp(ema(c.vocabularyLevel, sig.vocabularyLevel, ALPHA), 1, 10);
      }
    }

    // formality + directness: sync from radar (already EMA'd).
    c.formality  = clamp(ema(c.formality,  radar.formality,  0.30));
    c.directness = clamp(ema(c.directness, radar.directness, 0.30));

    // warmth: praises → up, corrections → down slightly, long engagements → gentle up.
    for (const _ of praises) {
      c.warmth = clamp(ema(c.warmth, clamp(c.warmth + 0.08)));
    }
    for (const _ of corrections) {
      c.warmth = clamp(ema(c.warmth, clamp(c.warmth - 0.04)));
    }
    for (const _ of longEngagements) {
      c.warmth = clamp(ema(c.warmth, clamp(c.warmth + 0.03)));
    }

    // seriousness: philosophical tangents and earnest depth requests push up.
    for (const _ of philosophicals) {
      c.seriousness = clamp(ema(c.seriousness, clamp(c.seriousness + 0.06)));
    }
    for (const _ of longEngagements) {
      c.seriousness = clamp(ema(c.seriousness, clamp(c.seriousness + 0.03)));
    }
    // Short bursty sessions slightly reduce seriousness.
    if (shortEngagements.length > longEngagements.length) {
      c.seriousness = clamp(ema(c.seriousness, clamp(c.seriousness - 0.04)));
    }

    // preferredFormat: explicit signals win; last signal in the batch dominates
    // so format can evolve session-to-session.
    for (const sig of formatSignals) {
      if (sig.prefersProse)   c.preferredFormat = 'prose';
      if (sig.prefersBullets) c.preferredFormat = 'bullets';
      if (sig.prefersCode)    c.preferredFormat = 'code';
    }
    // Strong code-request pattern overrides to 'code' even without explicit format signal.
    const codeRequests = signals.filter(s => s.type === 'code_requested');
    if (codeRequests.length >= 3) c.preferredFormat = 'code';

    // preferredDepth: cumulative ratio of depth vs simplify.
    const total = depthRequests.length + simplifyRequests.length;
    if (total > 0) {
      const ratio = depthRequests.length / total;
      if (ratio > 0.75)       c.preferredDepth = 'exhaustive';
      else if (ratio > 0.50)  c.preferredDepth = 'deep';
      else if (ratio > 0.25)  c.preferredDepth = 'moderate';
      else                    c.preferredDepth = 'surface';
    }

    return c;
  }

  // ── Cognitive style ────────────────────────────────────────────────────────
  //
  // Boolean flag constellation. Flags flip on when the evidence crosses a
  // threshold; they never flip back off (short of a full profile reset).

  private updateCognitiveStyle(
    prev: CognitiveStyle,
    radar: CognitiveRadarValues,
    domains: DomainInterest[],
    signals: EvolutionSignal[],
  ): CognitiveStyle {
    const s = { ...prev };

    const philosophicals    = signals.filter(sig => sig.type === 'philosophical_tangent');
    const assumptionChallenges = signals.filter(sig => sig.type === 'assumption_challenged');
    const contrarianPushes  = signals.filter(sig => sig.type === 'contrarian_push');
    const questionPatterns  = signals.filter(sig => sig.type === 'question_pattern');
    const codeRequested     = signals.filter(sig => sig.type === 'code_requested');
    const corrections       = signals.filter(sig => sig.type === 'correction_issued');

    // systemsThinker: high philosophical bias + sustained assumption challenges.
    if (
      radar.philosophicalBias > 0.50 &&
      (assumptionChallenges.length >= 2 || philosophicals.length >= 2)
    ) {
      s.systemsThinker = true;
    }

    // firstPrinciplesReasoner: explicit first-principles language in raw text.
    const fpTexts = signals.filter(
      sig =>
        sig.rawText &&
        /\b(first principles?|fundamentally|at its core|root cause|why does|underlying)\b/i.test(sig.rawText),
    );
    if (fpTexts.length >= 2) s.firstPrinciplesReasoner = true;

    // analogicalThinker: user frequently uses or requests analogies.
    const analogyTexts = signals.filter(
      sig =>
        sig.rawText &&
        /\b(like a|as if|imagine|think of it as|analogous to|metaphor for)\b/i.test(sig.rawText),
    );
    if (analogyTexts.length >= 2) s.analogicalThinker = true;

    // sovereignCommunicator: corrections ≥ 2 and directness is already high.
    if (corrections.length >= 2 && radar.directness > 0.65) {
      s.sovereignCommunicator = true;
    }

    // socraticDisposition: majority of interactions are questions.
    const questionRatio = questionPatterns.length / Math.max(1, signals.length);
    if (questionRatio > 0.60) s.socraticDisposition = true;

    // patternRecognizer: synthesis language or high frequency of philosophical tangents.
    const synthesisTexts = signals.filter(
      sig =>
        sig.rawText &&
        /\b(connect|synthesize|tie together|broader picture|underlying pattern|framework)\b/i.test(sig.rawText),
    );
    if (synthesisTexts.length >= 2 || philosophicals.length >= 3) s.patternRecognizer = true;

    // convergentThinker: code-heavy + direct → execution-focused.
    if (codeRequested.length >= 3 && radar.directness > 0.70) s.convergentThinker = true;

    // divergentThinker: contrarian + philosophical + active across many domains.
    const activeDomainCount = domains.filter(d => d.score > 0.20).length;
    if (
      contrarianPushes.length >= 2 &&
      radar.philosophicalBias > 0.40 &&
      activeDomainCount > 3
    ) {
      s.divergentThinker = true;
    }

    return s;
  }

  // ── Domain interests ───────────────────────────────────────────────────────

  private updateDomainInterests(
    decayed: DomainInterest[],
    signals: EvolutionSignal[],
  ): DomainInterest[] {
    // Clone array and each entry so we can mutate safely.
    const interests = decayed.map(d => ({ ...d }));

    for (const sig of signals.filter(s => s.domain)) {
      const name   = sig.domain!.toLowerCase().trim();
      const weight = sig.weight ?? 1.0;

      let entry = interests.find(d => d.name.toLowerCase() === name);
      if (!entry) {
        entry = {
          name,
          score:          0,
          visitCount:     0,
          relatedDomains: [],
          color:          this.domainColor(name),
          category:       this.domainCategory(name),
        };
        interests.push(entry);
      }

      entry.visitCount += 1;
      // Score boost with diminishing returns: each visit contributes less as score approaches 1.
      entry.score = clamp(entry.score + 0.05 * weight * (1 - entry.score));
    }

    return interests;
  }

  /**
   * Decay all domain scores by 0.02 per day since profile.lastUpdated.
   * Keeps domain interests from staying artificially high after disengagement.
   */
  private decayDomainScores(interests: DomainInterest[], lastUpdatedMs: number): DomainInterest[] {
    const daysSince = (Date.now() - lastUpdatedMs) / (1000 * 60 * 60 * 24);
    if (daysSince < 0.01) return interests; // less than ~15 min — skip decay
    const decayFactor = Math.max(0, 1 - 0.02 * daysSince);
    return interests.map(d => ({ ...d, score: clamp(d.score * decayFactor) }));
  }

  // ── Correction log ─────────────────────────────────────────────────────────

  private updateCorrectionLog(
    prev: CorrectionLogEntry[],
    signals: EvolutionSignal[],
  ): CorrectionLogEntry[] {
    const log = [...prev];
    for (const sig of signals.filter(s => s.type === 'correction_issued')) {
      log.push({
        id:           sig.id,
        timestamp:    sig.timestamp.getTime(),
        description:  sig.correctionTopic
          ? `Correction on topic: ${sig.correctionTopic}`
          : (sig.correctionText ?? 'Unspecified correction'),
        incorporated: false,
      });
    }
    return log;
  }

  // ── Archetype classification ───────────────────────────────────────────────
  //
  // Score each archetype as a weighted combination of radar values, style flags,
  // communication profile, and domain interests. The highest score wins.
  // Returns 'unknown' until the profile has ≥10 signals.

  private classifyArchetype(
    profile: UserEvolutionProfile,
    signals: EvolutionSignal[],
  ): CommunicationArchetype {
    if (profile.totalSignalsProcessed < 10) return 'unknown';

    const { cognitiveRadar: r, cognitiveStyle: s, communicationProfile: c, domainInterests } = profile;

    const topDomains = [...domainInterests]
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(d => d.name.toLowerCase());

    const domainHits = (keywords: string[]): boolean =>
      topDomains.some(d => keywords.some(k => d.includes(k)));

    const detailRequests   = signals.filter(sig => sig.type === 'depth_request').length;
    const codeRequests     = signals.filter(sig => sig.type === 'code_requested').length;
    const simplifyRequests = signals.filter(sig => sig.type === 'simplify_request').length;
    const shortEngagements = signals.filter(sig => sig.type === 'engagement_short').length;
    const activeDomains    = domainInterests.filter(d => d.score > 0.20).length;

    type Scored = { archetype: CommunicationArchetype; score: number };

    const candidates: Scored[] = [

      {
        archetype: 'philosopher',
        score:
          (r.philosophicalBias > 0.60 ? 0.40 : r.philosophicalBias * 0.55) +
          (r.abstractTolerance > 0.60 ? 0.25 : r.abstractTolerance * 0.35) +
          (c.vocabularyLevel > 7 ? 0.15 : (c.vocabularyLevel / 7) * 0.10) +
          (s.systemsThinker ? 0.10 : 0) +
          (s.firstPrinciplesReasoner ? 0.10 : 0),
      },

      {
        archetype: 'engineer',
        score:
          (codeRequests > 3 ? 0.35 : (codeRequests / 3) * 0.30) +
          (domainHits(['software', 'engineering', 'programming', 'hardware', 'devops']) ? 0.30 : 0) +
          (s.convergentThinker ? 0.20 : 0) +
          (c.preferredFormat === 'code' ? 0.15 : 0),
      },

      {
        archetype: 'strategist',
        score:
          (r.directness > 0.70 ? 0.30 : r.directness * 0.40) +
          (domainHits(['strategy', 'business', 'management', 'leadership', 'product', 'systems']) ? 0.35 : 0) +
          (c.preferredDepth === 'deep' || c.preferredDepth === 'exhaustive' ? 0.20 : 0) +
          (s.systemsThinker ? 0.15 : 0),
      },

      {
        archetype: 'storyteller',
        score:
          (c.preferredFormat === 'prose' ? 0.30 : 0) +
          (domainHits(['history', 'literature', 'culture', 'art', 'narrative']) ? 0.30 : 0) +
          (s.analogicalThinker ? 0.25 : 0) +
          (c.warmth > 0.55 ? 0.15 : c.warmth * 0.20),
      },

      {
        archetype: 'analyst',
        score:
          (r.vocabularyLevel > 0.70 ? 0.20 : r.vocabularyLevel * 0.25) +
          (domainHits(['data', 'math', 'research', 'finance', 'science', 'statistics']) ? 0.30 : 0) +
          (detailRequests > 3 ? 0.20 : (detailRequests / 3) * 0.15) +
          (s.patternRecognizer ? 0.15 : 0) +
          (c.vocabularyLevel > 7 ? 0.15 : 0),
      },

      {
        archetype: 'visionary',
        score:
          (r.abstractTolerance > 0.70 ? 0.30 : r.abstractTolerance * 0.40) +
          (activeDomains > 4 ? 0.25 : (activeDomains / 4) * 0.20) +
          (s.divergentThinker ? 0.25 : 0) +
          (s.systemsThinker ? 0.20 : 0),
      },

      {
        archetype: 'pragmatist',
        score:
          (r.directness > 0.80 ? 0.40 : r.directness * 0.45) +
          (c.preferredDepth === 'surface' || c.preferredDepth === 'moderate' ? 0.25 : 0) +
          (shortEngagements > 2 ? 0.20 : (shortEngagements / 2) * 0.15) +
          (c.preferredFormat === 'bullets' ? 0.15 : 0),
      },

      {
        archetype: 'scholar',
        score:
          (c.vocabularyLevel > 8 ? 0.30 : (c.vocabularyLevel / 8) * 0.25) +
          (detailRequests > 5 ? 0.30 : (detailRequests / 5) * 0.25) +
          (s.socraticDisposition ? 0.20 : 0) +
          // Never asks to simplify + consistently requests depth → deep scholarly habit.
          (simplifyRequests === 0 && detailRequests > 3 ? 0.20 : 0),
      },
    ];

    // Pick the highest scorer; ties broken by current archetype (stability).
    let best: Scored = { archetype: profile.archetype === 'unknown' ? 'scholar' : profile.archetype, score: -1 };
    for (const c of candidates) {
      if (c.score > best.score) best = c;
    }
    return best.archetype;
  }

  /**
   * Confidence grows linearly: min(1.0, totalSignalsProcessed / 200).
   * After 200 signals Atlas has a high-confidence profile.
   * Updated via a gentle EMA to avoid jarring jumps when a session delivers
   * many signals at once.
   */
  private updateArchetypeConfidence(prev: number, totalSignals: number): number {
    const target = Math.min(1.0, totalSignals / 200);
    return clamp(ema(prev, target, 0.20));
  }

  // ── Domain helpers ─────────────────────────────────────────────────────────

  private domainColor(domain: string): string {
    const map: Array<[RegExp, string]> = [
      [/philosoph|ethics|logic/,             '#8B5CF6'],
      [/tech|software|engineer|program|ai/,  '#3B82F6'],
      [/science|physics|biology|chemistry/,  '#10B981'],
      [/math|statistic|calculus|algebra/,    '#F59E0B'],
      [/history|archae/,                     '#EF4444'],
      [/art|design|music/,                   '#EC4899'],
      [/econom|finance|business/,            '#F97316'],
      [/psycholog|cognitive/,                '#06B6D4'],
      [/literature|writing|narrative/,       '#84CC16'],
      [/culture|sociolog/,                   '#A855F7'],
    ];
    for (const [re, color] of map) {
      if (re.test(domain)) return color;
    }
    return '#6B7280';
  }

  private domainCategory(domain: string): DomainInterest['category'] {
    if (/philosoph|ethics|logic|epistemol/.test(domain))              return 'philosophy';
    if (/tech|software|engineer|program|devops|computer|ai|ml/.test(domain)) return 'technology';
    if (/science|physics|biology|chemistry|neuroscience/.test(domain)) return 'science';
    if (/math|statistic|calculus|algebra|geometry/.test(domain))      return 'mathematics';
    if (/art|design|music|literature|writing|narrative/.test(domain)) return 'arts';
    return 'society';
  }
}
