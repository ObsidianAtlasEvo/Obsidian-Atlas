export type MemoryKind =
  | 'preference'
  | 'project'
  | 'identity'
  | 'style'
  | 'goal'
  | 'constraint'
  | 'fact'
  /** User rejected a behavior pattern Atlas should avoid repeating. */
  | 'rejection'
  /** Reusable workflow / procedure the user demonstrated. */
  | 'skill';

export interface MemoryRecord {
  id: string;
  userId: string;
  kind: MemoryKind;
  summary: string;
  detail: string;
  confidence: number;
  sourceTraceId: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PolicyProfile {
  userId: string;
  verbosity: 'low' | 'medium' | 'high';
  tone: 'direct' | 'professional' | 'warm' | 'analytical';
  structurePreference: 'minimal' | 'balanced' | 'structured';
  /** 0–1 internal scale (Chrysalis / SQLite); Omni-Router maps to 1–10 for Groq telemetry. */
  truthFirstStrictness: number;
  writingStyleEnabled: boolean;
  /** Evolved routing preference: heavier models when `Heavy`. */
  preferredComputeDepth: 'Light' | 'Heavy';
  /** Low = prefer fast responses; High = willing to wait for depth. */
  latencyTolerance: 'Low' | 'High';
  updatedAt: string;
  /** True when at least one explicit user signal has updated this profile.
   * False for new users on structural defaults — downstream systems must not
   * present unlearned defaults to the LLM as user preferences. */
  isLearned?: boolean;
}

export interface ConversationTrace {
  id: string;
  userId: string;
  userMessage: string;
  assistantResponse: string;
  responseScore: number;
  memoryCandidates: number;
  datasetApproved: boolean;
  createdAt: string;
}

export interface MemoryCandidate {
  kind: MemoryKind;
  summary: string;
  detail: string;
  confidence: number;
  tags: string[];
}

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatRequest {
  userId: string;
  messages: Array<{ role: ChatRole; content: string }>;
}

export interface ChatResponse {
  traceId: string;
  /** GPU queue correlation id (echo client `requestId` or server-generated). */
  requestId: string;
  reply: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  /** Post-inference evolution runs asynchronously; poll traces/memories or subscribe to `evolutionBus`. */
  evolution: 'scheduled';
}
