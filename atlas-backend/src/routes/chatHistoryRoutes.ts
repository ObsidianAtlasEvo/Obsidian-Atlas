/**
 * chatHistoryRoutes.ts — Server-side chat thread/message sync.
 *
 * Mirrors the client's Dexie (IndexedDB) store of chat threads + messages
 * into Supabase so history follows a user across devices and browsers.
 *
 * Endpoints (all require a valid Atlas session):
 *   GET    /v1/chat/threads                      → { threads: ChatThreadRow[] }
 *   POST   /v1/chat/threads                      → { thread: ChatThreadRow }   (upsert)
 *   DELETE /v1/chat/threads/:threadId            → 204                          (soft delete)
 *   GET    /v1/chat/threads/:threadId/messages   → { messages: ChatMessageRow[] }
 *   POST   /v1/chat/messages                     → { message: ChatMessageRow } (upsert)
 *   POST   /v1/chat/sync                         → { synced: { threads, messages } }
 *
 * Storage: Supabase tables `chat_threads` / `chat_messages` (see migration 018).
 * RLS allows owners to read/write their own rows; the service key used by
 * `supabaseRest` bypasses RLS but we always scope queries by the authenticated
 * session's userId so cross-tenant access is impossible.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { supabaseRest } from '../db/supabase.js';
import { RATE_LIMITS } from '../plugins/rateLimit.js';

// ---------------------------------------------------------------------------
// Types mirroring the Dexie/Supabase row shapes
// ---------------------------------------------------------------------------

interface ChatThreadRow {
  id?: string;
  user_id: string;
  thread_id: string;
  title: string;
  channel: string;
  last_request_state: string;
  message_count: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

interface ChatMessageRow {
  id?: string;
  user_id: string;
  thread_id: string;
  message_id: string;
  role: string;
  content: string;
  request_state: string;
  model_used?: string | null;
  created_at: string;
  deleted_at?: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireSession(
  request: FastifyRequest,
  reply: FastifyReply,
): { userId: string; email: string } | null {
  const session = request.atlasSession;
  if (!session) {
    void reply.status(401).send({ error: 'unauthorized', message: 'Atlas session required' });
    return null;
  }
  return session;
}

/** Coerce a number or string timestamp to ISO-8601; falls back to now(). */
function toIso(ts: unknown): string {
  if (typeof ts === 'string' && ts.length > 0) {
    const d = new Date(ts);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  if (typeof ts === 'number' && Number.isFinite(ts)) {
    return new Date(ts).toISOString();
  }
  return new Date().toISOString();
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function asNumber(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function normaliseThread(userId: string, raw: Record<string, unknown>): ChatThreadRow | null {
  const threadId = asString(raw.threadId ?? raw.thread_id);
  if (!threadId) return null;
  return {
    user_id: userId,
    thread_id: threadId,
    title: asString(raw.title, 'New thread'),
    channel: asString(raw.channel, 'atlas'),
    last_request_state: asString(raw.lastRequestState ?? raw.last_request_state, 'idle'),
    message_count: asNumber(raw.messageCount ?? raw.message_count, 0),
    created_at: toIso(raw.createdAt ?? raw.created_at),
    updated_at: toIso(raw.updatedAt ?? raw.updated_at),
  };
}

function normaliseMessage(userId: string, raw: Record<string, unknown>): ChatMessageRow | null {
  const messageId = asString(raw.messageId ?? raw.message_id);
  const threadId = asString(raw.threadId ?? raw.thread_id);
  if (!messageId || !threadId) return null;
  const modelUsed = raw.modelUsed ?? raw.model_used;
  return {
    user_id: userId,
    thread_id: threadId,
    message_id: messageId,
    role: asString(raw.role, 'user'),
    content: asString(raw.content, ''),
    request_state: asString(raw.requestState ?? raw.request_state, 'idle'),
    model_used: typeof modelUsed === 'string' ? modelUsed : null,
    created_at: toIso(raw.createdAt ?? raw.created_at),
  };
}

async function upsertThread(row: ChatThreadRow): Promise<ChatThreadRow | null> {
  const result = await supabaseRest<ChatThreadRow[]>(
    'POST',
    'chat_threads',
    row,
    { Prefer: 'resolution=merge-duplicates,return=representation' },
  );
  if (!result.ok || !result.data || result.data.length === 0) return null;
  return result.data[0];
}

async function upsertMessage(row: ChatMessageRow): Promise<ChatMessageRow | null> {
  const result = await supabaseRest<ChatMessageRow[]>(
    'POST',
    'chat_messages',
    row,
    { Prefer: 'resolution=merge-duplicates,return=representation' },
  );
  if (!result.ok || !result.data || result.data.length === 0) return null;
  return result.data[0];
}

async function bulkUpsertThreads(rows: ChatThreadRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const result = await supabaseRest<ChatThreadRow[]>(
    'POST',
    'chat_threads',
    rows,
    { Prefer: 'resolution=merge-duplicates,return=representation' },
  );
  return result.ok && result.data ? result.data.length : 0;
}

async function bulkUpsertMessages(rows: ChatMessageRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const result = await supabaseRest<ChatMessageRow[]>(
    'POST',
    'chat_messages',
    rows,
    { Prefer: 'resolution=merge-duplicates,return=representation' },
  );
  return result.ok && result.data ? result.data.length : 0;
}

// ---------------------------------------------------------------------------
// Route registration — mounted under the /v1 prefix via index.ts
// ---------------------------------------------------------------------------

export function registerChatHistoryRoutes(app: FastifyInstance): void {
  // ── GET /v1/chat/threads ──────────────────────────────────────────────
  app.get('/v1/chat/threads', {
    config: { rateLimit: RATE_LIMITS.readUser },
  }, async (request, reply) => {
    const session = requireSession(request, reply);
    if (!session) return;

    const q = request.query as { limit?: string; before?: string } | undefined;
    const limit = Math.min(Math.max(Number(q?.limit ?? 50) || 50, 1), 100);

    const params = new URLSearchParams();
    params.set('user_id', `eq.${session.userId}`);
    params.set('deleted_at', 'is.null');
    params.set('order', 'updated_at.desc');
    params.set('limit', String(limit));
    if (q?.before) {
      const iso = toIso(q.before);
      params.set('updated_at', `lt.${iso}`);
    }

    const result = await supabaseRest<ChatThreadRow[]>(
      'GET',
      `chat_threads?${params.toString()}`,
    );
    if (!result.ok) {
      return reply.status(502).send({ error: 'storage_unavailable' });
    }
    return reply.send({ threads: result.data ?? [] });
  });

  // ── POST /v1/chat/threads ─────────────────────────────────────────────
  app.post('/v1/chat/threads', {
    config: { rateLimit: RATE_LIMITS.writeUser },
  }, async (request, reply) => {
    const session = requireSession(request, reply);
    if (!session) return;

    const body = (request.body ?? {}) as Record<string, unknown>;
    const row = normaliseThread(session.userId, body);
    if (!row) {
      return reply.status(400).send({ error: 'invalid_body', message: 'threadId required' });
    }

    const saved = await upsertThread(row);
    if (!saved) {
      return reply.status(502).send({ error: 'persistence_failed' });
    }
    return reply.send({ thread: saved });
  });

  // ── DELETE /v1/chat/threads/:threadId ─────────────────────────���───────
  app.delete('/v1/chat/threads/:threadId', {
    config: { rateLimit: RATE_LIMITS.writeUser },
  }, async (request, reply) => {
    const session = requireSession(request, reply);
    if (!session) return;

    const { threadId } = request.params as { threadId?: string };
    if (!threadId) {
      return reply.status(400).send({ error: 'invalid_params' });
    }

    const now = new Date().toISOString();
    const path =
      `chat_threads?thread_id=eq.${encodeURIComponent(threadId)}` +
      `&user_id=eq.${encodeURIComponent(session.userId)}`;
    const result = await supabaseRest('PATCH', path, { deleted_at: now });
    if (!result.ok) {
      return reply.status(502).send({ error: 'persistence_failed' });
    }
    return reply.status(204).send();
  });

  // ── GET /v1/chat/threads/:threadId/messages ───────────────────────────
  app.get('/v1/chat/threads/:threadId/messages', {
    config: { rateLimit: RATE_LIMITS.readUser },
  }, async (request, reply) => {
    const session = requireSession(request, reply);
    if (!session) return;

    const { threadId } = request.params as { threadId?: string };
    if (!threadId) {
      return reply.status(400).send({ error: 'invalid_params' });
    }

    const params = new URLSearchParams();
    params.set('user_id', `eq.${session.userId}`);
    params.set('thread_id', `eq.${threadId}`);
    params.set('deleted_at', 'is.null');
    params.set('order', 'created_at.asc');
    params.set('limit', '1000');

    const result = await supabaseRest<ChatMessageRow[]>(
      'GET',
      `chat_messages?${params.toString()}`,
    );
    if (!result.ok) {
      return reply.status(502).send({ error: 'storage_unavailable' });
    }
    return reply.send({ messages: result.data ?? [] });
  });

  // ── POST /v1/chat/messages ────────────────────────────────────────────
  app.post('/v1/chat/messages', {
    config: { rateLimit: RATE_LIMITS.writeUser },
  }, async (request, reply) => {
    const session = requireSession(request, reply);
    if (!session) return;

    const body = (request.body ?? {}) as Record<string, unknown>;
    const row = normaliseMessage(session.userId, body);
    if (!row) {
      return reply.status(400).send({ error: 'invalid_body', message: 'messageId and threadId required' });
    }

    const saved = await upsertMessage(row);
    if (!saved) {
      return reply.status(502).send({ error: 'persistence_failed' });
    }
    return reply.send({ message: saved });
  });

  // ── POST /v1/chat/sync ────────────────────────────────────────────────
  // Bulk upsert for initial hydration from IndexedDB on login.
  app.post('/v1/chat/sync', {
    config: { rateLimit: RATE_LIMITS.writeUser },
  }, async (request, reply) => {
    const session = requireSession(request, reply);
    if (!session) return;

    const body = (request.body ?? {}) as {
      threads?: unknown[];
      messages?: unknown[];
    };

    const threadRows: ChatThreadRow[] = Array.isArray(body.threads)
      ? body.threads
          .map((t) => normaliseThread(session.userId, (t ?? {}) as Record<string, unknown>))
          .filter((r): r is ChatThreadRow => r !== null)
      : [];
    const messageRows: ChatMessageRow[] = Array.isArray(body.messages)
      ? body.messages
          .map((m) => normaliseMessage(session.userId, (m ?? {}) as Record<string, unknown>))
          .filter((r): r is ChatMessageRow => r !== null)
      : [];

    // Supabase REST has practical payload limits; chunk at 500 rows per call.
    const CHUNK = 500;
    let threadsSynced = 0;
    for (let i = 0; i < threadRows.length; i += CHUNK) {
      threadsSynced += await bulkUpsertThreads(threadRows.slice(i, i + CHUNK));
    }
    let messagesSynced = 0;
    for (let i = 0; i < messageRows.length; i += CHUNK) {
      messagesSynced += await bulkUpsertMessages(messageRows.slice(i, i + CHUNK));
    }

    return reply.send({
      synced: { threads: threadsSynced, messages: messagesSynced },
    });
  });
}
