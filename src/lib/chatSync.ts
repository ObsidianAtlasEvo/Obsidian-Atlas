/**
 * chatSync.ts — Cross-device chat history synchronisation.
 *
 * On login we push local Dexie (IndexedDB) threads/messages to the backend and
 * pull any threads that were created on another device. Steady-state writes are
 * handled by fire-and-forget POSTs from chatPersistence.ts.
 *
 * Failure policy: all sync is best-effort. A network error must never block
 * hydration or surface to the UI — callers should not await errors.
 */

import { atlasIntelligenceDb } from '../db/atlasDexieDb';
import type { ChatMessageRecord, ChatThreadRecord } from '../db/atlasEntities';
import { atlasApiUrl } from './atlasApi';

// ---------------------------------------------------------------------------
// Server row shapes (snake_case; timestamps as ISO strings).
// ---------------------------------------------------------------------------

interface ServerThreadRow {
  thread_id: string;
  user_id: string;
  title: string;
  channel: string;
  last_request_state: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

interface ServerMessageRow {
  message_id: string;
  thread_id: string;
  user_id: string;
  role: string;
  content: string;
  request_state: string;
  model_used?: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Camel-case payloads sent to the backend. Timestamps are epoch-ms so the
// server can coerce them (`toIso()` on the backend handles both forms).
// ---------------------------------------------------------------------------

function threadToWire(t: ChatThreadRecord) {
  return {
    threadId: t.threadId,
    title: t.title,
    channel: t.channel,
    lastRequestState: t.lastRequestState,
    messageCount: t.messageCount,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

function messageToWire(m: ChatMessageRecord) {
  return {
    messageId: `m-${m.threadId}-${m.createdAt}-${m.role}`,
    threadId: m.threadId,
    role: m.role,
    content: m.content,
    requestState: m.requestState,
    createdAt: m.createdAt,
  };
}

function toMillis(iso: string): number {
  const n = Date.parse(iso);
  return Number.isFinite(n) ? n : Date.now();
}

// ---------------------------------------------------------------------------
// Backend API helpers — all return null / false on any error; never throw.
// ---------------------------------------------------------------------------

async function safeFetch(input: string, init?: RequestInit): Promise<Response | null> {
  try {
    const res = await fetch(input, { credentials: 'include', ...init });
    return res.ok ? res : null;
  } catch {
    return null;
  }
}

export function postThread(thread: ChatThreadRecord): void {
  void safeFetch(atlasApiUrl('/v1/chat/threads'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(threadToWire(thread)),
  });
}

export function postMessage(message: ChatMessageRecord): void {
  void safeFetch(atlasApiUrl('/v1/chat/messages'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(messageToWire(message)),
  });
}

export function deleteThreadRemote(threadId: string): void {
  void safeFetch(atlasApiUrl(`/v1/chat/threads/${encodeURIComponent(threadId)}`), {
    method: 'DELETE',
  });
}

// ---------------------------------------------------------------------------
// Login-time two-way sync
// ---------------------------------------------------------------------------

async function bulkSync(userId: string): Promise<void> {
  const [localThreads, localMessages] = await Promise.all([
    atlasIntelligenceDb.chatThreads.where('userId').equals(userId).toArray(),
    atlasIntelligenceDb.chatMessages.where('userId').equals(userId).toArray(),
  ]);

  if (localThreads.length === 0 && localMessages.length === 0) return;

  await safeFetch(atlasApiUrl('/v1/chat/sync'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      threads: localThreads.map(threadToWire),
      messages: localMessages.map(messageToWire),
    }),
  });
}

async function pullRemoteThreads(userId: string): Promise<void> {
  const res = await safeFetch(atlasApiUrl('/v1/chat/threads?limit=100'));
  if (!res) return;

  let payload: { threads?: ServerThreadRow[] };
  try {
    payload = (await res.json()) as { threads?: ServerThreadRow[] };
  } catch {
    return;
  }
  const remoteThreads = payload.threads ?? [];
  if (remoteThreads.length === 0) return;

  const localIds = new Set(
    (await atlasIntelligenceDb.chatThreads.where('userId').equals(userId).toArray()).map(
      (t) => t.threadId,
    ),
  );

  for (const t of remoteThreads) {
    if (localIds.has(t.thread_id)) continue;

    const record: ChatThreadRecord = {
      threadId: t.thread_id,
      userId,
      title: t.title,
      channel: t.channel,
      createdAt: toMillis(t.created_at),
      updatedAt: toMillis(t.updated_at),
      lastRequestState: (t.last_request_state as ChatThreadRecord['lastRequestState']) ?? 'idle',
      messageCount: t.message_count,
    };
    try {
      await atlasIntelligenceDb.chatThreads.put(record);
    } catch {
      continue;
    }

    const msgRes = await safeFetch(
      atlasApiUrl(`/v1/chat/threads/${encodeURIComponent(t.thread_id)}/messages`),
    );
    if (!msgRes) continue;
    let msgPayload: { messages?: ServerMessageRow[] };
    try {
      msgPayload = (await msgRes.json()) as { messages?: ServerMessageRow[] };
    } catch {
      continue;
    }
    const remoteMessages = msgPayload.messages ?? [];
    if (remoteMessages.length === 0) continue;

    const existingMessageKeys = new Set(
      (
        await atlasIntelligenceDb.chatMessages
          .where('threadId')
          .equals(t.thread_id)
          .toArray()
      ).map((m) => `${m.role}-${m.createdAt}`),
    );

    const toInsert: ChatMessageRecord[] = [];
    for (const m of remoteMessages) {
      const createdAt = toMillis(m.created_at);
      const key = `${m.role}-${createdAt}`;
      if (existingMessageKeys.has(key)) continue;
      toInsert.push({
        threadId: m.thread_id,
        userId,
        role: (m.role as ChatMessageRecord['role']) ?? 'user',
        content: m.content,
        requestState: (m.request_state as ChatMessageRecord['requestState']) ?? 'completed',
        createdAt,
        updatedAt: createdAt,
        isPartial: false,
      });
    }

    if (toInsert.length > 0) {
      try {
        await atlasIntelligenceDb.chatMessages.bulkAdd(toInsert);
      } catch {
        // Dexie bulkAdd may partially fail on unique constraint; ignore.
      }
    }
  }
}

/**
 * Two-way sync driver. Fire-and-forget from callers: exceptions and network
 * errors are swallowed so the UI never stalls on hydration.
 */
export async function syncChatHistoryOnLogin(userId: string): Promise<void> {
  if (!userId) return;
  try {
    await bulkSync(userId);
    await pullRemoteThreads(userId);
  } catch {
    // All paths are best-effort. See module header.
  }
}
