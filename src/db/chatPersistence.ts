/**
 * Chat persistence layer backed by Dexie (IndexedDB).
 * Bridges AtlasChamber local state ↔ durable storage.
 *
 * - Threads and messages survive page refresh.
 * - In-flight `submitting` / `streaming` rows are recovered as `interrupted` on hydration.
 * - Partial streaming content is written incrementally so mid-stream refresh recovers content.
 */

import { atlasIntelligenceDb } from './atlasDexieDb';
import type {
  ChatThreadRecord,
  ChatMessageRecord,
  ChatRequestState,
  PromptHistoryRecord,
} from './atlasEntities';
import { TERMINAL_CHAT_STATES } from './atlasEntities';

function threadId(): string {
  return `t-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ── Thread CRUD ──────────────────────────────────────────────────────────

export async function createThread(
  userId: string,
  channel: string,
  title?: string,
): Promise<ChatThreadRecord> {
  const now = Date.now();
  const record: ChatThreadRecord = {
    threadId: threadId(),
    userId,
    title: title ?? 'New thread',
    channel,
    createdAt: now,
    updatedAt: now,
    lastRequestState: 'idle',
    messageCount: 0,
  };
  await atlasIntelligenceDb.chatThreads.add(record);
  return record;
}

export async function listThreads(
  userId: string,
  limit = 50,
): Promise<ChatThreadRecord[]> {
  return atlasIntelligenceDb.chatThreads
    .where('userId')
    .equals(userId)
    .reverse()
    .sortBy('updatedAt')
    .then((rows) => rows.slice(0, limit));
}

export async function getThread(
  tId: string,
): Promise<ChatThreadRecord | undefined> {
  return atlasIntelligenceDb.chatThreads
    .where('threadId')
    .equals(tId)
    .first();
}

export async function updateThread(
  tId: string,
  patch: Partial<Pick<ChatThreadRecord, 'title' | 'lastRequestState' | 'messageCount'>>,
): Promise<void> {
  await atlasIntelligenceDb.chatThreads
    .where('threadId')
    .equals(tId)
    .modify({ ...patch, updatedAt: Date.now() });
}

export async function deleteThread(tId: string): Promise<void> {
  await atlasIntelligenceDb.transaction(
    'rw',
    [atlasIntelligenceDb.chatThreads, atlasIntelligenceDb.chatMessages],
    async () => {
      await atlasIntelligenceDb.chatMessages.where('threadId').equals(tId).delete();
      await atlasIntelligenceDb.chatThreads.where('threadId').equals(tId).delete();
    },
  );
}

// ── Message CRUD ─────────────────────────────────────────────────────────

export async function appendMessage(
  msg: Omit<ChatMessageRecord, 'id'>,
): Promise<number> {
  const id = await atlasIntelligenceDb.chatMessages.add(msg as ChatMessageRecord);
  await updateThread(msg.threadId, { messageCount: await messageCount(msg.threadId) });
  return id;
}

export async function updateMessage(
  id: number,
  patch: Partial<Pick<ChatMessageRecord, 'content' | 'requestState' | 'isPartial' | 'error' | 'tokens' | 'durationMs'>>,
): Promise<void> {
  await atlasIntelligenceDb.chatMessages.update(id, { ...patch, updatedAt: Date.now() });
}

export async function getThreadMessages(
  tId: string,
): Promise<ChatMessageRecord[]> {
  return atlasIntelligenceDb.chatMessages
    .where('threadId')
    .equals(tId)
    .sortBy('createdAt');
}

async function messageCount(tId: string): Promise<number> {
  return atlasIntelligenceDb.chatMessages.where('threadId').equals(tId).count();
}

// ── Streaming incremental save ───────────────────────────────────────────

/**
 * Update partial streaming content. Call after each token chunk or at
 * debounced intervals. The `isPartial: true` flag is set during streaming.
 */
export async function saveStreamingChunk(
  messageId: number,
  content: string,
): Promise<void> {
  await atlasIntelligenceDb.chatMessages.update(messageId, {
    content,
    requestState: 'streaming' as ChatRequestState,
    isPartial: true,
    updatedAt: Date.now(),
  });
}

/**
 * Finalize a streaming message to a terminal state.
 */
export async function finalizeMessage(
  messageId: number,
  state: ChatRequestState,
  content: string,
  meta?: { tokens?: number; durationMs?: number; error?: string },
): Promise<void> {
  await atlasIntelligenceDb.chatMessages.update(messageId, {
    content,
    requestState: state,
    isPartial: false,
    updatedAt: Date.now(),
    ...meta,
  });
}

// ── Hydration: recover after refresh ─────────────────────────────────────

/**
 * On startup, any message stuck in `submitting` or `streaming` is transitioned
 * to `interrupted`. This prevents the UI from showing perpetual spinners.
 */
export async function recoverInterruptedRequests(userId: string): Promise<number> {
  const stuck = await atlasIntelligenceDb.chatMessages
    .where('userId')
    .equals(userId)
    .filter((m) => !TERMINAL_CHAT_STATES.has(m.requestState) && m.requestState !== 'idle')
    .toArray();

  if (stuck.length === 0) return 0;

  await atlasIntelligenceDb.transaction(
    'rw',
    atlasIntelligenceDb.chatMessages,
    async () => {
      for (const m of stuck) {
        if (m.id != null) {
          await atlasIntelligenceDb.chatMessages.update(m.id, {
            requestState: 'interrupted',
            isPartial: false,
            updatedAt: Date.now(),
          });
        }
      }
    },
  );

  return stuck.length;
}

// ── Prompt history ───────────────────────────────────────────────────────

export async function savePromptHistory(
  userId: string,
  prompt: string,
  channel: string,
): Promise<void> {
  await atlasIntelligenceDb.promptHistory.add({
    userId,
    prompt,
    channel,
    createdAt: Date.now(),
  } as PromptHistoryRecord);
}

export async function getPromptHistory(
  userId: string,
  limit = 100,
): Promise<PromptHistoryRecord[]> {
  return atlasIntelligenceDb.promptHistory
    .where('userId')
    .equals(userId)
    .reverse()
    .sortBy('createdAt')
    .then((rows) => rows.slice(0, limit));
}
