// ─────────────────────────────────────────────────────────────────────────────
// Atlas Governance Layer — Identity Resolution
// Decides whether a detected trait is durable identity, temporary context,
// or noise. Prevents the evolution engine from overfitting to a session or phase.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type SignalDurability =
  | 'durable_identity'    // consistent across 5+ sessions, multiple contexts
  | 'contextual_pattern'  // consistent within a domain/mode but not universal
  | 'temporary_state'     // appeared in 1-3 sessions, likely mood or circumstance
  | 'single_anomaly'      // appeared once, insufficient to classify
  | 'contradicted'        // explicitly contradicted by later signals
  | 'decayed';            // was durable but hasn't appeared in 30+ days

export interface TimestampedSignal {
  value: unknown;
  timestamp: number;   // unix ms
  sessionId: string;
  weight: number;      // 0–1
  context: string;     // which mode/chamber generated this (e.g. 'crucible', 'journal', 'chat')
}

export interface ContradictionEvent {
  timestamp: number;
  previousValue: unknown;
  contradictingValue: unknown;
  resolution: 'new_value_wins' | 'old_value_wins' | 'averaged' | 'contextual_split';
  reasoning: string;
}

export interface TraitSignalHistory {
  traitPath: string;           // e.g. 'tone.formality', 'cognitiveStyle.systemsThinker'
  signals: TimestampedSignal[];
  currentDurability: SignalDurability;
  confidenceScore: number;     // 0–1
  lastConfirmedAt: number;     // unix ms
  firstObservedAt: number;     // unix ms
  contradictions: ContradictionEvent[];
  decayRate: number;           // fractional daily decay applied to confidenceScore
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;

/** Minimum confidence below which a trait is reclassified as 'decayed'. */
const DECAY_THRESHOLD = 0.2;

/** Contexts considered "distinct" for multi-context promotion. */
const DISTINCT_CONTEXTS = new Set(['crucible', 'journal', 'chat', 'voice', 'canvas', 'review']);

/** Minimum delta between numeric values to constitute a contradiction. */
const CONTRADICTION_DELTA = 0.3;

/** Decay rates per durability tier (fractional per day). */
const DECAY_RATES: Record<SignalDurability, number> = {
  durable_identity:   0.005,   // 0.5 % per day
  contextual_pattern: 0.02,    // 2 % per day
  temporary_state:    0.05,    // 5 % per day
  single_anomaly:     0.10,    // 10 % per day (fast eviction)
  contradicted:       0.05,
  decayed:            0,       // already decayed — no further calculation needed
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function nowMs(): number {
  return Date.now();
}

/**
 * Count the number of distinct sessionIds in a signal list.
 */
function distinctSessionCount(signals: TimestampedSignal[]): number {
  return new Set(signals.map((s) => s.sessionId)).size;
}

/**
 * Count the number of distinct known contexts in a signal list.
 */
function distinctContextCount(signals: TimestampedSignal[]): number {
  const observed = new Set(signals.map((s) => s.context));
  let count = 0;
  for (const c of observed) {
    if (DISTINCT_CONTEXTS.has(c)) count++;
  }
  return count;
}

/**
 * Attempt to coerce an unknown value to a number.
 * Returns null if not possible.
 */
function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Compute the absolute numeric delta between two values, if both are numeric.
 * Returns null if either is non-numeric.
 */
function numericDelta(a: unknown, b: unknown): number | null {
  const na = toNumber(a);
  const nb = toNumber(b);
  if (na === null || nb === null) return null;
  return Math.abs(na - nb);
}

/**
 * Average two numeric values. Returns null if either is non-numeric.
 */
function numericAverage(a: unknown, b: unknown): number | null {
  const na = toNumber(a);
  const nb = toNumber(b);
  if (na === null || nb === null) return null;
  return (na + nb) / 2;
}

/**
 * Compute a weighted mean confidence score from a signal list.
 * Signals are weighted by their `weight` field; recency is not factored here
 * because decay is handled separately via `applyDecay`.
 */
function computeConfidence(signals: TimestampedSignal[]): number {
  if (signals.length === 0) return 0;
  const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0);
  if (totalWeight === 0) return 0;
  // confidence = normalised weighted count, capped at 1
  return Math.min(1, totalWeight / Math.max(1, signals.length));
}

/**
 * Classify durability purely from session count, with a multi-context fast-track.
 */
function classifyBySessionCount(
  sessionCount: number,
  contextCount: number,
): SignalDurability {
  // Multi-context fast-track: 3+ distinct contexts collapse thresholds
  if (contextCount >= 3) {
    if (sessionCount >= 4) return 'durable_identity';
    if (sessionCount >= 2) return 'contextual_pattern';
    return 'temporary_state';
  }

  if (sessionCount >= 7) return 'durable_identity';
  if (sessionCount >= 4) return 'contextual_pattern';
  if (sessionCount >= 2) return 'temporary_state';
  return 'single_anomaly';
}

// ─────────────────────────────────────────────────────────────────────────────
// IdentityResolver
// ─────────────────────────────────────────────────────────────────────────────

export class IdentityResolver {
  /**
   * userId → (traitPath → TraitSignalHistory)
   */
  private histories: Map<string, Map<string, TraitSignalHistory>> = new Map();

  // ─── Private accessors ────────────────────────────────────────────────────

  private userMap(userId: string): Map<string, TraitSignalHistory> {
    if (!this.histories.has(userId)) {
      this.histories.set(userId, new Map());
    }
    return this.histories.get(userId)!;
  }

  private getOrCreateHistory(userId: string, traitPath: string): TraitSignalHistory {
    const map = this.userMap(userId);
    if (!map.has(traitPath)) {
      map.set(traitPath, {
        traitPath,
        signals: [],
        currentDurability: 'single_anomaly',
        confidenceScore: 0,
        lastConfirmedAt: 0,
        firstObservedAt: 0,
        contradictions: [],
        decayRate: DECAY_RATES['single_anomaly'],
      });
    }
    return map.get(traitPath)!;
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Classify a new incoming signal before it is committed.
   *
   * Steps:
   * 1. Retrieve or create the trait history.
   * 2. Check for contradiction against the existing dominant value.
   * 3. Append the new signal.
   * 4. Re-derive durability from session and context counts.
   * 5. Update confidence and timestamps.
   * 6. Return the new durability classification.
   */
  classifySignal(
    userId: string,
    traitPath: string,
    newValue: unknown,
    sessionId: string,
    weight: number,
    context: string,
  ): SignalDurability {
    const history = this.getOrCreateHistory(userId, traitPath);
    const now = nowMs();

    const newSignal: TimestampedSignal = {
      value: newValue,
      timestamp: now,
      sessionId,
      weight: Math.max(0, Math.min(1, weight)),
      context,
    };

    // ── Step 1: contradiction check ─────────────────────────────────────────
    if (history.signals.length > 0) {
      const dominant = history.signals[history.signals.length - 1]; // most recent
      const delta = numericDelta(dominant.value, newValue);

      const isContradiction =
        delta !== null
          ? delta > CONTRADICTION_DELTA
          : dominant.value !== newValue;

      if (isContradiction) {
        const event = this.resolveContradiction(history, newSignal);
        history.contradictions.push(event);

        // Apply resolution outcome
        switch (event.resolution) {
          case 'new_value_wins':
            // Clear old signals; this trait resets around the new value
            history.signals = [newSignal];
            history.currentDurability = 'single_anomaly';
            break;

          case 'old_value_wins':
            // Discard the new signal — old identity wins
            // Still record the contradiction but don't append the signal
            this._updateDurabilityAndConfidence(history, now);
            return 'contradicted';

          case 'averaged': {
            const avg = numericAverage(dominant.value, newValue);
            const averagedSignal: TimestampedSignal = { ...newSignal, value: avg };
            history.signals.push(averagedSignal);
            break;
          }

          case 'contextual_split':
            // Append signal as-is; both values coexist in different contexts
            history.signals.push(newSignal);
            break;
        }
      } else {
        // No contradiction — append normally
        history.signals.push(newSignal);
      }
    } else {
      // First signal for this trait
      history.signals.push(newSignal);
      history.firstObservedAt = now;
    }

    // ── Step 2: re-derive durability ────────────────────────────────────────
    this._updateDurabilityAndConfidence(history, now);

    return history.currentDurability;
  }

  /**
   * Resolve a contradiction between the existing trait history and a new signal.
   *
   * Rules:
   * - new.weight > 0.8 AND existing is temporary_state → new_value_wins
   * - existing is durable_identity AND new signal is single-session → old_value_wins
   * - both contextual → contextual_split
   * - delta ≤ 0.15 → averaged
   */
  resolveContradiction(
    existing: TraitSignalHistory,
    newSignal: TimestampedSignal,
  ): ContradictionEvent {
    const existingLastValue =
      existing.signals.length > 0
        ? existing.signals[existing.signals.length - 1].value
        : undefined;

    const delta = numericDelta(existingLastValue, newSignal.value);

    // Rule 0: Small numeric delta → average the values
    if (delta !== null && delta <= 0.15) {
      return {
        timestamp: newSignal.timestamp,
        previousValue: existingLastValue,
        contradictingValue: newSignal.value,
        resolution: 'averaged',
        reasoning:
          `Numeric delta (${delta.toFixed(3)}) is within 0.15 tolerance — values averaged to smooth minor oscillation.`,
      };
    }

    // Rule 1: Strong new signal overrides a temporary state
    if (newSignal.weight > 0.8 && existing.currentDurability === 'temporary_state') {
      return {
        timestamp: newSignal.timestamp,
        previousValue: existingLastValue,
        contradictingValue: newSignal.value,
        resolution: 'new_value_wins',
        reasoning:
          `New signal weight ${newSignal.weight} exceeds 0.8 and existing trait is only "temporary_state". New value replaces the trait.`,
      };
    }

    // Rule 2: Durable identity withstands a single-session contradiction
    if (existing.currentDurability === 'durable_identity') {
      const uniqueSessions = new Set(existing.signals.map((s) => s.sessionId));
      const isNewSessionFirst = !uniqueSessions.has(newSignal.sessionId);

      if (isNewSessionFirst) {
        return {
          timestamp: newSignal.timestamp,
          previousValue: existingLastValue,
          contradictingValue: newSignal.value,
          resolution: 'old_value_wins',
          reasoning:
            `Existing trait has "durable_identity" classification. Single-session contradiction (session "${newSignal.sessionId}") is insufficient to override it.`,
        };
      }
    }

    // Rule 3: Both contextual → split by context
    if (
      existing.currentDurability === 'contextual_pattern' &&
      newSignal.weight <= 0.8
    ) {
      return {
        timestamp: newSignal.timestamp,
        previousValue: existingLastValue,
        contradictingValue: newSignal.value,
        resolution: 'contextual_split',
        reasoning:
          `Both signals are contextual in nature. Keeping both values as context-aware variants (existing context vs "${newSignal.context}").`,
      };
    }

    // Default: newer signal takes precedence
    return {
      timestamp: newSignal.timestamp,
      previousValue: existingLastValue,
      contradictingValue: newSignal.value,
      resolution: 'new_value_wins',
      reasoning:
        `No specific rule matched. Defaulting to new_value_wins — more recent signal replaces older value.`,
    };
  }

  /**
   * Apply time-based confidence decay to all traits for a user.
   * Should be called once per evolution cycle with the current timestamp.
   *
   * Decay rates:
   *   durable_identity   → 0.5 % per day
   *   contextual_pattern → 2 % per day
   *   temporary_state    → 5 % per day
   *
   * Traits whose confidence falls below 0.2 are reclassified as 'decayed'.
   */
  applyDecay(userId: string, currentTimestamp: number): void {
    const map = this.userMap(userId);

    for (const history of map.values()) {
      if (
        history.currentDurability === 'decayed' ||
        history.lastConfirmedAt === 0
      ) {
        continue;
      }

      const daysSinceConfirmed =
        (currentTimestamp - history.lastConfirmedAt) / MS_PER_DAY;

      if (daysSinceConfirmed <= 0) continue;

      const rate = DECAY_RATES[history.currentDurability] ?? 0.05;
      const decayFactor = Math.pow(1 - rate, daysSinceConfirmed);
      history.confidenceScore = Math.max(0, history.confidenceScore * decayFactor);
      history.decayRate = rate;

      if (history.confidenceScore < DECAY_THRESHOLD) {
        history.currentDurability = 'decayed';
        history.decayRate = 0;
      }
    }
  }

  /**
   * Return all traits currently classified as durable_identity for a user.
   */
  getDurableTraits(userId: string): TraitSignalHistory[] {
    const map = this.userMap(userId);
    return Array.from(map.values()).filter(
      (h) => h.currentDurability === 'durable_identity',
    );
  }

  /**
   * Return all traits that have recently decayed (were durable, now decayed).
   * "Recently" is defined as having a decayRate > 0 set when downgraded —
   * these traits still have signal history and are preserved for audit.
   */
  getDecayedTraits(userId: string): TraitSignalHistory[] {
    const map = this.userMap(userId);
    return Array.from(map.values()).filter(
      (h) => h.currentDurability === 'decayed' && h.signals.length > 0,
    );
  }

  /**
   * Determine whether a signal of the given durability and confidence should
   * be committed to the user's profile.
   *
   * Rules:
   *   single_anomaly     → never commit (hold for confirmation)
   *   temporary_state    → commit only if confidence > 0.6
   *   contextual_pattern → commit to context-specific adjustments only
   *   durable_identity   → commit fully
   *   contradicted       → do not commit
   *   decayed            → do not commit
   */
  shouldCommit(durability: SignalDurability, confidence: number): boolean {
    switch (durability) {
      case 'single_anomaly':
        return false;
      case 'temporary_state':
        return confidence > 0.6;
      case 'contextual_pattern':
        // Commit, but callers are expected to scope to the relevant context
        return true;
      case 'durable_identity':
        return true;
      case 'contradicted':
        return false;
      case 'decayed':
        return false;
      default:
        return false;
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Recompute and mutate `history.currentDurability`, `history.confidenceScore`,
   * `history.lastConfirmedAt`, and `history.decayRate` based on current signals.
   */
  private _updateDurabilityAndConfidence(
    history: TraitSignalHistory,
    now: number,
  ): void {
    const sessionCount = distinctSessionCount(history.signals);
    const contextCount = distinctContextCount(history.signals);

    history.currentDurability = classifyBySessionCount(sessionCount, contextCount);
    history.confidenceScore = computeConfidence(history.signals);
    history.lastConfirmedAt = now;
    history.decayRate = DECAY_RATES[history.currentDurability] ?? 0.05;
  }
}
