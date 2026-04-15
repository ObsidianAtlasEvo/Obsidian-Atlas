/**
 * Canonical record shapes for the local intelligence substrate (Dexie / IndexedDB).
 * Separate from the legacy Firestore-compat shim DB (`obsidian-atlas-local-v1`).
 */

/** Per-user routing of tone, rigor, and UI-adjacent preferences. */
export interface PolicyProfileRecord {
  /** Primary key — one active profile per sovereign user. */
  userId: string;
  tone: 'measured' | 'direct' | 'warm' | 'clinical' | 'standard';
  /** 0 = loose, 1 = maximum epistemic strictness */
  strictness: number;
  /** 0 = terse, 1 = expansive */
  verbosityBias: number;
  languageLevel: 'lay' | 'standard' | 'expert';
  /** Free-form knobs (precision sliders, posture IDs, etc.) */
  preferences: Record<string, unknown>;
  updatedAt: number;
}

/** Append-mostly chat / system events for context assembly & audit. */
export interface ConversationTraceRecord {
  id?: number;
  userId: string;
  /** e.g. resonance | crucible | console | home */
  channel: string;
  sessionId?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: number;
  /** Post-compute pipeline marker */
  evalStatus?: 'pending' | 'processed' | 'skipped';
  /** Optional link to graph / memory writes */
  meta?: Record<string, unknown>;
}

/** Structured memory after evaluation passes confidence threshold. */
export interface MemoryRecord {
  id?: number;
  userId: string;
  kind: 'identity' | 'fact' | 'goal' | 'preference' | 'context';
  content: string;
  /** 0–1; persistence gate in the orchestration layer */
  confidence: number;
  /** Keyword index for cheap retrieval (Dexie multiEntry) */
  keywords: string[];
  sourceTraceIds: string[];
  createdAt: number;
  updatedAt: number;
  /** Optional embedding vector for cosine recall in the app layer */
  embedding?: number[];
}

/** Atlas graph visualization nodes — backed locally, not Firestore. */
export interface GraphNodeRecord {
  id?: number;
  userId: string;
  /** Stable key for React/d3 identity */
  nodeKey: string;
  label: string;
  kind: string;
  metadata: Record<string, unknown>;
  confidence: number;
  linkedMemoryIds: number[];
  updatedAt: number;
}

export type DoctrineLayer = 'truth_ledger' | 'sovereign_codex' | 'constitution';

/** Truth Ledger / Sovereign Codex / constitution text blocks. */
export interface DoctrineEntryRecord {
  id?: number;
  userId: string;
  layer: DoctrineLayer;
  title: string;
  body: string;
  priority: number;
  version: number;
  updatedAt: number;
}

/** Result of deterministic post-pass (no second LLM required for v1). */
export interface MemoryCandidateDraft {
  kind: MemoryRecord['kind'];
  content: string;
  confidence: number;
  keywords: string[];
  reason: string;
}

// ── Chat Thread Persistence ──────────────────────────────────────────────

/**
 * Finite-state machine for each chat request.
 * Every request MUST reach a terminal state (`completed | failed | timed_out | aborted | interrupted`).
 */
export type ChatRequestState =
  | 'idle'
  | 'submitting'
  | 'streaming'
  | 'completed'
  | 'failed'
  | 'timed_out'
  | 'aborted'
  | 'interrupted';

export const TERMINAL_CHAT_STATES: ReadonlySet<ChatRequestState> = new Set([
  'completed',
  'failed',
  'timed_out',
  'aborted',
  'interrupted',
]);

export interface ChatThreadRecord {
  id?: number;
  threadId: string;
  userId: string;
  title: string;
  /** Which chamber originated this thread. */
  channel: string;
  createdAt: number;
  updatedAt: number;
  lastRequestState: ChatRequestState;
  messageCount: number;
}

export interface ChatMessageRecord {
  id?: number;
  threadId: string;
  userId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  /** FSM state at write time; streaming messages are `submitting` or `streaming`. */
  requestState: ChatRequestState;
  createdAt: number;
  updatedAt: number;
  /** Partial content is saved incrementally during streaming. */
  isPartial: boolean;
  error?: string;
  tokens?: number;
  durationMs?: number;
}

export interface PromptHistoryRecord {
  id?: number;
  userId: string;
  prompt: string;
  channel: string;
  createdAt: number;
}
