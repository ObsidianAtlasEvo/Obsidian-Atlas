/**
 * evolutionEngine.ts
 *
 * Top-level orchestrator for the Obsidian Atlas autonomous evolution system.
 *
 * Lifecycle:
 *   1. Instantiated once at server startup: new EvolutionEngine(url, key)
 *   2. engine.start()   — called in Fastify's onReady hook
 *   3. engine.onInteraction(params) — called (fire-and-forget) after every chat response
 *   4. engine.stop()    — called in Fastify's onClose hook
 *
 * The engine never blocks the HTTP response path. All heavy work happens
 * asynchronously on a 30-second flush interval or on demand via forceRebuild().
 */

import type {
  AtlasAdaptationState,
  InteractionParams,
  UserEvolutionProfile,
  EvolutionSignal,
} from '../types/evolutionTypes.js';
import { EvolutionRepository } from '../db/evolutionRepository.js';
import { tryEmitEvolutionCycleCompleted } from '../governance/evolutionGovernanceEvents.js';
import { SignalCollector } from './signalCollector.js';
import { TraitExtractor } from './traitExtractor.js';
import { EvolutionMutator } from './evolutionMutator.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 5 * 60 * 1_000;
const FLUSH_INTERVAL_MS = 30_000;
const MIN_SIGNALS_FOR_EVOLUTION = 5;
const CONFIDENT_SIGNAL_THRESHOLD = 20;
const LOW_CONFIDENCE_CAP = 0.45;

// ---------------------------------------------------------------------------

interface CacheEntry {
  profile: UserEvolutionProfile;
  loadedAt: Date;
}

export class EvolutionEngine {
  private readonly repository: EvolutionRepository;
  private readonly signalCollector: SignalCollector;
  private readonly traitExtractor: TraitExtractor;
  private readonly mutator: EvolutionMutator;

  private readonly profileCache: Map<string, CacheEntry> = new Map();
  private readonly processingQueue: Set<string> = new Set();
  private readonly pendingSignals: Map<string, EvolutionSignal[]> = new Map();

  private flushInterval: NodeJS.Timeout | null = null;

  constructor(
    supabaseUrl: string,
    supabaseKey: string,
    overrides?: {
      signalCollector?: SignalCollector;
      traitExtractor?: TraitExtractor;
      mutator?: EvolutionMutator;
    },
  ) {
    this.repository = new EvolutionRepository(supabaseUrl, supabaseKey);
    this.signalCollector = overrides?.signalCollector ?? new SignalCollector();
    this.traitExtractor = overrides?.traitExtractor ?? new TraitExtractor();
    this.mutator = overrides?.mutator ?? new EvolutionMutator();
  }

  start(): void {
    if (this.flushInterval !== null) {
      console.warn('[EVOLUTION] start() called more than once — ignoring duplicate call');
      return;
    }

    this.flushInterval = setInterval(() => {
      this.flushPendingSignals().catch((err) => {
        console.error('[EVOLUTION] flush error:', err);
      });
    }, FLUSH_INTERVAL_MS);

    if (this.flushInterval.unref) {
      this.flushInterval.unref();
    }

    console.log('[EVOLUTION] Engine started — flush interval every', FLUSH_INTERVAL_MS / 1_000, 's');
  }

  stop(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    this.flushPendingSignals().catch((err) => {
      console.error('[EVOLUTION] Final flush error during stop:', err);
    });

    console.log('[EVOLUTION] Engine stopped');
  }

  /**
   * Drain the in-process SignalCollector buffer into the engine flush queue.
   */
  private drainCollectorToPending(userId: string): void {
    const fresh = this.signalCollector.getPendingSignals(userId);
    if (fresh.length === 0) return;
    this.signalCollector.markProcessed(fresh.map((s) => s.id));
    const bucket = this.pendingSignals.get(userId) ?? [];
    bucket.push(...fresh);
    this.pendingSignals.set(userId, bucket);
    console.log(
      `[EVOLUTION] Buffered ${fresh.length} signal(s) for user ${userId} (pending: ${bucket.length})`,
    );
  }

  async onInteraction(params: InteractionParams): Promise<void> {
    try {
      const { userId, sessionId, userMessage, assistantMessage } = params;
      if (userMessage.trim()) {
        this.signalCollector.captureUserMessage(userId, sessionId, userMessage);
      }
      if (assistantMessage.trim()) {
        this.signalCollector.captureAtlasResponse(userId, sessionId, assistantMessage);
      }
      this.drainCollectorToPending(userId);
    } catch (err) {
      console.error('[EVOLUTION] onInteraction error (suppressed):', err);
    }
  }

  async onSessionEnd(
    userId: string,
    sessionId: string,
    durationMs: number,
    messageCount: number,
  ): Promise<void> {
    try {
      this.signalCollector.captureSessionEnd(userId, sessionId, durationMs, messageCount);
      this.drainCollectorToPending(userId);
    } catch (err) {
      console.error('[EVOLUTION] onSessionEnd error (suppressed):', err);
    }
  }

  async getAdaptationState(userId: string): Promise<AtlasAdaptationState | null> {
    try {
      const profile = await this.loadProfile(userId);
      if (profile.totalSignalsProcessed < MIN_SIGNALS_FOR_EVOLUTION) {
        return null;
      }
      return this.mutator.buildAdaptationState(profile);
    } catch (err) {
      console.error(`[EVOLUTION] getAdaptationState error for user ${userId}:`, err);
      return null;
    }
  }

  async forceRebuild(userId: string): Promise<void> {
    console.log(`[EVOLUTION] Force rebuild requested for user ${userId}`);
    this.profileCache.delete(userId);
    await this.runEvolutionCycle(userId, { force: true });
  }

  private async flushPendingSignals(): Promise<void> {
    if (this.pendingSignals.size === 0) return;

    const snapshot = new Map(this.pendingSignals);
    this.pendingSignals.clear();

    console.log(`[EVOLUTION] Flushing signals for ${snapshot.size} user(s)`);

    const cycles = Array.from(snapshot.entries()).map(async ([userId, signals]) => {
      try {
        await this.repository.saveSignals(signals);
      } catch (err) {
        console.error(`[EVOLUTION] Failed to persist signals for user ${userId}:`, err);
        const existing = this.pendingSignals.get(userId) ?? [];
        this.pendingSignals.set(userId, [...signals, ...existing]);
        return;
      }

      await this.runEvolutionCycle(userId);
    });

    await Promise.allSettled(cycles);
  }

  private async runEvolutionCycle(
    userId: string,
    options?: { force?: boolean },
  ): Promise<void> {
    if (this.processingQueue.has(userId) && !options?.force) {
      console.log(`[EVOLUTION] Cycle already in progress for user ${userId} — skipping`);
      return;
    }

    this.processingQueue.add(userId);
    const startMs = Date.now();

    try {
      const profile = await this.loadProfile(userId);
      const signals = await this.repository.getPendingSignals(userId);
      const totalSignals = profile.totalSignalsProcessed + signals.length;

      if (totalSignals < MIN_SIGNALS_FOR_EVOLUTION) {
        console.log(
          `[EVOLUTION] Skipping cycle for user ${userId}` +
            ` — only ${totalSignals} signal(s) (need ≥${MIN_SIGNALS_FOR_EVOLUTION})`,
        );
        if (signals.length > 0) {
          await this.repository.markSignalsProcessed(signals.map((s) => s.id));
        }
        return;
      }

      let updatedProfile = await this.traitExtractor.extractAndUpdate(profile, signals);

      if (totalSignals < CONFIDENT_SIGNAL_THRESHOLD) {
        updatedProfile.archetypeConfidence = Math.min(
          updatedProfile.archetypeConfidence,
          LOW_CONFIDENCE_CAP,
        );
      }

      await this.saveProfile(updatedProfile);

      if (signals.length > 0) {
        await this.repository.markSignalsProcessed(signals.map((s) => s.id));
      }

      this.profileCache.set(userId, {
        profile: updatedProfile,
        loadedAt: new Date(),
      });

      const elapsedMs = Date.now() - startMs;
      console.log(
        `[EVOLUTION] Cycle complete for user ${userId}` +
          ` — v${updatedProfile.profileVersion}` +
          ` | confidence ${updatedProfile.archetypeConfidence.toFixed(2)}` +
          ` | ${signals.length} signal(s) processed` +
          ` | ${elapsedMs}ms`,
      );
      tryEmitEvolutionCycleCompleted(userId, signals.length, elapsedMs);
    } catch (err) {
      console.error(`[EVOLUTION] Cycle failed for user ${userId}:`, err);
    } finally {
      this.processingQueue.delete(userId);
    }
  }

  private async loadProfile(userId: string): Promise<UserEvolutionProfile> {
    const cached = this.profileCache.get(userId);

    if (cached) {
      const ageMs = Date.now() - cached.loadedAt.getTime();
      if (ageMs < CACHE_TTL_MS) {
        return cached.profile;
      }
      this.profileCache.delete(userId);
    }

    let profile = await this.repository.getProfile(userId);

    if (!profile) {
      profile = createBlankProfile(userId);
      await this.repository.upsertProfile(profile);
      console.log(`[EVOLUTION] Created new profile for user ${userId}`);
    }

    this.profileCache.set(userId, {
      profile,
      loadedAt: new Date(),
    });

    return profile;
  }

  private async saveProfile(profile: UserEvolutionProfile): Promise<void> {
    await this.repository.upsertProfile(profile);

    this.profileCache.set(profile.userId, {
      profile,
      loadedAt: new Date(),
    });
  }
}

function createBlankProfile(userId: string): UserEvolutionProfile {
  const now = Date.now();
  return {
    userId,
    archetype: 'unknown',
    archetypeConfidence: 0,
    profileVersion: 0,
    lastUpdated: now,
    firstContact: now,
    totalInteractions: 0,
    totalSignalsProcessed: 0,
    cognitiveRadar: {
      formality: 0.5,
      directness: 0.5,
      philosophicalBias: 0.5,
      abstractTolerance: 0.5,
      depthPreference: 0.5,
      vocabularyLevel: 0.5,
    },
    cognitiveStyle: {
      systemsThinker: false,
      firstPrinciplesReasoner: false,
      analogicalThinker: false,
      sovereignCommunicator: false,
      socraticDisposition: false,
      patternRecognizer: false,
      convergentThinker: false,
      divergentThinker: false,
    },
    domainInterests: [],
    communicationProfile: {
      vocabularyLevel: 5,
      formality: 0.5,
      directness: 0.5,
      warmth: 0.5,
      seriousness: 0.5,
      preferredFormat: 'prose',
      preferredDepth: 'moderate',
    },
    activeMutations: [],
    bannedPatterns: [],
    preferredOpenings: [],
    customInstructionsExcerpt: '',
    correctionLog: [],
    generatedTagline: '',
    archetypeDescription: '',
  };
}
