import Dexie, { type Table } from 'dexie';
import type {
  ConversationTraceRecord,
  DoctrineEntryRecord,
  GraphNodeRecord,
  MemoryRecord,
  PolicyProfileRecord,
} from './atlasEntities';

/**
 * Dexie database: Memories, Traces, Policy, Graph, Doctrine.
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

  constructor() {
    super('obsidian-atlas-intelligence-v1');

    this.version(1).stores({
      // userId is primary key — at most one row per user
      policyProfiles: 'userId, updatedAt',

      // Recent-trace scans: userId + createdAt; channel for chamber filters
      conversationTraces: '++id, userId, channel, createdAt, sessionId, evalStatus',

      // Memory recall: by user, kind, confidence, time; keywords = multiEntry
      memories: '++id, userId, kind, confidence, createdAt, *keywords',

      // Graph panel: list by user; nodeKey unique per user enforced in DAO layer
      graphNodes: '++id, userId, nodeKey, kind, confidence, updatedAt',

      // Doctrine surfaces
      doctrineEntries: '++id, userId, layer, updatedAt, priority',
    });
  }
}

/** Singleton used by `localIntelligence` and UI hooks. */
export const atlasIntelligenceDb = new AtlasIntelligenceDB();
