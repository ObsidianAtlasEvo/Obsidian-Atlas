/**
 * ConcurrencyOrchestrator
 *
 * Prevents race conditions across the evolution engine's parallel systems.
 *
 * Design:
 *  - Per-user task queues with priority ordering
 *  - Dependency graph ensures tasks run after their prerequisites
 *  - Debounced enqueue coalesces duplicate task types within a window
 *  - Hard concurrency cap (3) per user to prevent runaway parallelism
 *  - Certain task pairs are mutually exclusive (e.g. mutation.commit vs overseer.evaluate)
 *
 * Priority rules (lower number = higher priority):
 *   1: mutation.commit, overseer.evaluate, mutation.validate
 *   2: signal.flush, trait.extract, resonance.generate, profile.save
 *   3: goal.detect, evaluation.run
 *   4: evidence.decay, concept.hygiene
 */

import { AtlasEventBus } from './eventBus.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TaskPriority = 1 | 2 | 3 | 4 | 5; // 1 = highest

export type TaskType =
  | 'signal.flush'         // priority 2 — process pending signals
  | 'trait.extract'        // priority 2 — runs after signal.flush
  | 'mutation.validate'    // priority 1 — constitutional check
  | 'mutation.commit'      // priority 1 — MUST complete before next response
  | 'profile.save'         // priority 2
  | 'overseer.evaluate'    // priority 1 — blocks response delivery
  | 'evidence.decay'       // priority 4 — background, non-urgent
  | 'concept.hygiene'      // priority 4 — background graph cleanup
  | 'goal.detect'          // priority 3
  | 'evaluation.run'       // priority 3
  | 'resonance.generate';  // priority 2

export interface OrchestrationTask {
  id: string;
  userId: string;
  type: TaskType;
  priority: TaskPriority;
  payload: unknown;
  enqueuedAt: number;
  startedAt?: number;
  completedAt?: number;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  /** Task IDs that must complete before this one starts */
  dependencies: string[];
  /** Milliseconds before a running task is forcibly killed */
  timeout: number;
  retryCount: number;
  maxRetries: number;
}

export type TaskExecutor = (task: OrchestrationTask) => Promise<void>;

interface CompletedTaskRecord {
  id: string;
  type: TaskType;
  status: 'completed' | 'failed' | 'cancelled';
  completedAt: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default priorities per task type */
const TASK_PRIORITY: Record<TaskType, TaskPriority> = {
  'mutation.commit':    1,
  'overseer.evaluate':  1,
  'mutation.validate':  1,
  'signal.flush':       2,
  'trait.extract':      2,
  'resonance.generate': 2,
  'profile.save':       2,
  'goal.detect':        3,
  'evaluation.run':     3,
  'evidence.decay':     4,
  'concept.hygiene':    4,
};

/** Default timeouts per task type (ms) */
const TASK_TIMEOUT: Record<TaskType, number> = {
  'mutation.commit':    15_000,
  'overseer.evaluate':  10_000,
  'mutation.validate':  10_000,
  'signal.flush':       20_000,
  'trait.extract':      15_000,
  'resonance.generate': 30_000,
  'profile.save':        5_000,
  'goal.detect':        10_000,
  'evaluation.run':     30_000,
  'evidence.decay':     60_000,
  'concept.hygiene':    60_000,
};

/** Default max retries per task type */
const TASK_MAX_RETRIES: Record<TaskType, number> = {
  'mutation.commit':    1,
  'overseer.evaluate':  1,
  'mutation.validate':  2,
  'signal.flush':       3,
  'trait.extract':      2,
  'resonance.generate': 1,
  'profile.save':       3,
  'goal.detect':        2,
  'evaluation.run':     1,
  'evidence.decay':     0,
  'concept.hygiene':    0,
};

/**
 * Mutual exclusion pairs: if task type A is running, task type B cannot start.
 * Expressed as a map: type → set of types that block it.
 */
const MUTEX_RULES: Partial<Record<TaskType, TaskType[]>> = {
  'mutation.commit':   ['overseer.evaluate'],
  'overseer.evaluate': ['mutation.commit'],
};

/**
 * Background tasks only run when all other queues are empty.
 */
const BACKGROUND_TASK_TYPES = new Set<TaskType>(['evidence.decay', 'concept.hygiene']);

const MAX_CONCURRENT_PER_USER = 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// ConcurrencyOrchestrator
// ---------------------------------------------------------------------------

export class ConcurrencyOrchestrator {
  /** userId → ordered list of queued tasks */
  private queues: Map<string, OrchestrationTask[]> = new Map();

  /** userId → set of currently running task IDs */
  private running: Map<string, Set<string>> = new Map();

  /** userId → map of all tasks (queued, running, completed, failed) */
  private allTasks: Map<string, Map<string, OrchestrationTask>> = new Map();

  /** Completed/failed task records (for dependency resolution) */
  private completedRecords: Map<string, CompletedTaskRecord[]> = new Map();

  /** Debounce timers keyed by `${userId}:${taskType}` */
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  /** Pending debounced task descriptors keyed by `${userId}:${taskType}` */
  private debouncePending: Map<
    string,
    Omit<OrchestrationTask, 'id' | 'enqueuedAt' | 'status' | 'retryCount'>
  > = new Map();

  /** Registered executors keyed by task type */
  private executors: Map<TaskType, TaskExecutor> = new Map();

  private maxConcurrentPerUser: number = MAX_CONCURRENT_PER_USER;

  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------

  /**
   * Register a function that will actually execute a task of a given type.
   * The orchestrator manages scheduling; executors handle the work.
   */
  registerExecutor(type: TaskType, executor: TaskExecutor): void {
    this.executors.set(type, executor);
  }

  // -------------------------------------------------------------------------
  // Enqueue
  // -------------------------------------------------------------------------

  /**
   * Add a task to the queue for a user.
   * Inserts in priority order (priority 1 tasks go to the front).
   * Returns the generated task ID.
   */
  enqueue(
    task: Omit<OrchestrationTask, 'id' | 'enqueuedAt' | 'status' | 'retryCount'>,
  ): string {
    const id = generateId();
    const fullTask: OrchestrationTask = {
      ...task,
      id,
      priority: task.priority ?? TASK_PRIORITY[task.type],
      timeout: task.timeout ?? TASK_TIMEOUT[task.type],
      maxRetries: task.maxRetries ?? TASK_MAX_RETRIES[task.type],
      enqueuedAt: Date.now(),
      status: 'queued',
      retryCount: 0,
    };

    this.ensureUserStructures(task.userId);

    // Insert into priority-sorted queue
    const queue = this.queues.get(task.userId)!;
    const insertIdx = queue.findIndex((t) => t.priority > fullTask.priority);
    if (insertIdx === -1) {
      queue.push(fullTask);
    } else {
      queue.splice(insertIdx, 0, fullTask);
    }

    // Track in allTasks map
    this.allTasks.get(task.userId)!.set(id, fullTask);

    // Try to schedule immediately
    this.scheduleNext(task.userId);

    return id;
  }

  /**
   * Debounced enqueue — coalesces multiple calls for the same (userId, taskType)
   * within `debounceMs`. The most recent payload wins.
   *
   * Used for `signal.flush` to avoid hammering on rapid messages.
   * Returns the (eventual) task ID placeholder; the real ID is assigned on commit.
   */
  enqueueDebounced(
    task: Omit<OrchestrationTask, 'id' | 'enqueuedAt' | 'status' | 'retryCount'>,
    debounceMs: number,
  ): string {
    const key = `${task.userId}:${task.type}`;

    // Store the latest version of the task
    this.debouncePending.set(key, task);

    // Clear existing timer
    const existing = this.debounceTimers.get(key);
    if (existing) clearTimeout(existing);

    // Allocate a placeholder ID to return immediately
    const placeholderId = generateId();

    const timer = setTimeout(() => {
      this.debounceTimers.delete(key);
      const pending = this.debouncePending.get(key);
      this.debouncePending.delete(key);
      if (pending) {
        this.enqueue(pending);
      }
    }, debounceMs);

    this.debounceTimers.set(key, timer);

    return placeholderId;
  }

  // -------------------------------------------------------------------------
  // Scheduling
  // -------------------------------------------------------------------------

  /** Try to start as many eligible tasks as the concurrency cap allows */
  private scheduleNext(userId: string): void {
    const queue = this.queues.get(userId);
    if (!queue || queue.length === 0) return;

    const runningSet = this.running.get(userId)!;

    // Respect global concurrency cap
    if (runningSet.size >= this.maxConcurrentPerUser) return;

    // Collect currently running task types for mutex checks
    const runningTypes = new Set<TaskType>();
    for (const runningId of runningSet) {
      const t = this.allTasks.get(userId)?.get(runningId);
      if (t) runningTypes.add(t.type);
    }

    // Find first eligible task in priority-sorted queue
    for (let i = 0; i < queue.length; i++) {
      const task = queue[i];

      // Background tasks only run when queue is otherwise empty
      if (BACKGROUND_TASK_TYPES.has(task.type)) {
        const hasNonBackground = queue.some(
          (t, idx) => idx !== i && !BACKGROUND_TASK_TYPES.has(t.type),
        );
        if (hasNonBackground || runningTypes.size > 0) continue;
      }

      // Check dependencies
      if (!this.areDependenciesMet(task, userId)) continue;

      // Check mutex rules
      const blockedBy = MUTEX_RULES[task.type];
      if (blockedBy && blockedBy.some((t) => runningTypes.has(t))) continue;

      // Eligible — remove from queue, mark running
      queue.splice(i, 1);
      task.status = 'running';
      task.startedAt = Date.now();
      runningSet.add(task.id);
      runningTypes.add(task.type);

      // Execute asynchronously
      this.runTask(userId, task).catch(console.error);

      // Try to fill remaining slots
      if (runningSet.size < this.maxConcurrentPerUser && queue.length > 0) {
        // Schedule again after current iteration (microtask) to avoid re-entry issues
        Promise.resolve().then(() => this.scheduleNext(userId));
      }

      break; // We only start one per scheduleNext call to keep priority ordering correct
    }
  }

  /** Execute a single task with timeout and retry logic */
  private async runTask(userId: string, task: OrchestrationTask): Promise<void> {
    const executor = this.executors.get(task.type);

    const finish = (status: 'completed' | 'failed') => {
      task.status = status;
      task.completedAt = Date.now();
      this.running.get(userId)?.delete(task.id);

      // Record completion for dependency resolution
      const records = this.completedRecords.get(userId) ?? [];
      records.push({ id: task.id, type: task.type, status, completedAt: task.completedAt });
      this.completedRecords.set(userId, records);

      // Emit event
      try {
        const bus = AtlasEventBus.getInstance();
        bus.emit({
          type: status === 'completed' ? 'signal.processed' : 'bug.reported',
          userId,
          sessionId: 'system',
          source: 'concurrency-orchestrator',
          payload: {
            taskId: task.id,
            taskType: task.type,
            status,
            durationMs: task.completedAt - (task.startedAt ?? task.enqueuedAt),
            retryCount: task.retryCount,
          },
        });
      } catch {
        // Bus may not be initialized in tests
      }

      // Schedule next task for this user
      this.scheduleNext(userId);
    };

    if (!executor) {
      console.warn(`[ConcurrencyOrchestrator] No executor registered for task type: ${task.type}`);
      finish('failed');
      return;
    }

    // Wrap with timeout
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(
        () => reject(new Error(`Task ${task.type} timed out after ${task.timeout}ms`)),
        task.timeout,
      );
    });

    try {
      await Promise.race([executor(task), timeoutPromise]);
      if (timeoutHandle) clearTimeout(timeoutHandle);
      finish('completed');
    } catch (err) {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      console.error(`[ConcurrencyOrchestrator] Task ${task.type} (${task.id}) failed:`, err);

      if (task.retryCount < task.maxRetries) {
        // Re-enqueue with incremented retry count
        task.retryCount += 1;
        task.status = 'queued';
        this.running.get(userId)?.delete(task.id);

        const queue = this.queues.get(userId)!;
        const insertIdx = queue.findIndex((t) => t.priority > task.priority);
        if (insertIdx === -1) queue.push(task);
        else queue.splice(insertIdx, 0, task);

        // Exponential backoff before retry
        const backoffMs = Math.min(1000 * 2 ** (task.retryCount - 1), 30_000);
        setTimeout(() => this.scheduleNext(userId), backoffMs);
      } else {
        finish('failed');
      }
    }
  }

  // -------------------------------------------------------------------------
  // Dependency resolution
  // -------------------------------------------------------------------------

  /**
   * Returns true if all declared dependency task IDs have completed successfully.
   * Tasks with no dependencies are always eligible.
   */
  private areDependenciesMet(task: OrchestrationTask, userId: string): boolean {
    if (task.dependencies.length === 0) return true;

    const completed = this.completedRecords.get(userId) ?? [];
    const completedSuccessIds = new Set(
      completed.filter((r) => r.status === 'completed').map((r) => r.id),
    );

    return task.dependencies.every((depId) => completedSuccessIds.has(depId));
  }

  // -------------------------------------------------------------------------
  // Cancellation
  // -------------------------------------------------------------------------

  /**
   * Cancel all queued (not yet running) tasks for a user.
   * Optionally filter to specific task types.
   */
  cancelPending(userId: string, types?: TaskType[]): void {
    const queue = this.queues.get(userId);
    if (!queue) return;

    const cancelled: OrchestrationTask[] = [];
    const remaining: OrchestrationTask[] = [];

    for (const task of queue) {
      if (!types || types.includes(task.type)) {
        task.status = 'cancelled';
        task.completedAt = Date.now();
        cancelled.push(task);
      } else {
        remaining.push(task);
      }
    }

    this.queues.set(userId, remaining);

    // Record cancellations for dependency resolution
    const records = this.completedRecords.get(userId) ?? [];
    for (const t of cancelled) {
      records.push({ id: t.id, type: t.type, status: 'cancelled', completedAt: t.completedAt! });
    }
    this.completedRecords.set(userId, records);

    // Also cancel any pending debounce timers for the cancelled types
    if (types) {
      for (const type of types) {
        const key = `${userId}:${type}`;
        const timer = this.debounceTimers.get(key);
        if (timer) {
          clearTimeout(timer);
          this.debounceTimers.delete(key);
          this.debouncePending.delete(key);
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Status / Diagnostics
  // -------------------------------------------------------------------------

  getStatus(userId: string): { queued: number; running: number; completed: number } {
    return {
      queued:    this.queues.get(userId)?.length ?? 0,
      running:   this.running.get(userId)?.size ?? 0,
      completed: (this.completedRecords.get(userId) ?? []).filter((r) => r.status === 'completed').length,
    };
  }

  /**
   * Returns true if a task of the given type is currently running for the user.
   * Useful for the chat route to check if overseer.evaluate has finished.
   */
  isRunning(userId: string, type: TaskType): boolean {
    const runningSet = this.running.get(userId);
    if (!runningSet) return false;

    for (const id of runningSet) {
      const task = this.allTasks.get(userId)?.get(id);
      if (task?.type === type) return true;
    }
    return false;
  }

  /**
   * Wait until a specific task type is no longer running for a user.
   * Polls every `pollMs` milliseconds up to `timeoutMs`.
   * Used by the chat route to await overseer.evaluate completion.
   */
  async waitForCompletion(
    userId: string,
    type: TaskType,
    timeoutMs = 15_000,
    pollMs = 50,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!this.isRunning(userId, type) && !this.isQueued(userId, type)) return;
      await new Promise((r) => setTimeout(r, pollMs));
    }
    throw new Error(`Timed out waiting for ${type} to complete for user ${userId}`);
  }

  /** Returns true if a task of the given type is in the queue (not yet running) */
  isQueued(userId: string, type: TaskType): boolean {
    return (this.queues.get(userId) ?? []).some((t) => t.type === type);
  }

  // -------------------------------------------------------------------------
  // Convenience factory methods for common task patterns
  // -------------------------------------------------------------------------

  /**
   * Enqueue a signal.flush with the default 5-second debounce.
   * Called on every incoming message; rapid messages coalesce into one flush.
   */
  enqueueSignalFlush(userId: string, sessionId: string, payload: unknown): string {
    return this.enqueueDebounced(
      {
        userId,
        type: 'signal.flush',
        priority: TASK_PRIORITY['signal.flush'],
        payload: { sessionId, ...((payload as Record<string, unknown>) ?? {}) },
        dependencies: [],
        timeout: TASK_TIMEOUT['signal.flush'],
        maxRetries: TASK_MAX_RETRIES['signal.flush'],
      },
      5_000,
    );
  }

  /**
   * Enqueue a trait.extract that depends on a previously enqueued signal.flush task.
   */
  enqueueTraitExtract(userId: string, payload: unknown, dependsOnTaskId: string): string {
    return this.enqueue({
      userId,
      type: 'trait.extract',
      priority: TASK_PRIORITY['trait.extract'],
      payload,
      dependencies: [dependsOnTaskId],
      timeout: TASK_TIMEOUT['trait.extract'],
      maxRetries: TASK_MAX_RETRIES['trait.extract'],
    });
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private ensureUserStructures(userId: string): void {
    if (!this.queues.has(userId))          this.queues.set(userId, []);
    if (!this.running.has(userId))         this.running.set(userId, new Set());
    if (!this.allTasks.has(userId))        this.allTasks.set(userId, new Map());
    if (!this.completedRecords.has(userId)) this.completedRecords.set(userId, []);
  }
}
