/**
 * Atlas global store — Zustand.
 *
 * All application state lives here. Persistence to IndexedDB is handled
 * via explicit save calls; we do NOT use auto-persist middleware to keep
 * full control over what gets written and when.
 *
 * Pattern:
 *   set(state => ({ ...state, field: newValue }))
 *   For nested updates, use the spread-merge pattern consistently.
 */

import { create } from 'zustand';
import { defaultAppState } from './defaults';
import { loadUserProfile, saveUserProfile, loadJournal, saveJournalEntry,
         deleteJournalEntry, loadDecisions, saveDecision, deleteDecision,
         loadDoctrine, saveDoctrine, deleteDoctrine, loadDirectives,
         saveDirective, deleteDirective, upsertUserProfile, generateId, nowISO } from '../lib/persistence';
import { auth, onAuthStateChanged } from 'firebase/auth';

import type {
  AppState,
  UserProfile,
  JournalEntry,
  Decision,
  PersonalDoctrine,
  Directive,
  PulseItem,
  MemoryEntry,
  AdaptivePosture,
  UserQuestion,
  PersonalConstitution,
  ConstitutionValue,
  ConstitutionGoal,
  ConstitutionStandard,
  ConstitutionMotive,
  ConstitutionTension,
  CrucibleSession,
  CrucibleExchange,
  MirrorforgeModel,
  RealityEngineModel,
  ResonanceState,
  AnswerDepthTier,
} from '@/types';
import type {
  ResonanceProfile,
  ResonanceObservation,
  ResonanceGraphNode,
  ResonanceGraphEdge,
} from '@/resonance/types';

// ── Action Types ──────────────────────────────────────────────────────────

export interface AtlasActions {
  // Navigation
  setActiveMode: (mode: AppState['activeMode']) => void;
  setSessionIntent: (intent: AppState['sessionIntent']) => void;

  // Auth
  hydrateAuth: () => void;
  setCurrentUser: (profile: UserProfile | null) => void;
  setAuthReady: (ready: boolean) => void;

  // UI State
  setSearchOpen: (open: boolean) => void;
  setSelectedEntity: (id: string | null) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;

  // Posture
  setPosture: (partial: Partial<AdaptivePosture>) => void;
  setDepth: (depth: AnswerDepthTier) => void;

  // Journal
  loadJournalEntries: () => Promise<void>;
  addJournalEntry: (entry: Omit<JournalEntry, 'id'>) => Promise<JournalEntry>;
  updateJournalEntry: (id: string, partial: Partial<JournalEntry>) => Promise<void>;
  removeJournalEntry: (id: string) => Promise<void>;
  pinJournalEntry: (id: string, pinned: boolean) => Promise<void>;

  // Decisions
  loadDecisions: () => Promise<void>;
  addDecision: (decision: Omit<Decision, 'id' | 'createdAt'>) => Promise<Decision>;
  updateDecision: (id: string, partial: Partial<Decision>) => Promise<void>;
  removeDecision: (id: string) => Promise<void>;

  // Doctrine
  loadDoctrine: () => Promise<void>;
  addDoctrineItem: (item: Omit<PersonalDoctrine, 'id'>) => Promise<PersonalDoctrine>;
  updateDoctrineItem: (id: string, partial: Partial<PersonalDoctrine>) => Promise<void>;
  removeDoctrineItem: (id: string) => Promise<void>;

  // Directives
  loadDirectives: () => Promise<void>;
  addDirective: (directive: Omit<Directive, 'id' | 'timestamp'>) => Promise<Directive>;
  updateDirective: (id: string, partial: Partial<Directive>) => Promise<void>;
  removeDirective: (id: string) => Promise<void>;
  toggleDirective: (id: string) => Promise<void>;

  // Questions / Chat history
  addQuestion: (question: UserQuestion) => void;
  updateQuestion: (id: string, partial: Partial<UserQuestion>) => void;
  clearQuestions: () => void;

  // Memory
  addMemoryEntry: (entry: Omit<MemoryEntry, 'id'>) => void;
  promoteMemoryEntry: (id: string, to: MemoryEntry['layer']) => void;
  removeMemoryEntry: (id: string) => void;

  // Constitution
  updateConstitution: (partial: Partial<PersonalConstitution>) => void;
  addConstitutionValue: (value: Omit<ConstitutionValue, 'id'>) => void;
  removeConstitutionValue: (id: string) => void;
  updateConstitutionValue: (id: string, partial: Partial<ConstitutionValue>) => void;
  addConstitutionGoal: (goal: Omit<ConstitutionGoal, 'id'>) => void;
  removeConstitutionGoal: (id: string) => void;
  updateConstitutionGoal: (id: string, partial: Partial<ConstitutionGoal>) => void;
  addConstitutionStandard: (standard: Omit<ConstitutionStandard, 'id'>) => void;
  removeConstitutionStandard: (id: string) => void;
  addConstitutionMotive: (motive: Omit<ConstitutionMotive, 'id'>) => void;
  removeConstitutionMotive: (id: string) => void;
  addConstitutionTension: (tension: Omit<ConstitutionTension, 'id'>) => void;
  removeConstitutionTension: (id: string) => void;
  updateConstitutionTension: (id: string, partial: Partial<ConstitutionTension>) => void;

  // Crucible
  activeCrucibleSession: CrucibleSession | null;
  startCrucibleSession: (session: Omit<CrucibleSession, 'id' | 'startTime' | 'exchanges'>) => CrucibleSession;
  addCrucibleExchange: (exchange: Omit<CrucibleExchange, 'id' | 'timestamp'>) => void;
  endCrucibleSession: (findings?: CrucibleSession['findings'], reconstruction?: CrucibleSession['reconstruction']) => void;
  clearCrucibleSession: () => void;

  // MirrorForge
  updateMirrorforge: (partial: Partial<MirrorforgeModel>) => void;
  addMirrorforgePattern: (pattern: Omit<MirrorforgeModel['patternLedger'][0], 'id'>) => void;
  removeMirrorforgePattern: (id: string) => void;
  updateMirrorforgeCurrentRead: (read: Partial<MirrorforgeModel['currentRead']>) => void;

  // Reality Engine
  updateRealityEngine: (partial: Partial<RealityEngineModel>) => void;
  addSystemNode: (node: Omit<RealityEngineModel['systemNodes'][0], 'id'>) => void;
  removeSystemNode: (id: string) => void;
  updateSystemNode: (id: string, partial: Partial<RealityEngineModel['systemNodes'][0]>) => void;
  addNodeConnection: (nodeId: string, connection: RealityEngineModel['systemNodes'][0]['connections'][0]) => void;
  removeNodeConnection: (nodeId: string, targetId: string) => void;

  // Resonance
  updateResonance: (partial: Partial<ResonanceState>) => void;
  toggleResonanceLearning: () => void;
  setResonanceMode: (mode: ResonanceState['activeMode']) => void;
  addResonanceProfile: (profile: Omit<ResonanceProfile, 'id'>) => void;
  addResonanceObservation: (obs: Omit<ResonanceObservation, 'id'>) => void;
  addResonanceGraphNode: (node: Omit<ResonanceGraphNode, 'id'>) => void;
  removeResonanceGraphNode: (id: string) => void;
  addResonanceGraphEdge: (edge: ResonanceGraphEdge) => void;
  removeResonanceGraphEdge: (source: string, target: string) => void;

  // Pulse
  addPulseItem: (item: Omit<PulseItem, 'id'>) => void;
  removePulseItem: (id: string) => void;

  // Creator console
  setCreatorConsoleState: (state: AppState['creatorConsoleState']) => void;
  setSettingsOpen: (open: boolean) => void;

  // Bulk load after auth
  hydrateUserData: (uid: string) => Promise<void>;
}

export type AtlasStore = AppState & AtlasActions;

// ── Store ─────────────────────────────────────────────────────────────────

export const useAtlasStore = create<AtlasStore>((set, get) => ({
  ...defaultAppState,

  // ── Navigation ───────────────────────────────────────────────────────

  setActiveMode: (mode) => set({ activeMode: mode }),

  setSessionIntent: (intent) => set({ sessionIntent: intent }),

  // ── Auth ─────────────────────────────────────────────────────────────

  hydrateAuth: () => {
    onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        set({ currentUser: undefined, isAuthReady: true, activeMode: 'auth' });
        return;
      }

      // Build minimal profile from auth state first (instant)
      const minimalProfile: UserProfile = {
        uid: firebaseUser.uid,
        email: firebaseUser.email ?? '',
        emailVerified: firebaseUser.emailVerified,
        role: firebaseUser.email === 'crowleyrc62@gmail.com' ? 'sovereign_creator' : 'registered_user',
        createdAt: nowISO(),
        securitySettings: { mfaEnabled: false, passkeyEnabled: false },
        privacySettings: { dataMinimization: true, memorySovereignty: true },
      };

      set({ currentUser: minimalProfile, isAuthReady: true });

      // Then hydrate full profile + data from IDB
      await get().hydrateUserData(firebaseUser.uid);
    });
  },

  setCurrentUser: (profile) => set({ currentUser: profile ?? undefined }),

  setAuthReady: (ready) => set({ isAuthReady: ready }),

  // ── Hydrate all user data after auth ─────────────────────────────────

  hydrateUserData: async (uid) => {
    try {
      // Load user profile (contains constitution, workspace snapshot, etc.)
      const profile = await loadUserProfile(uid);
      if (profile) {
        // Restore workspace snapshot if present
        const ws = profile.atlasWorkspace;
        if (ws) {
          set({
            currentUser: profile,
            journal: ws.journal ?? [],
            decisions: ws.decisions ?? [],
            directives: ws.directives ?? [],
            pulse: ws.pulse ?? { lastUpdate: nowISO(), items: [] },
            activePosture: ws.activePosture ?? get().activePosture,
            ...(get().userModel.doctrine.length === 0 && ws.personalDoctrine
              ? {
                  userModel: {
                    ...get().userModel,
                    doctrine: ws.personalDoctrine,
                  },
                }
              : {}),
            // Restore active chamber
            ...(ws.activeMode ? { activeMode: ws.activeMode } : {}),
          });
        } else {
          set({ currentUser: profile });
        }
      }

      // Load from individual collections (more up-to-date than snapshot)
      const [journal, decisions, doctrine, directives] = await Promise.all([
        loadJournal(uid).catch(() => [] as JournalEntry[]),
        loadDecisions(uid).catch(() => [] as Decision[]),
        loadDoctrine(uid).catch(() => [] as PersonalDoctrine[]),
        loadDirectives(uid).catch(() => [] as Directive[]),
      ]);

      set((state) => ({
        journal: journal.length > 0 ? journal : state.journal,
        decisions: decisions.length > 0 ? decisions : state.decisions,
        directives: directives.length > 0 ? directives : state.directives,
        userModel: {
          ...state.userModel,
          doctrine: doctrine.length > 0 ? doctrine : state.userModel.doctrine,
        },
      }));

      // Navigate away from auth screen
      const current = get().activeMode;
      if (current === 'auth' || current === 'onboarding') {
        set({ activeMode: 'atlas' });
      }
    } catch (err) {
      console.error('[Atlas] hydrateUserData error:', err);
    }
  },

  // ── UI State ─────────────────────────────────────────────────────────

  setSearchOpen: (open) => set({ isSearchOpen: open }),

  setSelectedEntity: (id) => set({ selectedEntityId: id }),

  setSidebarCollapsed: (collapsed) =>
    set((state) => ({
      uiConfig: { ...state.uiConfig, sidebarCollapsed: collapsed },
    })),

  // ── Posture ───────────────────────────────────────────────────────────

  setPosture: (partial) =>
    set((state) => ({
      activePosture: { ...state.activePosture, ...partial },
    })),

  setDepth: (depth) =>
    set((state) => ({
      activePosture: { ...state.activePosture, depth },
    })),

  // ── Journal ───────────────────────────────────────────────────────────

  loadJournalEntries: async () => {
    const uid = get().currentUser?.uid;
    if (!uid) return;
    const entries = await loadJournal(uid).catch(() => [] as JournalEntry[]);
    if (entries.length > 0) set({ journal: entries });
  },

  addJournalEntry: async (entryData) => {
    const uid = get().currentUser?.uid;
    const entry: JournalEntry = {
      ...entryData,
      id: generateId(),
    };
    set((state) => ({ journal: [entry, ...state.journal] }));
    if (uid) await saveJournalEntry(uid, entry).catch(console.error);
    return entry;
  },

  updateJournalEntry: async (id, partial) => {
    const uid = get().currentUser?.uid;
    set((state) => ({
      journal: state.journal.map((e) =>
        e.id === id ? { ...e, ...partial } : e
      ),
    }));
    if (uid) {
      const updated = get().journal.find((e) => e.id === id);
      if (updated) await saveJournalEntry(uid, updated).catch(console.error);
    }
  },

  removeJournalEntry: async (id) => {
    const uid = get().currentUser?.uid;
    set((state) => ({ journal: state.journal.filter((e) => e.id !== id) }));
    if (uid) await deleteJournalEntry(uid, id).catch(console.error);
  },

  pinJournalEntry: async (id, pinned) => {
    await get().updateJournalEntry(id, { isPinned: pinned });
  },

  // ── Decisions ─────────────────────────────────────────────────────────

  loadDecisions: async () => {
    const uid = get().currentUser?.uid;
    if (!uid) return;
    const items = await loadDecisions(uid).catch(() => [] as Decision[]);
    if (items.length > 0) set({ decisions: items });
  },

  addDecision: async (data) => {
    const uid = get().currentUser?.uid;
    const decision: Decision = {
      ...data,
      id: generateId(),
      createdAt: nowISO(),
    } as Decision;
    set((state) => ({ decisions: [decision, ...state.decisions] }));
    if (uid) await saveDecision(uid, decision).catch(console.error);
    return decision;
  },

  updateDecision: async (id, partial) => {
    const uid = get().currentUser?.uid;
    set((state) => ({
      decisions: state.decisions.map((d) =>
        d.id === id ? { ...d, ...partial } : d
      ),
    }));
    if (uid) {
      const updated = get().decisions.find((d) => d.id === id);
      if (updated) await saveDecision(uid, updated).catch(console.error);
    }
  },

  removeDecision: async (id) => {
    const uid = get().currentUser?.uid;
    set((state) => ({ decisions: state.decisions.filter((d) => d.id !== id) }));
    if (uid) await deleteDecision(uid, id).catch(console.error);
  },

  // ── Doctrine ──────────────────────────────────────────────────────────

  loadDoctrine: async () => {
    const uid = get().currentUser?.uid;
    if (!uid) return;
    const items = await loadDoctrine(uid).catch(() => [] as PersonalDoctrine[]);
    if (items.length > 0) {
      set((state) => ({
        userModel: { ...state.userModel, doctrine: items },
      }));
    }
  },

  addDoctrineItem: async (data) => {
    const uid = get().currentUser?.uid;
    const item: PersonalDoctrine = { ...data, id: generateId() } as PersonalDoctrine;
    set((state) => ({
      userModel: {
        ...state.userModel,
        doctrine: [item, ...state.userModel.doctrine],
      },
    }));
    if (uid) await saveDoctrine(uid, item).catch(console.error);
    return item;
  },

  updateDoctrineItem: async (id, partial) => {
    const uid = get().currentUser?.uid;
    set((state) => ({
      userModel: {
        ...state.userModel,
        doctrine: state.userModel.doctrine.map((d) =>
          d.id === id ? { ...d, ...partial } : d
        ),
      },
    }));
    if (uid) {
      const updated = get().userModel.doctrine.find((d) => d.id === id);
      if (updated) await saveDoctrine(uid, updated).catch(console.error);
    }
  },

  removeDoctrineItem: async (id) => {
    const uid = get().currentUser?.uid;
    set((state) => ({
      userModel: {
        ...state.userModel,
        doctrine: state.userModel.doctrine.filter((d) => d.id !== id),
      },
    }));
    if (uid) await deleteDoctrine(uid, id).catch(console.error);
  },

  // ── Directives ────────────────────────────────────────────────────────

  loadDirectives: async () => {
    const uid = get().currentUser?.uid;
    if (!uid) return;
    const items = await loadDirectives(uid).catch(() => [] as Directive[]);
    if (items.length > 0) set({ directives: items });
  },

  addDirective: async (data) => {
    const uid = get().currentUser?.uid;
    const directive: Directive = {
      ...data,
      id: generateId(),
      timestamp: nowISO(),
    } as Directive;
    set((state) => ({ directives: [directive, ...state.directives] }));
    if (uid) await saveDirective(uid, directive).catch(console.error);
    return directive;
  },

  updateDirective: async (id, partial) => {
    const uid = get().currentUser?.uid;
    set((state) => ({
      directives: state.directives.map((d) =>
        d.id === id ? { ...d, ...partial } : d
      ),
    }));
    if (uid) {
      const updated = get().directives.find((d) => d.id === id);
      if (updated) await saveDirective(uid, updated).catch(console.error);
    }
  },

  removeDirective: async (id) => {
    const uid = get().currentUser?.uid;
    set((state) => ({ directives: state.directives.filter((d) => d.id !== id) }));
    if (uid) await deleteDirective(uid, id).catch(console.error);
  },

  toggleDirective: async (id) => {
    const directive = get().directives.find((d) => d.id === id);
    if (!directive) return;
    await get().updateDirective(id, { isActive: !directive.isActive });
  },

  // ── Questions ─────────────────────────────────────────────────────────

  addQuestion: (question) =>
    set((state) => ({
      recentQuestions: [question, ...state.recentQuestions].slice(0, 100),
    })),

  updateQuestion: (id, partial) =>
    set((state) => ({
      recentQuestions: state.recentQuestions.map((q) =>
        q.id === id ? { ...q, ...partial } : q
      ),
    })),

  clearQuestions: () => set({ recentQuestions: [] }),

  // ── Memory ────────────────────────────────────────────────────────────

  addMemoryEntry: (data) => {
    const entry: MemoryEntry = { ...data, id: generateId() };
    set((state) => ({
      memoryArchitecture: {
        ...state.memoryArchitecture,
        [entry.layer]: [entry, ...state.memoryArchitecture[entry.layer]].slice(
          0,
          entry.layer === 'sovereign' ? 200 : entry.layer === 'working' ? 50 : 100
        ),
      },
    }));
  },

  promoteMemoryEntry: (id, to) =>
    set((state) => {
      let found: MemoryEntry | undefined;
      const layers = ['transient', 'working', 'sovereign'] as const;
      const next = { ...state.memoryArchitecture };
      for (const l of layers) {
        const idx = next[l].findIndex((m) => m.id === id);
        if (idx !== -1) {
          found = { ...next[l][idx], layer: to };
          next[l] = next[l].filter((_, i) => i !== idx);
          break;
        }
      }
      if (!found) return {};
      return {
        memoryArchitecture: {
          ...next,
          [to]: [found, ...next[to]],
        },
      };
    }),

  removeMemoryEntry: (id) =>
    set((state) => {
      const layers = ['transient', 'working', 'sovereign'] as const;
      const next = { ...state.memoryArchitecture };
      for (const l of layers) {
        next[l] = next[l].filter((m) => m.id !== id);
      }
      return { memoryArchitecture: next };
    }),

  // ── Constitution ──────────────────────────────────────────────────────

  updateConstitution: (partial) =>
    set((state) => ({
      constitution: { ...state.constitution, ...partial },
    })),

  addConstitutionValue: (data) => {
    const value: ConstitutionValue = { ...data, id: generateId() };
    set((state) => ({
      constitution: {
        ...state.constitution,
        values: [...state.constitution.values, value],
      },
    }));
  },

  addConstitutionGoal: (data) => {
    const goal: ConstitutionGoal = { ...data, id: generateId() };
    set((state) => ({
      constitution: {
        ...state.constitution,
        goals: [...state.constitution.goals, goal],
      },
    }));
  },

  removeConstitutionValue: (id) =>
    set((state) => ({
      constitution: {
        ...state.constitution,
        values: state.constitution.values.filter((v) => v.id !== id),
      },
    })),

  updateConstitutionValue: (id, partial) =>
    set((state) => ({
      constitution: {
        ...state.constitution,
        values: state.constitution.values.map((v) => (v.id === id ? { ...v, ...partial } : v)),
      },
    })),

  removeConstitutionGoal: (id) =>
    set((state) => ({
      constitution: {
        ...state.constitution,
        goals: state.constitution.goals.filter((g) => g.id !== id),
      },
    })),

  updateConstitutionGoal: (id, partial) =>
    set((state) => ({
      constitution: {
        ...state.constitution,
        goals: state.constitution.goals.map((g) => (g.id === id ? { ...g, ...partial } : g)),
      },
    })),

  addConstitutionStandard: (data) => {
    const standard: ConstitutionStandard = { ...data, id: generateId() };
    set((state) => ({
      constitution: {
        ...state.constitution,
        standards: [...state.constitution.standards, standard],
      },
    }));
  },

  removeConstitutionStandard: (id) =>
    set((state) => ({
      constitution: {
        ...state.constitution,
        standards: state.constitution.standards.filter((s) => s.id !== id),
      },
    })),

  addConstitutionMotive: (data) => {
    const motive: ConstitutionMotive = { ...data, id: generateId() };
    set((state) => ({
      constitution: {
        ...state.constitution,
        motives: [...state.constitution.motives, motive],
      },
    }));
  },

  removeConstitutionMotive: (id) =>
    set((state) => ({
      constitution: {
        ...state.constitution,
        motives: state.constitution.motives.filter((m) => m.id !== id),
      },
    })),

  addConstitutionTension: (data) => {
    const tension: ConstitutionTension = { ...data, id: generateId() };
    set((state) => ({
      constitution: {
        ...state.constitution,
        tensions: [...state.constitution.tensions, tension],
      },
    }));
  },

  removeConstitutionTension: (id) =>
    set((state) => ({
      constitution: {
        ...state.constitution,
        tensions: state.constitution.tensions.filter((t) => t.id !== id),
      },
    })),

  updateConstitutionTension: (id, partial) =>
    set((state) => ({
      constitution: {
        ...state.constitution,
        tensions: state.constitution.tensions.map((t) => (t.id === id ? { ...t, ...partial } : t)),
      },
    })),

  // ── Crucible ──────────────────────────────────────────────────────────

  activeCrucibleSession: null,

  startCrucibleSession: (data) => {
    const session: CrucibleSession = {
      ...data,
      id: generateId(),
      startTime: nowISO(),
      exchanges: [],
    };
    set({ activeCrucibleSession: session });
    return session;
  },

  addCrucibleExchange: (data) => {
    const exchange: CrucibleExchange = {
      ...data,
      id: generateId(),
      timestamp: nowISO(),
    };
    set((state) => {
      if (!state.activeCrucibleSession) return {};
      return {
        activeCrucibleSession: {
          ...state.activeCrucibleSession,
          exchanges: [...state.activeCrucibleSession.exchanges, exchange],
        },
      };
    });
  },

  endCrucibleSession: (findings, reconstruction) =>
    set((state) => {
      if (!state.activeCrucibleSession) return {};
      return {
        activeCrucibleSession: {
          ...state.activeCrucibleSession,
          findings,
          reconstruction,
        },
      };
    }),

  clearCrucibleSession: () => set({ activeCrucibleSession: null }),

  // ── MirrorForge ────────────────────────────────────────────────────────

  updateMirrorforge: (partial) =>
    set((state) => ({ mirrorforge: { ...state.mirrorforge, ...partial } })),

  addMirrorforgePattern: (data) => {
    const pattern = { ...data, id: generateId() };
    set((state) => ({
      mirrorforge: {
        ...state.mirrorforge,
        patternLedger: [pattern, ...state.mirrorforge.patternLedger],
      },
    }));
  },

  removeMirrorforgePattern: (id) =>
    set((state) => ({
      mirrorforge: {
        ...state.mirrorforge,
        patternLedger: state.mirrorforge.patternLedger.filter((p) => p.id !== id),
      },
    })),

  updateMirrorforgeCurrentRead: (read) =>
    set((state) => ({
      mirrorforge: {
        ...state.mirrorforge,
        currentRead: { ...state.mirrorforge.currentRead, ...read },
      },
    })),

  // ── Reality Engine ─────────────────────────────────────────────────────

  updateRealityEngine: (partial) =>
    set((state) => ({ realityEngine: { ...state.realityEngine, ...partial } })),

  addSystemNode: (data) => {
    const node = { ...data, id: generateId() };
    set((state) => ({
      realityEngine: {
        ...state.realityEngine,
        systemNodes: [...state.realityEngine.systemNodes, node],
      },
    }));
  },

  removeSystemNode: (id) =>
    set((state) => ({
      realityEngine: {
        ...state.realityEngine,
        systemNodes: state.realityEngine.systemNodes
          .filter((n) => n.id !== id)
          .map((n) => ({
            ...n,
            connections: n.connections.filter((c) => c.targetId !== id),
          })),
      },
    })),

  updateSystemNode: (id, partial) =>
    set((state) => ({
      realityEngine: {
        ...state.realityEngine,
        systemNodes: state.realityEngine.systemNodes.map((n) =>
          n.id === id ? { ...n, ...partial } : n
        ),
      },
    })),

  addNodeConnection: (nodeId, connection) =>
    set((state) => ({
      realityEngine: {
        ...state.realityEngine,
        systemNodes: state.realityEngine.systemNodes.map((n) =>
          n.id === nodeId
            ? { ...n, connections: [...n.connections, connection] }
            : n
        ),
      },
    })),

  removeNodeConnection: (nodeId, targetId) =>
    set((state) => ({
      realityEngine: {
        ...state.realityEngine,
        systemNodes: state.realityEngine.systemNodes.map((n) =>
          n.id === nodeId
            ? { ...n, connections: n.connections.filter((c) => c.targetId !== targetId) }
            : n
        ),
      },
    })),

  // ── Resonance ──────────────────────────────────────────────────────────

  updateResonance: (partial) =>
    set((state) => ({ resonance: { ...state.resonance, ...partial } })),

  toggleResonanceLearning: () =>
    set((state) => ({ resonance: { ...state.resonance, isLearning: !state.resonance.isLearning } })),

  setResonanceMode: (mode) =>
    set((state) => ({ resonance: { ...state.resonance, activeMode: mode } })),

  addResonanceProfile: (data) => {
    const profile = { ...data, id: generateId() };
    set((state) => ({
      resonance: {
        ...state.resonance,
        profiles: [...state.resonance.profiles, profile],
      },
    }));
  },

  addResonanceObservation: (data) => {
    const obs = { ...data, id: generateId() };
    set((state) => ({
      resonance: {
        ...state.resonance,
        observations: [obs, ...state.resonance.observations].slice(0, 500),
      },
    }));
  },

  addResonanceGraphNode: (data) => {
    const node = { ...data, id: generateId() };
    set((state) => ({
      resonance: {
        ...state.resonance,
        graph: {
          ...state.resonance.graph,
          nodes: [...state.resonance.graph.nodes, node],
        },
      },
    }));
  },

  removeResonanceGraphNode: (id) =>
    set((state) => ({
      resonance: {
        ...state.resonance,
        graph: {
          ...state.resonance.graph,
          nodes: state.resonance.graph.nodes.filter((n) => n.id !== id),
          edges: state.resonance.graph.edges.filter((e) => e.source !== id && e.target !== id),
        },
      },
    })),

  addResonanceGraphEdge: (edge) =>
    set((state) => ({
      resonance: {
        ...state.resonance,
        graph: {
          ...state.resonance.graph,
          edges: [...state.resonance.graph.edges, edge],
        },
      },
    })),

  removeResonanceGraphEdge: (source, target) =>
    set((state) => ({
      resonance: {
        ...state.resonance,
        graph: {
          ...state.resonance.graph,
          edges: state.resonance.graph.edges.filter(
            (e) => !(e.source === source && e.target === target)
          ),
        },
      },
    })),

  // ── Pulse ─────────────────────────────────────────────────────────────

  addPulseItem: (data) => {
    const item: PulseItem = { ...data, id: generateId() };
    set((state) => ({
      pulse: {
        lastUpdate: nowISO(),
        items: [item, ...state.pulse.items].slice(0, 50),
      },
    }));
  },

  removePulseItem: (id) =>
    set((state) => ({
      pulse: {
        ...state.pulse,
        items: state.pulse.items.filter((p) => p.id !== id),
      },
    })),

  // ── Creator Console ───────────────────────────────────────────────────

  setCreatorConsoleState: (state) => set({ creatorConsoleState: state }),

  setSettingsOpen: (open) => set({ isSettingsOpen: open }),
}));

// ── Bootstrap ─────────────────────────────────────────────────────────────

/**
 * Called once at app startup. Wires up auth listener and triggers hydration.
 * Safe to call multiple times (subsequent calls are no-ops after first auth event).
 */
export function bootstrapAtlas(): void {
  useAtlasStore.getState().hydrateAuth();
}
