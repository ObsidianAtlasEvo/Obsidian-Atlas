import Dexie, { type Table } from 'dexie';
import type {
  ChatMessageRecord,
  ChatThreadRecord,
  ConversationTraceRecord,
  DoctrineEntryRecord,
  GraphNodeRecord,
  MemoryRecord,
  PolicyProfileRecord,
  PromptHistoryRecord,
  UserPreferenceRecord,
} from './atlasEntities';

/**
 * Dexie database: Memories, Traces, Policy, Graph, Doctrine, Chat Threads.
 *
 * DB name is distinct from `src/shims/atlasIndexedDb.ts` (`obsidian-atlas-local-v1`)
 * so the Firestore-compat layer and the intelligence layer never collide.
 */
export class AtlasIntelligenceDB extends Dexie {
  policyProfiles!: Table<PolicyProfileRecord, string>;
  conversationTraces!: Table<ConversationTraceRecord, number>;
  memories!: Table<MemoryRecord, number>;
  graphNodes!: Table<GraphNodeRecord, number>;
  doctrineEntries!: Table<DoctrineEntryRecord, number>;
  chatThreads!: Table<ChatThreadRecord, number>;
  chatMessages!: Table<ChatMessageRecord, number>;
  promptHistory!: Table<PromptHistoryRecord, number>;
  userPreferences!: Table<UserPreferenceRecord, string>;

  constructor() {
    super('obsidian-atlas-intelligence-v1');

    this.version(1).stores({
      policyProfiles: 'userId, updatedAt',
      conversationTraces: '++id, userId, channel, createdAt, sessionId, evalStatus',
      memories: '++id, userId, kind, confidence, createdAt, *keywords',
      graphNodes: '++id, userId, nodeKey, kind, confidence, updatedAt',
      doctrineEntries: '++id, userId, layer, updatedAt, priority',
    });

    this.version(2).stores({
      policyProfiles: 'userId, updatedAt',
      conversationTraces: '++id, userId, channel, createdAt, sessionId, evalStatus',
      memories: '++id, userId, kind, confidence, createdAt, *keywords',
      graphNodes: '++id, userId, nodeKey, kind, confidence, updatedAt',
      doctrineEntries: '++id, userId, layer, updatedAt, priority',
      chatThreads: '++id, threadId, userId, channel, updatedAt',
      chatMessages: '++id, threadId, userId, createdAt, requestState',
      promptHistory: '++id, userId, createdAt',
      userPreferences: '[userId+key], updatedAt',
    });
  }
}

/** Singleton used by `localIntelligence` and UI hooks. */
export const atlasIntelligenceDb = new AtlasIntelligenceDB();
