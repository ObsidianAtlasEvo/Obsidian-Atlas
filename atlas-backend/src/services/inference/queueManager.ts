import { randomUUID } from 'node:crypto';
import type { FastifyReply } from 'fastify';

/**
 * Singleton GPU / Ollama serialization for multi-tenant SaaS on a single 70B-capable GPU.
 * Only one inference job runs at a time; others wait in FIFO order with observable queue depth.
 *
 * Client flow:
 * 1. Generate `requestId` (UUID) and open GET `/v1/inference/queue-stream?requestId=...&userId=...`
 * 2. POST `/v1/chat` with the same `requestId` + `userId` so waiters receive `queued` → `running` → `completed`.
 *
 * Persistence: pending jobs are written to the `atlas_inference_queue` Supabase table so
 * they survive server restarts. On startup call `loadPersistedJobs()`.
 */

export type GpuQueueEvent =
  | { type: 'awaiting' }
  | { type: 'queued'; position: number; ahead: number; totalWaiting: number }
  | { type: 'running' }
  | { type: 'completed' }
  | { type: 'failed'; message: string };

type JobRecord = {
  userId: string;
  requestId: string;
  execute: () => Promise<unknown>;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
};

/** Maximum number of pending jobs allowed in the queue. */
const MAX_PENDING_JOBS = 500;

const queueOrder: string[] = [];
const jobs = new Map<string, JobRecord>();
let processing = false;

const listeners = new Map<string, Set<(e: GpuQueueEvent) => void>>();

function emit(requestId: string, event: GpuQueueEvent): void {
  const set = listeners.get(requestId);
  if (!set) return;
  for (const fn of set) {
    try {
      fn(event);
    } catch {
      /* listener errors are non-fatal */
    }
  }
}

function broadcastQueuePositions(): void {
  const total = queueOrder.length;
  for (let i = 0; i < queueOrder.length; i++) {
    const id = queueOrder[i]!;
    emit(id, {
      type: 'queued',
      position: i + 1,
      ahead: i,
      totalWaiting: total,
    });
  }
}

async function pump(): Promise<void> {
  if (processing) return;
  const requestId = queueOrder[0];
  if (!requestId) return;

  const job = jobs.get(requestId);
  if (!job) {
    queueOrder.shift();
    void pump();
    return;
  }

  processing = true;
  emit(requestId, { type: 'running' });

  try {
    const result = await job.execute();
    job.resolve(result);
    emit(requestId, { type: 'completed' });
    void markJobComplete(requestId).catch(() => {});
  } catch (e) {
    job.reject(e);
    const message = e instanceof Error ? e.message : String(e);
    emit(requestId, { type: 'failed', message });
    void markJobComplete(requestId, message).catch(() => {});
  } finally {
    queueOrder.shift();
    jobs.delete(requestId);
    processing = false;
    broadcastQueuePositions();
    void pump();
  }
}

// ---------------------------------------------------------------------------
// Supabase persistence helpers (best-effort — failures do not block the queue)
// ---------------------------------------------------------------------------

function getSupabaseClient(): { from: (table: string) => Record<string, unknown> } | null {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  // Dynamic import would be ideal but we keep it sync-friendly.
  // We use global fetch to avoid a hard dependency on @supabase/supabase-js.
  return null; // See REST helpers below.
}

async function supabaseRest(
  method: string,
  path: string,
  body?: unknown
): Promise<{ ok: boolean; data?: unknown }> {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return { ok: false };

  try {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: method === 'POST' ? 'return=representation' : 'return=minimal',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) return { ok: false };
    const data = method === 'GET' || method === 'POST' ? await res.json() : undefined;
    return { ok: true, data };
  } catch {
    return { ok: false };
  }
}

/** Write a new job to Supabase `atlas_inference_queue`. */
export async function persistJob(requestId: string, userId: string, payload: unknown): Promise<void> {
  await supabaseRest('POST', 'atlas_inference_queue', {
    id: requestId,
    payload: payload ?? {},
    status: 'pending',
  });
}

/** Mark a job as completed (or failed) in Supabase. */
export async function markJobComplete(requestId: string, error?: string): Promise<void> {
  const status = error ? 'failed' : 'completed';
  const body: Record<string, unknown> = {
    status,
    completed_at: new Date().toISOString(),
  };
  if (error) body.error = error.slice(0, 4000);
  await supabaseRest('PATCH', `atlas_inference_queue?id=eq.${requestId}`, body);
}

/**
 * Load persisted pending jobs from Supabase on startup.
 * Because the original `execute` closure is lost on restart, we mark recovered jobs
 * as `failed` with reason `server_restart` so operators/UI can retry them.
 */
export async function loadPersistedJobs(): Promise<number> {
  const result = await supabaseRest(
    'GET',
    'atlas_inference_queue?status=in.%28pending%2Cin_progress%29&order=created_at.asc'
  );
  if (!result.ok || !Array.isArray(result.data)) return 0;

  let recovered = 0;
  for (const row of result.data as Array<{ id: string }>) {
    await supabaseRest('PATCH', `atlas_inference_queue?id=eq.${row.id}`, {
      status: 'failed',
      error: 'server_restart',
      completed_at: new Date().toISOString(),
    });
    recovered++;
  }
  return recovered;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Enqueue a single Ollama (or other GPU-bound) task. FIFO per process; strictly serial execution.
 * Returns a rejected promise with `queue_full` if the queue exceeds MAX_PENDING_JOBS.
 */
export function enqueueGpuTask<T>(userId: string, requestId: string, execute: () => Promise<T>): Promise<T> {
  if (jobs.has(requestId) || queueOrder.includes(requestId)) {
    return Promise.reject(new Error(`duplicate requestId: ${requestId}`));
  }

  if (queueOrder.length >= MAX_PENDING_JOBS) {
    return Promise.reject(new Error('queue_full'));
  }

  // Best-effort persist
  void persistJob(requestId, userId, { requestId, userId }).catch(() => {});

  return new Promise<T>((resolve, reject) => {
    jobs.set(requestId, {
      userId,
      requestId,
      execute: () => execute() as Promise<unknown>,
      resolve: (v) => resolve(v as T),
      reject,
    });
    queueOrder.push(requestId);
    broadcastQueuePositions();
    void pump();
  });
}

export function subscribeGpuQueue(requestId: string, handler: (e: GpuQueueEvent) => void): () => void {
  let set = listeners.get(requestId);
  if (!set) {
    set = new Set();
    listeners.set(requestId, set);
  }
  set.add(handler);

  const replay = (): void => {
    const idx = queueOrder.indexOf(requestId);
    if (idx >= 0) {
      handler({
        type: 'queued',
        position: idx + 1,
        ahead: idx,
        totalWaiting: queueOrder.length,
      });
      return;
    }
    const job = jobs.get(requestId);
    if (job && processing && queueOrder[0] === requestId) {
      handler({ type: 'running' });
    }
  };
  queueMicrotask(replay);

  return () => {
    const s = listeners.get(requestId);
    if (!s) return;
    s.delete(handler);
    if (s.size === 0) listeners.delete(requestId);
  };
}

/** Fresh id when the client does not supply one. */
export function newGpuRequestId(): string {
  return randomUUID();
}

/**
 * Write Server-Sent Events for one inference request until terminal state.
 */
export function pipeGpuQueueSse(reply: FastifyReply, requestId: string, userId: string): void {
  const existing = jobs.get(requestId);
  if (existing && existing.userId !== userId) {
    reply.status(403).send({ error: 'request_user_mismatch' });
    return;
  }

  reply.hijack();
  const res = reply.raw;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const write = (event: GpuQueueEvent): void => {
    res.write(`event: gpu\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  let awaitCleared = false;
  const clearAwaitIfRegistered = (): void => {
    if (awaitCleared) return;
    if (jobs.has(requestId) || queueOrder.includes(requestId)) {
      awaitCleared = true;
      clearInterval(awaitPoll);
    }
  };

  const awaitPoll = setInterval(() => {
    clearAwaitIfRegistered();
    if (!awaitCleared) {
      write({ type: 'awaiting' });
    }
  }, 2500);

  const unsub = subscribeGpuQueue(requestId, (e) => {
    clearAwaitIfRegistered();
    write(e);
    if (e.type === 'completed' || e.type === 'failed') {
      unsub();
      clearInterval(awaitPoll);
      clearInterval(keepAlive);
      res.end();
    }
  });

  const keepAlive = setInterval(() => {
    res.write(`: ping\n\n`);
  }, 15000);

  res.on('close', () => {
    clearInterval(awaitPoll);
    clearInterval(keepAlive);
    unsub();
  });
}

export const gpuQueueManager = {
  enqueue: enqueueGpuTask,
  subscribe: subscribeGpuQueue,
  newRequestId: newGpuRequestId,
  pipeSse: pipeGpuQueueSse,
  loadPersistedJobs,
  MAX_PENDING_JOBS,
};
