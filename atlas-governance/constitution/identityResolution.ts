/**
 * Atlas Identity Resolution
 * Phase 2 Governance
 *
 * Classifies every extracted trait signal as:
 *   durable | contextual | temporary | anomaly
 *
 * Applies confidence decay over time and handles
 * contradictions between signals.
 */

export type TraitClass = 'durable' | 'contextual' | 'temporary' | 'anomaly';
export type TraitStatus = 'observed' | 'confirmed' | 'decayed' | 'contradicted' | 'rejected';

export interface TraitSignal {
  id: string;
  userId: string;
  trait: string;
  value: string;
  source: string; // e.g. 'message', 'crucible', 'journal', 'resonance'
  timestamp: string;
  confidence: number; // 0–1
  class: TraitClass;
  status: TraitStatus;
  decayRate: number; // per-day confidence loss
  contradicts?: string[]; // IDs of contradicted signals
}

// Decay rates by class (confidence lost per day)
const DECAY_RATES: Record<TraitClass, number> = {
  durable: 0.005,    // very slow — durable traits persist for months
  contextual: 0.05,  // moderate — context-specific, fades in weeks
  temporary: 0.15,   // fast — mood/state signals, fades in days
  anomaly: 0.5,      // very fast — one-off, nearly immediate decay
};

// Minimum confidence to remain 'observed'; below this → 'decayed'
const DECAY_THRESHOLD = 0.15;

// Confidence threshold to promote from 'observed' → 'confirmed'
const CONFIRMATION_THRESHOLD = 0.75;

// Minimum number of independent signals to confirm a durable trait
const CONFIRMATION_SIGNAL_COUNT = 3;

const traitStore: Map<string, TraitSignal[]> = new Map();

function getUserTraits(userId: string): TraitSignal[] {
  if (!traitStore.has(userId)) traitStore.set(userId, []);
  return traitStore.get(userId)!;
}

/**
 * Classify a raw signal into a TraitClass based on heuristics.
 */
export function classifySignal(
  trait: string,
  source: string,
  contextualKeywords: string[] = []
): TraitClass {
  const durableKeywords = ['always', 'core', 'fundamental', 'consistently', 'deeply', 'pattern'];
  const temporaryKeywords = ['today', 'right now', 'feeling', 'stressed', 'tired', 'upset', 'excited'];
  const anomalyKeywords = ['never mind', 'just once', 'ignore', 'random', 'weird'];

  const combined = `${trait} ${contextualKeywords.join(' ')}`.toLowerCase();

  if (anomalyKeywords.some((k) => combined.includes(k))) return 'anomaly';
  if (temporaryKeywords.some((k) => combined.includes(k))) return 'temporary';
  if (durableKeywords.some((k) => combined.includes(k))) return 'durable';
  if (source === 'journal' || source === 'crucible') return 'contextual';
  return 'contextual';
}

/**
 * Record a new trait signal for a user.
 */
export function recordSignal(
  userId: string,
  trait: string,
  value: string,
  source: string,
  confidence: number,
  contextualKeywords: string[] = []
): TraitSignal {
  const traitClass = classifySignal(trait, source, contextualKeywords);
  const signal: TraitSignal = {
    id: `sig-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId,
    trait,
    value,
    source,
    timestamp: new Date().toISOString(),
    confidence: Math.min(1, Math.max(0, confidence)),
    class: traitClass,
    status: 'observed',
    decayRate: DECAY_RATES[traitClass],
  };

  const existing = getUserTraits(userId);

  // Contradiction detection
  const contradictions = existing.filter(
    (s) =>
      s.status !== 'contradicted' &&
      s.status !== 'rejected' &&
      s.trait === trait &&
      s.value !== value &&
      s.confidence > 0.5
  );

  if (contradictions.length > 0) {
    signal.contradicts = contradictions.map((c) => c.id);
    // Lower-confidence prior signals get contradicted
    for (const c of contradictions) {
      if (c.confidence < signal.confidence) {
        c.status = 'contradicted';
      }
    }
  }

  existing.push(signal);
  return signal;
}

/**
 * Apply time-based confidence decay to all signals for a user.
 * Should be called periodically (e.g. on login or daily flush).
 */
export function applyDecay(userId: string): void {
  const traits = getUserTraits(userId);
  const now = Date.now();

  for (const signal of traits) {
    if (signal.status === 'decayed' || signal.status === 'rejected') continue;

    const ageDays = (now - new Date(signal.timestamp).getTime()) / (1000 * 60 * 60 * 24);
    const decayed = signal.confidence - signal.decayRate * ageDays;
    signal.confidence = Math.max(0, decayed);

    if (signal.confidence < DECAY_THRESHOLD) {
      signal.status = 'decayed';
    }
  }
}

/**
 * Promote observed signals to 'confirmed' when confidence and signal count thresholds are met.
 */
export function promoteConfirmedTraits(userId: string): TraitSignal[] {
  const traits = getUserTraits(userId);
  const promoted: TraitSignal[] = [];

  const byTrait = new Map<string, TraitSignal[]>();
  for (const s of traits) {
    if (s.status !== 'observed') continue;
    if (!byTrait.has(s.trait)) byTrait.set(s.trait, []);
    byTrait.get(s.trait)!.push(s);
  }

  for (const [, signals] of byTrait) {
    const highConfidence = signals.filter((s) => s.confidence >= CONFIRMATION_THRESHOLD);
    if (
      highConfidence.length >= CONFIRMATION_SIGNAL_COUNT ||
      (highConfidence.length >= 2 && highConfidence.every((s) => s.class === 'durable'))
    ) {
      for (const s of highConfidence) {
        s.status = 'confirmed';
        promoted.push(s);
      }
    }
  }

  return promoted;
}

export function getConfirmedTraits(userId: string): TraitSignal[] {
  return getUserTraits(userId).filter((s) => s.status === 'confirmed');
}

export function getObservedTraits(userId: string): TraitSignal[] {
  return getUserTraits(userId).filter((s) => s.status === 'observed');
}

export function getAllTraits(userId: string): TraitSignal[] {
  return [...getUserTraits(userId)];
}
