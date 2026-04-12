// ─── Atlas Crucible — Zustand Store ──────────────────────────────────────────
// All Crucible session state, actions, and IndexedDB persistence.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import {
  crucibleEngine,
  type CrucibleSession,
  type CrucibleDomain,
  type CrucibleRound,
  type ClosingAnalysis,
} from '../lib/crucibleEngine';

// ── IndexedDB helpers ─────────────────────────────────────────────────────────

const IDB_NAME = 'atlas_crucible_db';
const IDB_VERSION = 1;
const IDB_STORE = 'sessions';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        const store = db.createObjectStore(IDB_STORE, { keyPath: 'id' });
        store.createIndex('startedAt', 'startedAt', { unique: false });
        store.createIndex('status', 'status', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(session: CrucibleSession): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(session);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGetAll(): Promise<CrucibleSession[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).getAll();
    req.onsuccess = () =>
      resolve(
        ((req.result as CrucibleSession[]) ?? []).sort(
          (a, b) => b.startedAt - a.startedAt
        )
      );
    req.onerror = () => reject(req.error);
  });
}

// ── ID generator ──────────────────────────────────────────────────────────────

function generateId(): string {
  return `crucible_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ── Validation ────────────────────────────────────────────────────────────────

const MIN_ARGUMENT_LENGTH = 50;

function validateArgument(text: string): string | null {
  if (!text || text.trim().length < MIN_ARGUMENT_LENGTH) {
    return `Develop your argument. A single sentence is not a position. (Minimum ${MIN_ARGUMENT_LENGTH} characters.)`;
  }
  return null;
}

// ── Store types ───────────────────────────────────────────────────────────────

export type CruciblePhase = 'entry' | 'debate' | 'analysis';

export interface CrucibleState {
  // ── UI State ────────────────────────────────────────────────────────────
  phase: CruciblePhase;
  currentInput: string;
  currentThesis: string;
  selectedDomain: CrucibleDomain | null;
  thesisMode: 'user' | 'atlas_generated' | null;

  // ── Session ─────────────────────────────────────────────────────────────
  session: CrucibleSession | null;

  // ── Loading / async state ────────────────────────────────────────────────
  isAtlasThinking: boolean;
  generatingTopic: boolean;
  generatingAnalysis: boolean;
  pendingClarification: boolean;

  // ── Error state ──────────────────────────────────────────────────────────
  error: string | null;

  // ── History ──────────────────────────────────────────────────────────────
  sessionHistory: CrucibleSession[];
  historyLoaded: boolean;
}

export interface CrucibleActions {
  // ── Session lifecycle ────────────────────────────────────────────────────
  startSession(
    thesis: string,
    domain: CrucibleDomain,
    source: 'user' | 'atlas_generated'
  ): void;
  requestTopic(domain: CrucibleDomain): Promise<void>;
  submitArgument(text: string): Promise<void>;
  requestClarification(): Promise<void>;
  concede(): Promise<void>;
  endSession(): Promise<void>;
  resetCrucible(): void;

  // ── Persistence ──────────────────────────────────────────────────────────
  saveSession(): Promise<void>;
  loadSessionHistory(): Promise<void>;

  // ── UI setters ───────────────────────────────────────────────────────────
  setCurrentInput(text: string): void;
  setCurrentThesis(text: string): void;
  setSelectedDomain(domain: CrucibleDomain | null): void;
  setThesisMode(mode: 'user' | 'atlas_generated' | null): void;
  clearError(): void;
}

export type CrucibleStore = CrucibleState & CrucibleActions;

// ── Initial state ─────────────────────────────────────────────────────────────

const initialState: CrucibleState = {
  phase: 'entry',
  currentInput: '',
  currentThesis: '',
  selectedDomain: null,
  thesisMode: null,
  session: null,
  isAtlasThinking: false,
  generatingTopic: false,
  generatingAnalysis: false,
  pendingClarification: false,
  error: null,
  sessionHistory: [],
  historyLoaded: false,
};

// ── Store ─────────────────────────────────────────────────────────────────────

export const useCrucibleStore = create<CrucibleStore>()(
  immer((set, get) => ({
    ...initialState,

    // ── startSession ────────────────────────────────────────────────────────
    startSession(
      thesis: string,
      domain: CrucibleDomain,
      source: 'user' | 'atlas_generated'
    ) {
      if (!thesis.trim()) {
        set((s) => { s.error = 'A thesis is required to enter the Crucible.'; });
        return;
      }

      const session: CrucibleSession = {
        id: generateId(),
        userId: 'local',
        thesis: thesis.trim(),
        thesisSource: source,
        domain,
        startedAt: Date.now(),
        rounds: [],
        verdictScore: 0.5,
        status: 'active',
      };

      set((s) => {
        s.session = session;
        s.phase = 'debate';
        s.error = null;
        s.currentInput = '';
      });
    },

    // ── requestTopic ────────────────────────────────────────────────────────
    async requestTopic(domain: CrucibleDomain) {
      const state = get();
      if (state.generatingTopic) return;

      const existing = state.sessionHistory.map((s) => s.thesis);

      set((s) => {
        s.generatingTopic = true;
        s.selectedDomain = domain;
        s.thesisMode = 'atlas_generated';
        s.error = null;
      });

      try {
        const topic = await crucibleEngine.generateTopic(domain, existing);
        set((s) => {
          s.currentThesis = topic;
          s.generatingTopic = false;
        });
      } catch (err) {
        set((s) => {
          s.error = `Failed to generate topic: ${String(err)}`;
          s.generatingTopic = false;
        });
      }
    },

    // ── submitArgument ───────────────────────────────────────────────────────
    async submitArgument(text: string) {
      const state = get();

      if (state.isAtlasThinking) return;

      const validationError = validateArgument(text);
      if (validationError) {
        set((s) => { s.error = validationError; });
        return;
      }

      const session = state.session;
      if (!session || session.status !== 'active') {
        set((s) => { s.error = 'No active session.'; });
        return;
      }

      set((s) => {
        s.isAtlasThinking = true;
        s.error = null;
        s.currentInput = '';
      });

      try {
        const atlasResponse = await crucibleEngine.generateCrucibleResponse(session, text);

        const updatedSession: CrucibleSession = {
          ...session,
          rounds: [
            ...session.rounds,
            {
              roundNumber: session.rounds.length + 1,
              userArgument: text,
              atlasResponse,
              verdictDelta: atlasResponse.verdictDelta,
              timestamp: Date.now(),
            } satisfies CrucibleRound,
          ],
          verdictScore: Math.max(
            0,
            Math.min(1, session.verdictScore + atlasResponse.verdictDelta)
          ),
        };

        // After round 10, auto-complete
        const shouldComplete = updatedSession.rounds.length >= 10;
        if (shouldComplete) {
          updatedSession.status = 'completed';
        }

        set((s) => {
          s.session = updatedSession;
          s.isAtlasThinking = false;
        });

        // Auto-persist
        await get().saveSession();

        // Auto-trigger analysis at round 10
        if (shouldComplete) {
          await get().endSession();
        }
      } catch (err) {
        set((s) => {
          s.isAtlasThinking = false;
          s.error = `Atlas encountered an error: ${String(err)}`;
        });
      }
    },

    // ── requestClarification ────────────────────────────────────────────────
    async requestClarification() {
      const state = get();
      const session = state.session;

      if (!session || session.rounds.length === 0 || state.pendingClarification) return;

      const lastRound = session.rounds[session.rounds.length - 1];

      set((s) => {
        s.pendingClarification = true;
        s.error = null;
      });

      try {
        const clarificationPrompt =
          `You just gave this counter-argument in the Crucible:\n\n"${lastRound.atlasResponse.counterArgument}"\n\n` +
          `The user has requested clarification. In 2-3 sentences, clarify the core point of your counter without changing your position. ` +
          `Do not soften it. Do not add new arguments. Clarify only.`;

        const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
          { role: 'system', content: clarificationPrompt },
          { role: 'user', content: 'Clarify your counter-argument.' },
        ];

        // Use the same API path as the engine (direct fetch)
        const endpoint =
          (typeof window !== 'undefined' && (window as any).__ATLAS_API_URL__) ||
          '/api/chat';

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages, temperature: 0.4, max_tokens: 300 }),
        });

        const data = await res.json();
        const clarification =
          data?.choices?.[0]?.message?.content ??
          data?.content ??
          data?.text ??
          data?.response ??
          'Clarification unavailable.';

        // Append clarification to the last round's counter argument
        const updatedRounds = session.rounds.map((r, i) =>
          i === session.rounds.length - 1
            ? {
                ...r,
                atlasResponse: {
                  ...r.atlasResponse,
                  counterArgument:
                    r.atlasResponse.counterArgument +
                    `\n\n[CLARIFICATION]: ${clarification}`,
                },
              }
            : r
        );

        set((s) => {
          if (s.session) {
            s.session.rounds = updatedRounds;
          }
          s.pendingClarification = false;
        });
      } catch (err) {
        set((s) => {
          s.pendingClarification = false;
          s.error = `Clarification failed: ${String(err)}`;
        });
      }
    },

    // ── concede ──────────────────────────────────────────────────────────────
    async concede() {
      const state = get();
      const session = state.session;
      if (!session || session.status !== 'active') return;

      set((s) => {
        if (s.session) {
          s.session.status = 'conceded';
          s.session.endedAt = Date.now();
        }
        s.generatingAnalysis = true;
        s.error = null;
      });

      try {
        const updatedSession = get().session!;
        const analysis = await crucibleEngine.generateClosingAnalysis(updatedSession);

        set((s) => {
          if (s.session) {
            s.session.closingAnalysis = analysis;
          }
          s.generatingAnalysis = false;
          s.phase = 'analysis';
        });

        await get().saveSession();
      } catch (err) {
        set((s) => {
          s.generatingAnalysis = false;
          s.error = `Analysis generation failed: ${String(err)}`;
          s.phase = 'analysis'; // Still move to analysis even if generation fails
        });
      }
    },

    // ── endSession ───────────────────────────────────────────────────────────
    async endSession() {
      const state = get();
      const session = state.session;
      if (!session) return;

      if (session.status === 'active') {
        set((s) => {
          if (s.session) {
            s.session.status = 'completed';
            s.session.endedAt = Date.now();
          }
          s.generatingAnalysis = true;
          s.error = null;
        });
      }

      try {
        const updatedSession = get().session!;
        const analysis = await crucibleEngine.generateClosingAnalysis(updatedSession);

        set((s) => {
          if (s.session) {
            s.session.closingAnalysis = analysis;
          }
          s.generatingAnalysis = false;
          s.phase = 'analysis';
        });

        await get().saveSession();
      } catch (err) {
        set((s) => {
          s.generatingAnalysis = false;
          s.error = `Analysis generation failed: ${String(err)}`;
          s.phase = 'analysis';
        });
      }
    },

    // ── resetCrucible ────────────────────────────────────────────────────────
    resetCrucible() {
      set((s) => {
        s.phase = 'entry';
        s.session = null;
        s.currentInput = '';
        s.currentThesis = '';
        s.selectedDomain = null;
        s.thesisMode = null;
        s.isAtlasThinking = false;
        s.generatingTopic = false;
        s.generatingAnalysis = false;
        s.pendingClarification = false;
        s.error = null;
      });
    },

    // ── saveSession ──────────────────────────────────────────────────────────
    async saveSession() {
      const session = get().session;
      if (!session) return;

      try {
        await idbPut(session);

        // Update local history cache
        set((s) => {
          const idx = s.sessionHistory.findIndex((h) => h.id === session.id);
          if (idx >= 0) {
            s.sessionHistory[idx] = session;
          } else {
            s.sessionHistory.unshift(session);
          }
        });
      } catch (err) {
        // Non-fatal — session continues in memory
        console.warn('[Crucible] Failed to persist session to IDB:', err);
      }
    },

    // ── loadSessionHistory ───────────────────────────────────────────────────
    async loadSessionHistory() {
      if (get().historyLoaded) return;

      try {
        const sessions = await idbGetAll();
        set((s) => {
          s.sessionHistory = sessions;
          s.historyLoaded = true;
        });
      } catch (err) {
        console.warn('[Crucible] Failed to load session history from IDB:', err);
        set((s) => {
          s.historyLoaded = true; // Don't retry on every render
        });
      }
    },

    // ── UI setters ───────────────────────────────────────────────────────────
    setCurrentInput(text: string) {
      set((s) => { s.currentInput = text; });
    },

    setCurrentThesis(text: string) {
      set((s) => {
        s.currentThesis = text;
        s.thesisMode = 'user';
      });
    },

    setSelectedDomain(domain: CrucibleDomain | null) {
      set((s) => { s.selectedDomain = domain; });
    },

    setThesisMode(mode: 'user' | 'atlas_generated' | null) {
      set((s) => { s.thesisMode = mode; });
    },

    clearError() {
      set((s) => { s.error = null; });
    },
  }))
);

// ── Derived selectors (exported for convenience) ───────────────────────────────

export const selectRoundCount = (s: CrucibleStore) => s.session?.rounds.length ?? 0;
export const selectVerdictScore = (s: CrucibleStore) => s.session?.verdictScore ?? 0.5;
export const selectCanSubmit = (s: CrucibleStore) =>
  !s.isAtlasThinking &&
  s.currentInput.trim().length >= 50 &&
  s.session?.status === 'active';
export const selectCanEnter = (s: CrucibleStore) =>
  s.currentThesis.trim().length > 0 && !s.generatingTopic;
export const selectLastRound = (s: CrucibleStore) =>
  s.session?.rounds[s.session.rounds.length - 1] ?? null;
export const selectArgumentCount = (s: CrucibleStore) =>
  s.session?.rounds.length ?? 0;
export const selectWeaknessCount = (s: CrucibleStore) =>
  s.session?.rounds.reduce(
    (acc, r) => acc + (r.atlasResponse.weaknesses?.length ?? 0),
    0
  ) ?? 0;
export const selectConcessionCount = (s: CrucibleStore) =>
  s.session?.rounds.filter((r) => r.verdictDelta > 0.05).length ?? 0;
