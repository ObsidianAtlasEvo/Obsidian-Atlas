/**
 * useSovereignStore.ts
 * Zustand store slice for the Atlas Sovereign Console.
 * Creator-only state: prompt management, feature flags, user observatory,
 * bug hunter queue, deploy pipeline, and release management.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SovereignTab =
  | 'command'
  | 'prompt'
  | 'flags'
  | 'users'
  | 'bugs'
  | 'publish'
  | 'explainability';

export interface PromptVersion {
  version: number;
  content: string;
  savedAt: string; // ISO timestamp
  savedBy: string; // always crowleyrc62@gmail.com
}

export interface FeatureFlag {
  name: string;
  description: string;
  enabled: boolean;
  affectedUsers: 'all' | string[]; // 'all' or array of userIds
  createdAt: string;
  updatedAt: string;
}

export interface UserSummary {
  userId: string;
  email?: string;
  evolutionVersion: number;
  confidenceScore: number;
  archetype: string;
  totalInteractions: number;
  lastActive: string;
  evolutionProfile?: AtlasAdaptationState;
}

export interface AtlasAdaptationState {
  archetype: string;
  communicationStyle: string;
  domainFocus: string[];
  confidenceScore: number;
  evolutionVersion: number;
  learnedPreferences: Record<string, unknown>;
  overseerInsights: string[];
  signalBuffer: unknown[];
  lastRecalibrated: string;
}

export interface MindProfile {
  userId: string;
  traits: Record<string, number>;
  goals: string[];
  workingMemory: string[];
  cognitiveMap: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type BugSeverity = 'minor' | 'major' | 'critical';
export type BugStatus = 'new' | 'investigating' | 'resolved';

export interface BugReport {
  id: string;
  userId?: string;
  title: string;
  description: string;
  severity: BugSeverity;
  status: BugStatus;
  createdAt: string;
  updatedAt: string;
  addedToChangelog: boolean;
}

export type DeployStatus = 'idle' | 'deploying' | 'success' | 'error';

export interface Release {
  version: string;
  changelog: string;
  publishedAt: string;
  publishedBy: string;
  resolvedBugs: string[]; // bug IDs included
}

export interface SystemStatus {
  healthy: boolean;
  uptime: number; // seconds
  memoryUsageMB: number;
  memoryTotalMB: number;
  avgResponseTimeMs: number;
  groqApiStatus: 'online' | 'degraded' | 'offline';
  activeUsersLast24h: number;
  totalEvolutionProfiles: number;
  overseerQueueDepth: number;
  version: string;
  nodeVersion: string;
  environment: string;
}

// ─── State Interface ──────────────────────────────────────────────────────────

export interface SovereignState {
  // Navigation
  activeTab: SovereignTab;

  // Prompt Forge
  currentPrompt: string;
  promptVersion: number;
  promptHistory: PromptVersion[];
  promptDirty: boolean; // unsaved changes
  testPromptResponse: string | null;
  testPromptLoading: boolean;
  promptSaving: boolean;

  // Feature Flags
  featureFlags: FeatureFlag[];
  flagsLoading: boolean;

  // User Observatory
  users: UserSummary[];
  usersLoading: boolean;
  usersTotal: number;
  usersPage: number;
  selectedUser: UserSummary | null;
  selectedUserMindProfile: MindProfile | null;

  // Bug Hunter
  bugs: BugReport[];
  bugsLoading: boolean;
  bugFilter: 'all' | 'new' | 'critical' | 'resolved';

  // Deploy / Publish
  deployStatus: DeployStatus;
  deployLog: string[];
  currentVersion: string;
  releaseChangelog: string;
  releases: Release[];
  releasesLoading: boolean;

  // Command Center
  systemStatus: SystemStatus | null;
  systemStatusLoading: boolean;
  liveLogLines: string[];
}

// ─── Actions Interface ────────────────────────────────────────────────────────

export interface SovereignActions {
  // Navigation
  setActiveTab: (tab: SovereignTab) => void;

  // Prompt Forge
  loadPrompt: () => Promise<void>;
  setCurrentPrompt: (content: string) => void;
  savePrompt: () => Promise<void>;
  testPrompt: (query?: string) => Promise<void>;
  loadPromptHistory: () => Promise<void>;
  rollbackPrompt: (version: number) => Promise<void>;
  clearTestResponse: () => void;

  // Feature Flags
  loadFlags: () => Promise<void>;
  toggleFlag: (name: string, enabled: boolean) => Promise<void>;
  addFlag: (flag: Omit<FeatureFlag, 'createdAt' | 'updatedAt'>) => Promise<void>;
  deleteFlag: (name: string) => Promise<void>;
  updateFlag: (name: string, updates: Partial<FeatureFlag>) => Promise<void>;

  // User Observatory
  loadUsers: (page?: number) => Promise<void>;
  selectUser: (userId: string) => Promise<void>;
  clearSelectedUser: () => void;
  resetUserEvolution: (userId: string) => Promise<void>;
  loadUserMindProfile: (userId: string) => Promise<void>;

  // Bug Hunter
  loadBugs: () => Promise<void>;
  updateBugStatus: (id: string, status: BugStatus) => Promise<void>;
  setBugFilter: (filter: 'all' | 'new' | 'critical' | 'resolved') => void;
  addBugToChangelog: (id: string) => Promise<void>;

  // Deploy / Publish
  startDeploy: () => Promise<void>;
  appendDeployLog: (line: string) => void;
  finishDeploy: (success: boolean) => void;
  setCurrentVersion: (version: string) => void;
  setReleaseChangelog: (changelog: string) => void;
  publishRelease: () => Promise<void>;
  loadReleases: () => Promise<void>;

  // Command Center
  loadSystemStatus: () => Promise<void>;
  appendLiveLog: (line: string) => void;
  clearLiveLog: () => void;
  runQuickAction: (action: 'rebuild' | 'clearBuffers' | 'recalibrate') => Promise<void>;
}

// ─── Default Built-in Flags ───────────────────────────────────────────────────

const DEFAULT_FLAGS: FeatureFlag[] = [
  {
    name: 'evolution_engine_enabled',
    description: 'Enables Atlas to learn and adapt to each user over time via the evolution engine.',
    enabled: true,
    affectedUsers: 'all',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    name: 'overseer_enabled',
    description: 'Enables the background overseer process that monitors signal buffers and recalibrates evolution profiles.',
    enabled: true,
    affectedUsers: 'all',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    name: 'multi_model_orchestration',
    description: 'Allows Atlas to route queries across multiple LLM backends based on task type.',
    enabled: true,
    affectedUsers: 'all',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    name: 'cognition_map_enabled',
    description: 'Enables the cognition map — a spatial representation of each user\'s knowledge graph.',
    enabled: true,
    affectedUsers: 'all',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    name: 'mind_profile_enabled',
    description: 'Enables the mind profile system that tracks user traits, goals, and working memory.',
    enabled: true,
    affectedUsers: 'all',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    name: 'sovereign_console_debug_mode',
    description: 'Enables verbose debug output in the Sovereign Console, including raw API payloads and internal state dumps.',
    enabled: false,
    affectedUsers: 'all',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

// ─── API Helper ───────────────────────────────────────────────────────────────

async function sovereignFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`/api/sovereign${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useSovereignStore = create<SovereignState & SovereignActions>()(
  devtools(
    (set, get) => ({
      // ── Initial State ──────────────────────────────────────────────────────

      activeTab: 'command',

      currentPrompt: '',
      promptVersion: 0,
      promptHistory: [],
      promptDirty: false,
      testPromptResponse: null,
      testPromptLoading: false,
      promptSaving: false,

      featureFlags: DEFAULT_FLAGS,
      flagsLoading: false,

      users: [],
      usersLoading: false,
      usersTotal: 0,
      usersPage: 1,
      selectedUser: null,
      selectedUserMindProfile: null,

      bugs: [],
      bugsLoading: false,
      bugFilter: 'all',

      deployStatus: 'idle',
      deployLog: [],
      currentVersion: '1.0.0',
      releaseChangelog: '',
      releases: [],
      releasesLoading: false,

      systemStatus: null,
      systemStatusLoading: false,
      liveLogLines: [],

      // ── Navigation ─────────────────────────────────────────────────────────

      setActiveTab: (tab) => set({ activeTab: tab }),

      // ── Prompt Forge ───────────────────────────────────────────────────────

      loadPrompt: async () => {
        try {
          const data = await sovereignFetch<{ content: string; version: number }>(
            '/prompt'
          );
          set({
            currentPrompt: data.content,
            promptVersion: data.version,
            promptDirty: false,
          });
        } catch (err) {
          console.error('[Sovereign] loadPrompt error:', err);
        }
      },

      setCurrentPrompt: (content) =>
        set({ currentPrompt: content, promptDirty: true }),

      savePrompt: async () => {
        set({ promptSaving: true });
        try {
          const { currentPrompt } = get();
          const data = await sovereignFetch<{ version: number }>(
            '/prompt',
            {
              method: 'POST',
              body: JSON.stringify({ content: currentPrompt }),
            }
          );
          set({ promptVersion: data.version, promptDirty: false });
          // Reload history after save
          await get().loadPromptHistory();
        } catch (err) {
          console.error('[Sovereign] savePrompt error:', err);
        } finally {
          set({ promptSaving: false });
        }
      },

      testPrompt: async (query = 'Hello, Atlas. Who are you?') => {
        set({ testPromptLoading: true, testPromptResponse: null });
        try {
          const { currentPrompt } = get();
          const data = await sovereignFetch<{ response: string }>(
            '/prompt/test',
            {
              method: 'POST',
              body: JSON.stringify({ prompt: currentPrompt, query }),
            }
          );
          set({ testPromptResponse: data.response });
        } catch (err) {
          set({ testPromptResponse: `Error: ${(err as Error).message}` });
        } finally {
          set({ testPromptLoading: false });
        }
      },

      loadPromptHistory: async () => {
        try {
          const data = await sovereignFetch<{ versions: PromptVersion[] }>(
            '/prompt/history'
          );
          set({ promptHistory: data.versions });
        } catch (err) {
          console.error('[Sovereign] loadPromptHistory error:', err);
        }
      },

      rollbackPrompt: async (version) => {
        try {
          const data = await sovereignFetch<{ content: string; version: number }>(
            `/prompt/rollback/${version}`,
            { method: 'POST' }
          );
          set({
            currentPrompt: data.content,
            promptVersion: data.version,
            promptDirty: false,
          });
          await get().loadPromptHistory();
        } catch (err) {
          console.error('[Sovereign] rollbackPrompt error:', err);
        }
      },

      clearTestResponse: () => set({ testPromptResponse: null }),

      // ── Feature Flags ──────────────────────────────────────────────────────

      loadFlags: async () => {
        set({ flagsLoading: true });
        try {
          const data = await sovereignFetch<{ flags: FeatureFlag[] }>('/flags');
          set({ featureFlags: data.flags });
        } catch (err) {
          console.error('[Sovereign] loadFlags error:', err);
          // Keep defaults on error
        } finally {
          set({ flagsLoading: false });
        }
      },

      toggleFlag: async (name, enabled) => {
        // Optimistic update
        set((state) => ({
          featureFlags: state.featureFlags.map((f) =>
            f.name === name ? { ...f, enabled, updatedAt: new Date().toISOString() } : f
          ),
        }));
        try {
          await sovereignFetch('/flags', {
            method: 'POST',
            body: JSON.stringify({ name, enabled }),
          });
        } catch (err) {
          console.error('[Sovereign] toggleFlag error:', err);
          // Revert optimistic update
          set((state) => ({
            featureFlags: state.featureFlags.map((f) =>
              f.name === name ? { ...f, enabled: !enabled } : f
            ),
          }));
        }
      },

      addFlag: async (flag) => {
        try {
          const newFlag: FeatureFlag = {
            ...flag,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          await sovereignFetch('/flags', {
            method: 'POST',
            body: JSON.stringify(newFlag),
          });
          set((state) => ({ featureFlags: [...state.featureFlags, newFlag] }));
        } catch (err) {
          console.error('[Sovereign] addFlag error:', err);
        }
      },

      updateFlag: async (name, updates) => {
        set((state) => ({
          featureFlags: state.featureFlags.map((f) =>
            f.name === name
              ? { ...f, ...updates, updatedAt: new Date().toISOString() }
              : f
          ),
        }));
        try {
          await sovereignFetch('/flags', {
            method: 'POST',
            body: JSON.stringify({ name, ...updates }),
          });
        } catch (err) {
          console.error('[Sovereign] updateFlag error:', err);
        }
      },

      deleteFlag: async (name) => {
        const prev = get().featureFlags;
        set((state) => ({
          featureFlags: state.featureFlags.filter((f) => f.name !== name),
        }));
        try {
          await sovereignFetch(`/flags/${encodeURIComponent(name)}`, {
            method: 'DELETE',
          });
        } catch (err) {
          console.error('[Sovereign] deleteFlag error:', err);
          set({ featureFlags: prev });
        }
      },

      // ── User Observatory ───────────────────────────────────────────────────

      loadUsers: async (page = 1) => {
        set({ usersLoading: true });
        try {
          const data = await sovereignFetch<{
            users: UserSummary[];
            total: number;
            page: number;
          }>(`/users?page=${page}&limit=20`);
          set({
            users: data.users,
            usersTotal: data.total,
            usersPage: data.page,
          });
        } catch (err) {
          console.error('[Sovereign] loadUsers error:', err);
        } finally {
          set({ usersLoading: false });
        }
      },

      selectUser: async (userId) => {
        try {
          const data = await sovereignFetch<UserSummary & { evolutionProfile: AtlasAdaptationState }>(
            `/users/${userId}/evolution`
          );
          set({ selectedUser: data });
        } catch (err) {
          console.error('[Sovereign] selectUser error:', err);
        }
      },

      clearSelectedUser: () =>
        set({ selectedUser: null, selectedUserMindProfile: null }),

      resetUserEvolution: async (userId) => {
        try {
          await sovereignFetch(`/users/${userId}/evolution`, {
            method: 'DELETE',
          });
          // Refresh user list
          await get().loadUsers(get().usersPage);
          if (get().selectedUser?.userId === userId) {
            set({ selectedUser: null });
          }
        } catch (err) {
          console.error('[Sovereign] resetUserEvolution error:', err);
        }
      },

      loadUserMindProfile: async (userId) => {
        try {
          const data = await sovereignFetch<MindProfile>(
            `/users/${userId}/mind-profile`
          );
          set({ selectedUserMindProfile: data });
        } catch (err) {
          console.error('[Sovereign] loadUserMindProfile error:', err);
        }
      },

      // ── Bug Hunter ─────────────────────────────────────────────────────────

      loadBugs: async () => {
        set({ bugsLoading: true });
        try {
          const data = await sovereignFetch<{ bugs: BugReport[] }>('/bugs');
          set({ bugs: data.bugs });
        } catch (err) {
          console.error('[Sovereign] loadBugs error:', err);
        } finally {
          set({ bugsLoading: false });
        }
      },

      updateBugStatus: async (id, status) => {
        // Optimistic
        set((state) => ({
          bugs: state.bugs.map((b) =>
            b.id === id
              ? { ...b, status, updatedAt: new Date().toISOString() }
              : b
          ),
        }));
        try {
          await sovereignFetch(`/bugs/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status }),
          });
        } catch (err) {
          console.error('[Sovereign] updateBugStatus error:', err);
        }
      },

      setBugFilter: (filter) => set({ bugFilter: filter }),

      addBugToChangelog: async (id) => {
        set((state) => ({
          bugs: state.bugs.map((b) =>
            b.id === id ? { ...b, addedToChangelog: true } : b
          ),
        }));
        try {
          await sovereignFetch(`/bugs/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ addedToChangelog: true }),
          });
          // Auto-append to release changelog
          const bug = get().bugs.find((b) => b.id === id);
          if (bug) {
            const prev = get().releaseChangelog;
            const entry = `\n- **[${bug.severity.toUpperCase()}]** ${bug.title}`;
            set({ releaseChangelog: prev + entry });
          }
        } catch (err) {
          console.error('[Sovereign] addBugToChangelog error:', err);
        }
      },

      // ── Deploy / Publish ───────────────────────────────────────────────────

      startDeploy: async () => {
        set({ deployStatus: 'deploying', deployLog: [] });

        const eventSource = new EventSource('/api/sovereign/deploy', {
          withCredentials: true,
        });

        // POST to trigger, then listen via separate SSE endpoint
        // For deploy, we POST first
        try {
          await fetch('/api/sovereign/deploy', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ version: get().currentVersion }),
          });
        } catch (_) {
          // SSE stream handles status
        }

        eventSource.onmessage = (e) => {
          if (e.data === '__DONE__') {
            eventSource.close();
            get().finishDeploy(true);
          } else if (e.data.startsWith('__ERROR__')) {
            eventSource.close();
            get().finishDeploy(false);
          } else {
            get().appendDeployLog(e.data);
          }
        };

        eventSource.onerror = () => {
          eventSource.close();
          get().finishDeploy(false);
        };
      },

      appendDeployLog: (line) =>
        set((state) => ({ deployLog: [...state.deployLog, line] })),

      finishDeploy: (success) =>
        set({ deployStatus: success ? 'success' : 'error' }),

      setCurrentVersion: (version) => set({ currentVersion: version }),

      setReleaseChangelog: (changelog) => set({ releaseChangelog: changelog }),

      publishRelease: async () => {
        const { currentVersion, releaseChangelog, bugs } = get();
        const resolvedBugIds = bugs
          .filter((b) => b.status === 'resolved' && b.addedToChangelog)
          .map((b) => b.id);

        try {
          await sovereignFetch('/release', {
            method: 'POST',
            body: JSON.stringify({
              version: currentVersion,
              changelog: releaseChangelog,
              resolvedBugs: resolvedBugIds,
            }),
          });
          await get().loadReleases();
          set({ releaseChangelog: '' });
        } catch (err) {
          console.error('[Sovereign] publishRelease error:', err);
        }
      },

      loadReleases: async () => {
        set({ releasesLoading: true });
        try {
          const data = await sovereignFetch<{ releases: Release[] }>('/releases');
          set({ releases: data.releases });
        } catch (err) {
          console.error('[Sovereign] loadReleases error:', err);
        } finally {
          set({ releasesLoading: false });
        }
      },

      // ── Command Center ─────────────────────────────────────────────────────

      loadSystemStatus: async () => {
        set({ systemStatusLoading: true });
        try {
          const data = await sovereignFetch<SystemStatus>('/status');
          set({ systemStatus: data });
        } catch (err) {
          console.error('[Sovereign] loadSystemStatus error:', err);
        } finally {
          set({ systemStatusLoading: false });
        }
      },

      appendLiveLog: (line) =>
        set((state) => ({
          liveLogLines: [...state.liveLogLines.slice(-499), line],
        })),

      clearLiveLog: () => set({ liveLogLines: [] }),

      runQuickAction: async (action) => {
        const endpoints: Record<string, string> = {
          rebuild: '/actions/rebuild-profiles',
          clearBuffers: '/actions/clear-signal-buffers',
          recalibrate: '/actions/force-recalibrate',
        };
        try {
          await sovereignFetch(endpoints[action], { method: 'POST' });
          // Reload status after action
          await get().loadSystemStatus();
        } catch (err) {
          console.error(`[Sovereign] runQuickAction(${action}) error:`, err);
        }
      },
    }),
    { name: 'SovereignStore' }
  )
);
