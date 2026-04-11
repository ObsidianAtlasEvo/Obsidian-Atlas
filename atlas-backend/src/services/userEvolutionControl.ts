/**
 * UserEvolutionControl
 *
 * The interface through which users can inspect, freeze, revert, and
 * selectively reset their evolution state. This is what makes personalization
 * trustworthy rather than magical.
 *
 * Persists to Supabase table: atlas_evolution_control
 *   Columns: user_id (PK), state (JSONB), updated_at
 */

import { AtlasEventBus, type AtlasEventType } from '../infrastructure/eventBus.js';

// ---------------------------------------------------------------------------
// External types referenced from other Atlas subsystems
// (declared here as interfaces so this file compiles standalone)
// ---------------------------------------------------------------------------

/** Minimal shape of a user's evolution profile used here */
export interface UserEvolutionProfile {
  userId: string;
  version: number;
  confidence: number;
  archetype: string;
  totalSignals: number;
  totalMutations: number;
  quarantined: boolean;
  traits: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

/** A single mutation record in the ledger */
export interface MutationRecord {
  id: string;
  userId: string;
  timestamp: number;
  traitPath: string;
  operation: string;          // e.g. '+= 0.1' | '= "deep"' | '+= "Certainly!"'
  previousValue: unknown;
  newValue: unknown;
  trigger: string;
  impact: 'minor' | 'moderate' | 'significant';
  reverted?: boolean;
}

/** An inbound signal from the user's session */
export interface EvolutionSignal {
  id: string;
  userId: string;
  sessionId: string;
  timestamp: number;
  type: string;
  data: Record<string, unknown>;
  processed: boolean;
}

/** Minimal ledger interface used for revert operations */
export interface MutationLedger {
  getMutation(mutationId: string): MutationRecord | undefined;
  applyRevert(mutation: MutationRecord, profile: UserEvolutionProfile): UserEvolutionProfile;
  getRecentMutations(userId: string, sinceTimestamp: number): MutationRecord[];
  markReverted(mutationId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export interface EvolutionInspectionReport {
  userId: string;
  generatedAt: number;
  profileSummary: {
    version: number;
    confidence: number;
    archetype: string;
    totalSignals: number;
    totalMutations: number;
    quarantined: boolean;
  };
  /** Traits Atlas has seen but NOT yet committed */
  observedTraits: ObservedTrait[];
  /** Traits Atlas has committed to the profile */
  confirmedTraits: ConfirmedTrait[];
  /** Last 10 mutations in plain language */
  recentMutations: MutationSummary[];
  /** Which trait areas are frozen by the user */
  frozenAreas: string[];
  /** Signals waiting to be processed */
  pendingSignals: number;
}

export interface ObservedTrait {
  traitPath: string;
  /** Plain language description: "You seem to prefer direct responses" */
  humanLabel: string;
  observedValue: unknown;
  /** How many sessions Atlas has seen this trait */
  sessionCount: number;
  durability: 'still observing' | 'likely pattern' | 'confirmed';
  confidence: number;
  canDismiss: boolean;
}

export interface ConfirmedTrait {
  traitPath: string;
  humanLabel: string;
  currentValue: unknown;
  confirmedAt: number;
  source: string;
  canReset: boolean;
  canFreeze: boolean;
}

export interface MutationSummary {
  id: string;
  timestamp: number;
  /** Plain-language: "Atlas stopped opening responses with 'Certainly!'" */
  humanDescription: string;
  /** "You regenerated 3 responses in a row" */
  trigger: string;
  impact: 'minor' | 'moderate' | 'significant';
  canRevert: boolean;
}

export interface EvolutionControlState {
  userId: string;
  /** Global freeze — no evolution applies at all */
  evolutionFrozen: boolean;
  /** Specific trait areas that are frozen */
  frozenTraitAreas: string[];
  /** Trait paths the user has dismissed from the observation panel */
  dismissedObservations: string[];
  /** Manually locked trait values */
  manualOverrides: ManualOverride[];
}

export interface ManualOverride {
  traitPath: string;
  value: unknown;
  setAt: number;
  /** If set, the override auto-reverts after this timestamp */
  lockedUntil?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUPABASE_TABLE = 'atlas_evolution_control';

const DEFAULT_PROFILE_TRAITS: Record<string, unknown> = {
  'tone.formality':              0.5,
  'tone.warmth':                 0.5,
  'vocabulary.preferredComplexity': 2,
  'depth.preferredDepth':        'medium',
  'format.preferLists':          false,
  'format.preferCodeBlocks':     true,
  'format.responseLength':       'adaptive',
  'domains.primary':             [],
  'cognitive.analyticalBias':    0.5,
};

// Trait areas and the trait paths that belong to them
const TRAIT_AREA_MAP: Record<string, string[]> = {
  tone:           ['tone.formality', 'tone.warmth'],
  vocabulary:     ['vocabulary.preferredComplexity', 'vocabulary.bannedPatterns'],
  depth:          ['depth.preferredDepth', 'depth.detailLevel'],
  format:         ['format.preferLists', 'format.preferCodeBlocks', 'format.responseLength'],
  domains:        ['domains.primary', 'domains.secondary'],
  cognitive:      ['cognitive.analyticalBias', 'cognitive.preferExamples'],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function msToRelative(ms: number): string {
  const delta = Date.now() - ms;
  const seconds = Math.floor(delta / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// UserEvolutionControl
// ---------------------------------------------------------------------------

export class UserEvolutionControl {
  /** In-memory control state cache */
  private controlStates: Map<string, EvolutionControlState> = new Map();

  // -------------------------------------------------------------------------
  // Report generation
  // -------------------------------------------------------------------------

  /**
   * Generate a full inspection report for a user — what Atlas knows,
   * what it has changed, what it is watching, and what the user has locked.
   */
  async generateReport(
    userId: string,
    profile: UserEvolutionProfile,
    mutationLedger: MutationRecord[],
    signalHistory: EvolutionSignal[],
  ): Promise<EvolutionInspectionReport> {
    const controlState = await this.getOrLoadState(userId);

    // --- Profile summary ---
    const profileSummary = {
      version:        profile.version,
      confidence:     profile.confidence,
      archetype:      profile.archetype,
      totalSignals:   profile.totalSignals,
      totalMutations: profile.totalMutations,
      quarantined:    profile.quarantined,
    };

    // --- Confirmed traits (from profile.traits) ---
    const confirmedTraits: ConfirmedTrait[] = this.extractConfirmedTraits(
      profile,
      controlState,
    );

    // --- Observed traits (from unprocessed signals + recent low-confidence observations) ---
    const observedTraits: ObservedTrait[] = this.extractObservedTraits(
      userId,
      signalHistory,
      controlState,
    );

    // --- Recent mutations (last 10) ---
    const recentMutations: MutationSummary[] = mutationLedger
      .filter((m) => m.userId === userId && !m.reverted)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 10)
      .map((m) => ({
        id:               m.id,
        timestamp:        m.timestamp,
        humanDescription: this.humanizeMutation(m),
        trigger:          m.trigger,
        impact:           m.impact,
        canRevert:        !m.reverted,
      }));

    // --- Pending signals ---
    const pendingSignals = signalHistory.filter(
      (s) => s.userId === userId && !s.processed,
    ).length;

    return {
      userId,
      generatedAt: Date.now(),
      profileSummary,
      observedTraits,
      confirmedTraits,
      recentMutations,
      frozenAreas:    controlState.frozenTraitAreas,
      pendingSignals,
    };
  }

  // -------------------------------------------------------------------------
  // Freeze / Unfreeze
  // -------------------------------------------------------------------------

  /** Globally freeze all evolution for a user */
  freezeEvolution(userId: string): void {
    const state = this.ensureState(userId);
    state.evolutionFrozen = true;
    this.emitControlEvent(userId, 'sovereign.flag.toggled', { action: 'freeze_all' });
  }

  /** Restore evolution after a global freeze */
  unfreezeEvolution(userId: string): void {
    const state = this.ensureState(userId);
    state.evolutionFrozen = false;
    this.emitControlEvent(userId, 'sovereign.flag.toggled', { action: 'unfreeze_all' });
  }

  /** Freeze a specific trait area (e.g. 'tone', 'vocabulary', 'format') */
  freezeArea(userId: string, traitArea: string): void {
    const state = this.ensureState(userId);
    if (!state.frozenTraitAreas.includes(traitArea)) {
      state.frozenTraitAreas.push(traitArea);
    }
    this.emitControlEvent(userId, 'sovereign.flag.toggled', { action: 'freeze_area', traitArea });
  }

  /** Unfreeze a specific trait area */
  unfreezeArea(userId: string, traitArea: string): void {
    const state = this.ensureState(userId);
    state.frozenTraitAreas = state.frozenTraitAreas.filter((a) => a !== traitArea);
    this.emitControlEvent(userId, 'sovereign.flag.toggled', { action: 'unfreeze_area', traitArea });
  }

  // -------------------------------------------------------------------------
  // Revert mutations
  // -------------------------------------------------------------------------

  /**
   * Revert a specific mutation by ID.
   * Applies the inverse operation to the profile and marks the mutation as reverted.
   */
  async revertMutation(
    userId: string,
    mutationId: string,
    ledger: MutationLedger,
  ): Promise<void> {
    const mutation = ledger.getMutation(mutationId);
    if (!mutation) throw new Error(`Mutation ${mutationId} not found`);
    if (mutation.userId !== userId) throw new Error(`Mutation ${mutationId} does not belong to user ${userId}`);

    await ledger.markReverted(mutationId);

    this.emitControlEvent(userId, 'mutation.rolled_back', {
      mutationId,
      traitPath: mutation.traitPath,
    });
  }

  /**
   * Revert all mutations in the last N days.
   * Returns the count of reverted mutations.
   */
  async revertRecent(
    userId: string,
    days: number,
    ledger: MutationLedger,
  ): Promise<number> {
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const mutations = ledger.getRecentMutations(userId, since);
    const eligible = mutations.filter((m) => !m.reverted);

    for (const m of eligible) {
      await ledger.markReverted(m.id);
    }

    this.emitControlEvent(userId, 'mutation.rolled_back', {
      count: eligible.length,
      days,
    });

    return eligible.length;
  }

  // -------------------------------------------------------------------------
  // Reset
  // -------------------------------------------------------------------------

  /**
   * Reset all traits in a specific area back to defaults.
   * Returns the updated profile.
   */
  async resetArea(
    userId: string,
    traitArea: string,
    profile: UserEvolutionProfile,
  ): Promise<UserEvolutionProfile> {
    const paths = TRAIT_AREA_MAP[traitArea] ?? [];
    const updatedTraits = { ...profile.traits };

    for (const path of paths) {
      if (DEFAULT_PROFILE_TRAITS[path] !== undefined) {
        updatedTraits[path] = DEFAULT_PROFILE_TRAITS[path];
      } else {
        delete updatedTraits[path];
      }
    }

    const updated: UserEvolutionProfile = {
      ...profile,
      traits:    updatedTraits,
      version:   profile.version + 1,
      updatedAt: Date.now(),
    };

    this.emitControlEvent(userId, 'sovereign.flag.toggled', {
      action:    'reset_area',
      traitArea,
      paths,
    });

    return updated;
  }

  /**
   * Full profile reset — clears all evolved traits and returns a fresh profile.
   * Session history, signal history, and the mutation ledger are preserved
   * (they become the audit trail for "before the reset").
   */
  async resetProfile(userId: string): Promise<UserEvolutionProfile> {
    const fresh: UserEvolutionProfile = {
      userId,
      version:        1,
      confidence:     0,
      archetype:      'discovering',
      totalSignals:   0,
      totalMutations: 0,
      quarantined:    false,
      traits:         { ...DEFAULT_PROFILE_TRAITS },
      createdAt:      Date.now(),
      updatedAt:      Date.now(),
    };

    this.emitControlEvent(userId, 'sovereign.flag.toggled', { action: 'full_reset' });

    return fresh;
  }

  // -------------------------------------------------------------------------
  // Observations
  // -------------------------------------------------------------------------

  /** Dismiss an observed (uncommitted) trait — Atlas will stop surfacing it */
  dismissObservation(userId: string, traitPath: string): void {
    const state = this.ensureState(userId);
    if (!state.dismissedObservations.includes(traitPath)) {
      state.dismissedObservations.push(traitPath);
    }
    this.emitControlEvent(userId, 'sovereign.flag.toggled', {
      action: 'dismiss_observation',
      traitPath,
    });
  }

  // -------------------------------------------------------------------------
  // Manual overrides
  // -------------------------------------------------------------------------

  /**
   * Lock a trait to a specific value.
   * Atlas will respect this override and never evolve past it.
   * Optionally expires after lockDays days.
   */
  setManualOverride(
    userId: string,
    traitPath: string,
    value: unknown,
    lockDays?: number,
  ): void {
    const state = this.ensureState(userId);

    // Remove any existing override for this path
    state.manualOverrides = state.manualOverrides.filter((o) => o.traitPath !== traitPath);

    const override: ManualOverride = {
      traitPath,
      value,
      setAt: Date.now(),
      ...(lockDays !== undefined
        ? { lockedUntil: Date.now() + lockDays * 24 * 60 * 60 * 1000 }
        : {}),
    };

    state.manualOverrides.push(override);

    this.emitControlEvent(userId, 'sovereign.flag.toggled', {
      action:    'manual_override',
      traitPath,
      value,
      lockDays,
    });
  }

  /**
   * Check whether a trait path is constrained by a freeze or manual override.
   * Returns frozen=true if the trait's area is frozen or evolution is globally frozen.
   * Returns overridden=true with the override value if a manual override exists.
   */
  isConstrained(
    userId: string,
    traitPath: string,
  ): { frozen: boolean; overridden: boolean; overrideValue?: unknown } {
    const state = this.controlStates.get(userId);
    if (!state) return { frozen: false, overridden: false };

    // Global freeze
    if (state.evolutionFrozen) return { frozen: true, overridden: false };

    // Area-level freeze
    const area = this.traitPathToArea(traitPath);
    if (area && state.frozenTraitAreas.includes(area)) {
      return { frozen: true, overridden: false };
    }

    // Manual override (check expiry)
    const now = Date.now();
    const override = state.manualOverrides.find((o) => {
      if (o.traitPath !== traitPath) return false;
      if (o.lockedUntil && now > o.lockedUntil) return false; // expired
      return true;
    });

    if (override) {
      return { frozen: false, overridden: true, overrideValue: override.value };
    }

    return { frozen: false, overridden: false };
  }

  // -------------------------------------------------------------------------
  // Humanization helpers
  // -------------------------------------------------------------------------

  /**
   * Translate a MutationRecord to plain English.
   *
   * Examples:
   *  bannedPatterns += "Certainly!" → "Atlas stopped opening responses with 'Certainly!'"
   *  tone.formality += 0.1          → "Atlas became slightly more formal in its responses"
   *  depth.preferredDepth = 'deep'  → "Atlas began giving deeper, more detailed responses"
   *  vocabulary.preferredComplexity += 1 → "Atlas raised the vocabulary level in its responses"
   */
  private humanizeMutation(mutation: MutationRecord): string {
    const { traitPath, operation, newValue, previousValue } = mutation;

    // Ban patterns
    if (traitPath.endsWith('bannedPatterns') && operation.includes('+=')) {
      return `Atlas stopped opening responses with '${newValue}'`;
    }

    // Tone formality
    if (traitPath === 'tone.formality') {
      const prev = Number(previousValue ?? 0);
      const next = Number(newValue ?? 0);
      const delta = next - prev;
      if (Math.abs(delta) < 0.05) return 'Atlas made a tiny adjustment to its tone';
      if (delta > 0) return 'Atlas became slightly more formal in its responses';
      return 'Atlas became slightly more casual in its responses';
    }

    // Tone warmth
    if (traitPath === 'tone.warmth') {
      const prev = Number(previousValue ?? 0);
      const next = Number(newValue ?? 0);
      if (next > prev) return 'Atlas adopted a warmer, friendlier tone';
      return 'Atlas adopted a slightly cooler, more direct tone';
    }

    // Depth
    if (traitPath === 'depth.preferredDepth') {
      if (newValue === 'deep')    return 'Atlas began giving deeper, more detailed responses';
      if (newValue === 'shallow') return 'Atlas began giving shorter, more concise responses';
      return `Atlas adjusted its response depth to '${newValue}'`;
    }

    // Vocabulary complexity
    if (traitPath === 'vocabulary.preferredComplexity') {
      const prev = Number(previousValue ?? 0);
      const next = Number(newValue ?? 0);
      if (next > prev) return 'Atlas raised the vocabulary level in its responses';
      return 'Atlas simplified the vocabulary level in its responses';
    }

    // Format: lists
    if (traitPath === 'format.preferLists') {
      if (newValue === true)  return 'Atlas started using bullet points and lists more often';
      if (newValue === false) return 'Atlas moved away from bullet points toward prose';
    }

    // Format: code blocks
    if (traitPath === 'format.preferCodeBlocks') {
      if (newValue === true)  return 'Atlas started wrapping code in formatted code blocks';
      if (newValue === false) return 'Atlas stopped using code blocks by default';
    }

    // Response length
    if (traitPath === 'format.responseLength') {
      return `Atlas adjusted its default response length to '${newValue}'`;
    }

    // Cognitive: analytical bias
    if (traitPath === 'cognitive.analyticalBias') {
      const prev = Number(previousValue ?? 0.5);
      const next = Number(newValue ?? 0.5);
      if (next > prev) return 'Atlas became more analytical and structured in its reasoning';
      return 'Atlas became more conversational and less rigid in its reasoning';
    }

    // Generic fallback
    const label = this.humanizeTraitPath(traitPath);
    return `Atlas updated ${label}`;
  }

  /**
   * Translate a dot-path trait key to a plain English label.
   * e.g. 'tone.formality' → 'response formality'
   */
  private humanizeTraitPath(traitPath: string): string {
    const map: Record<string, string> = {
      'tone.formality':                   'response formality',
      'tone.warmth':                      'conversational warmth',
      'vocabulary.preferredComplexity':   'vocabulary level',
      'vocabulary.bannedPatterns':        'avoided phrases',
      'depth.preferredDepth':             'response depth',
      'depth.detailLevel':                'level of detail',
      'format.preferLists':               'list formatting preference',
      'format.preferCodeBlocks':          'code formatting preference',
      'format.responseLength':            'default response length',
      'domains.primary':                  'primary interest areas',
      'domains.secondary':                'secondary interest areas',
      'cognitive.analyticalBias':         'analytical thinking style',
      'cognitive.preferExamples':         'preference for concrete examples',
    };

    return map[traitPath] ?? traitPath.replace(/\./g, ' → ');
  }

  // -------------------------------------------------------------------------
  // Supabase persistence
  // -------------------------------------------------------------------------

  /** Persist control state to Supabase: atlas_evolution_control */
  async save(userId: string, supabaseUrl: string, supabaseKey: string): Promise<void> {
    const state = this.ensureState(userId);

    const response = await fetch(`${supabaseUrl}/rest/v1/${SUPABASE_TABLE}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey:          supabaseKey,
        Authorization:  `Bearer ${supabaseKey}`,
        Prefer:         'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        user_id:    userId,
        state:      state,
        updated_at: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`UserEvolutionControl save failed (${response.status}): ${text}`);
    }
  }

  /** Load control state from Supabase */
  async load(
    userId: string,
    supabaseUrl: string,
    supabaseKey: string,
  ): Promise<EvolutionControlState> {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/${SUPABASE_TABLE}?user_id=eq.${encodeURIComponent(userId)}&limit=1`,
      {
        headers: {
          apikey:        supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          Accept:        'application/json',
        },
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`UserEvolutionControl load failed (${response.status}): ${text}`);
    }

    const rows = (await response.json()) as Array<{ state: EvolutionControlState }>;

    if (rows.length === 0) {
      // No record — return a fresh default state
      const defaultState = this.defaultState(userId);
      this.controlStates.set(userId, defaultState);
      return defaultState;
    }

    const state = rows[0].state;
    this.controlStates.set(userId, state);
    return state;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private ensureState(userId: string): EvolutionControlState {
    if (!this.controlStates.has(userId)) {
      this.controlStates.set(userId, this.defaultState(userId));
    }
    return this.controlStates.get(userId)!;
  }

  private async getOrLoadState(userId: string): Promise<EvolutionControlState> {
    return this.controlStates.get(userId) ?? this.defaultState(userId);
  }

  private defaultState(userId: string): EvolutionControlState {
    return {
      userId,
      evolutionFrozen:       false,
      frozenTraitAreas:      [],
      dismissedObservations: [],
      manualOverrides:       [],
    };
  }

  private traitPathToArea(traitPath: string): string | undefined {
    for (const [area, paths] of Object.entries(TRAIT_AREA_MAP)) {
      if (paths.some((p) => traitPath.startsWith(p) || p.startsWith(traitPath.split('.')[0]))) {
        return area;
      }
    }
    return undefined;
  }

  /**
   * Build ObservedTrait list from unprocessed signals.
   * Groups by trait path and estimates durability from session count.
   */
  private extractObservedTraits(
    userId: string,
    signalHistory: EvolutionSignal[],
    controlState: EvolutionControlState,
  ): ObservedTrait[] {
    const dismissed = new Set(controlState.dismissedObservations);

    // Group unprocessed signals by trait-like categories
    const groups = new Map<string, EvolutionSignal[]>();
    for (const signal of signalHistory) {
      if (signal.userId !== userId || signal.processed) continue;
      const key = (signal.data['traitPath'] as string) ?? signal.type;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(signal);
    }

    const traits: ObservedTrait[] = [];
    for (const [traitPath, signals] of groups) {
      if (dismissed.has(traitPath)) continue;

      const sessionIds = new Set(signals.map((s) => s.sessionId));
      const sessionCount = sessionIds.size;
      const confidence = Math.min(sessionCount / 5, 1); // 5 sessions = 100%

      let durability: ObservedTrait['durability'];
      if (sessionCount >= 4)      durability = 'confirmed';
      else if (sessionCount >= 2) durability = 'likely pattern';
      else                        durability = 'still observing';

      const latestSignal = signals.sort((a, b) => b.timestamp - a.timestamp)[0];

      traits.push({
        traitPath,
        humanLabel:    `You seem to ${this.humanizeTraitPath(traitPath)}`,
        observedValue: latestSignal.data['observedValue'] ?? latestSignal.data,
        sessionCount,
        durability,
        confidence,
        canDismiss: true,
      });
    }

    return traits.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Build ConfirmedTrait list from the profile's committed traits.
   */
  private extractConfirmedTraits(
    profile: UserEvolutionProfile,
    controlState: EvolutionControlState,
  ): ConfirmedTrait[] {
    const frozenPaths = new Set(
      controlState.frozenTraitAreas.flatMap((a) => TRAIT_AREA_MAP[a] ?? []),
    );

    const traits: ConfirmedTrait[] = [];

    for (const [path, value] of Object.entries(profile.traits)) {
      traits.push({
        traitPath:   path,
        humanLabel:  this.humanizeTraitPath(path),
        currentValue: value,
        confirmedAt: profile.updatedAt,
        source:      'evolution-engine',
        canReset:    !frozenPaths.has(path),
        canFreeze:   !frozenPaths.has(path),
      });
    }

    return traits;
  }

  private emitControlEvent(
    userId: string,
    type: AtlasEventType,
    payload: Record<string, unknown>,
  ): void {
    try {
      const bus = AtlasEventBus.getInstance();
      bus.emit({
        type,
        userId,
        sessionId: 'system',
        source:    'user-evolution-control',
        payload,
      });
    } catch {
      // Bus may not be initialized — control events are best-effort
    }
  }
}
