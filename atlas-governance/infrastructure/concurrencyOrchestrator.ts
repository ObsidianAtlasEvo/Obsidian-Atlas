/**
 * Atlas Concurrency Orchestrator
 * Phase 2 Governance
 *
 * Priority queue, mutex rules, and debounced flush
 * to prevent race conditions between governance subsystems.
 */

import { AtlasEventBus } from './eventBus';

export type TaskPriority = 1 | 2 | 3 | 4 | 5; // 1 = highest

export interface OrchestratedTask {
  id: string;
  name: string;
  priority: TaskPriority;
  userId: string;
  fn: () => Promise<void>;
  enqueuedAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

type MutexKey = string;

class PriorityQueue<T extends { priority: TaskPriority }> {
  private items: T[] = [];

  enqueue(item: T): void {
    this.items.push(item);
    this.items.sort((a, b) => a.priority - b.priority);
  }

  dequeue(): T | undefined {
    return this.items.shift();
  }

  get size(): number {
    return this.items.length;
  }

  peek(): T | undefined {
    return this.items[0];
  }
}

class AtlasConcurrencyOrchestratorImpl {
  private readonly queue = new PriorityQueue<OrchestratedTask>();
  private readonly mutexes: Map<MutexKey, boolean> = new Map();
  private readonly debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private isProcessing = false;
  private readonly completedTasks: OrchestratedTask[] = [];

  /**
   * Enqueue a task with a given priority.
   * Priority 1 = constitution validation (highest)
   * Priority 2 = mutation commits
   * Priority 3 = evidence/claim updates
   * Priority 4 = evolution engine flush
   * Priority 5 = graph/visualization updates (lowest)
   */
  enqueue(
    name: string,
    userId: string,
    priority: TaskPriority,
    fn: () => Promise<void>
  ): string {
    const task: OrchestratedTask = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      priority,
      userId,
      fn,
      enqueuedAt: new Date().toISOString(),
    };
    this.queue.enqueue(task);
    void this.processNext();
    return task.id;
  }

  /**
   * Debounce a task — multiple calls within the window collapse into one.
   * Used for the 30s evolution engine flush and graph updates.
   */
  debounce(
    key: string,
    userId: string,
    priority: TaskPriority,
    fn: () => Promise<void>,
    delayMs: number
  ): void {
    const existing = this.debounceTimers.get(key);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.debounceTimers.delete(key);
      this.enqueue(key, userId, priority, fn);
    }, delayMs);

    this.debounceTimers.set(key, timer);
  }

  /**
   * Acquire a mutex — prevents concurrent access to a shared resource.
   * Returns false if already held; true if acquired.
   */
  acquireMutex(key: MutexKey): boolean {
    if (this.mutexes.get(key)) return false;
    this.mutexes.set(key, true);
    return true;
  }

  releaseMutex(key: MutexKey): void {
    this.mutexes.delete(key);
  }

  /**
   * Mutex-guarded execution — skips if mutex is held.
   */
  async withMutex<T>(key: MutexKey, fn: () => Promise<T>): Promise<T | null> {
    if (!this.acquireMutex(key)) return null;
    try {
      return await fn();
    } finally {
      this.releaseMutex(key);
    }
  }

  private async processNext(): Promise<void> {
    if (this.isProcessing) return;
    const task = this.queue.dequeue();
    if (!task) return;

    this.isProcessing = true;
    task.startedAt = new Date().toISOString();

    try {
      await task.fn();
      task.completedAt = new Date().toISOString();
    } catch (err) {
      task.error = err instanceof Error ? err.message : String(err);
      AtlasEventBus.emit('SUBSYSTEM_HEALTH_CHANGED', task.userId, {
        subsystem: task.name,
        error: task.error,
      }, 'concurrencyOrchestrator');
    } finally {
      this.completedTasks.push(task);
      if (this.completedTasks.length > 500) this.completedTasks.shift(); // cap history
      this.isProcessing = false;
      void this.processNext();
    }
  }

  getQueueDepth(): number {
    return this.queue.size;
  }

  getRecentTasks(limit = 20): OrchestratedTask[] {
    return this.completedTasks.slice(-limit);
  }
}

export const ConcurrencyOrchestrator = new AtlasConcurrencyOrchestratorImpl();

// Predefined commit-order rules for governance systems:
// 1. Constitution validation must complete before mutation commit
// 2. Mutation commit must complete before evolution flush
// 3. Evidence updates must complete before overseer rewrite
// 4. All of the above before graph/visualization updates

export const ORCHESTRATION_PRIORITIES = {
  CONSTITUTION_VALIDATION: 1 as TaskPriority,
  MUTATION_COMMIT: 2 as TaskPriority,
  EVIDENCE_UPDATE: 2 as TaskPriority,
  GOAL_MEMORY_WRITE: 2 as TaskPriority,
  EVOLUTION_FLUSH: 3 as TaskPriority,
  IDENTITY_RESOLUTION: 3 as TaskPriority,
  OVERSEER_REWRITE: 4 as TaskPriority,
  GRAPH_UPDATE: 5 as TaskPriority,
  VISUALIZATION_UPDATE: 5 as TaskPriority,
} as const;
