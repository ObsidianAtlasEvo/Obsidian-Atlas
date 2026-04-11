/**
 * Atlas Goal Memory
 * Phase 2 Governance
 *
 * Persistent model of what the user is trying to do over time.
 * Distinct from trait memory (who they are) — this is mission memory (what they're building).
 */

export type GoalStatus = 'active' | 'paused' | 'completed' | 'abandoned' | 'blocked';
export type LoopStatus = 'open' | 'resolved' | 'deferred' | 'expired';
export type DecisionOutcome = 'made' | 'deferred' | 'reversed';

export interface Goal {
  id: string;
  userId: string;
  title: string;
  description: string;
  domain: string; // e.g. 'career', 'creative', 'personal', 'strategic'
  status: GoalStatus;
  priority: 1 | 2 | 3; // 1 = highest
  createdAt: string;
  updatedAt: string;
  blockers: string[];
  linkedProjectIds: string[];
  linkedLoopIds: string[];
  progressNotes: string[];
}

export interface Project {
  id: string;
  userId: string;
  title: string;
  description: string;
  goalId: string | null;
  status: 'active' | 'completed' | 'abandoned';
  createdAt: string;
  updatedAt: string;
  milestones: Array<{ label: string; completedAt: string | null }>;
}

export interface OpenLoop {
  id: string;
  userId: string;
  description: string;
  context: string;
  status: LoopStatus;
  createdAt: string;
  deferredUntil?: string;
  resolution?: string;
  linkedGoalId?: string;
}

export interface MissionDecision {
  id: string;
  userId: string;
  question: string;
  outcome: DecisionOutcome;
  rationale: string;
  madeAt: string;
  reversedAt?: string;
  linkedGoalId?: string;
}

export interface AbandonedPath {
  id: string;
  userId: string;
  description: string;
  originalGoalId?: string;
  abandonedAt: string;
  reason: string;
  preservedContext: string; // why it was worth doing before
}

// ── In-memory stores (back with IndexedDB via stateVersionManager in production) ──

const goalStore: Map<string, Goal[]> = new Map();
const projectStore: Map<string, Project[]> = new Map();
const loopStore: Map<string, OpenLoop[]> = new Map();
const decisionStore: Map<string, MissionDecision[]> = new Map();
const abandonedStore: Map<string, AbandonedPath[]> = new Map();

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── Goals ──

export function addGoal(userId: string, partial: Omit<Goal, 'id' | 'userId' | 'createdAt' | 'updatedAt'>): Goal {
  const goal: Goal = {
    ...partial,
    id: `goal-${uid()}`,
    userId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (!goalStore.has(userId)) goalStore.set(userId, []);
  goalStore.get(userId)!.push(goal);
  return goal;
}

export function updateGoal(userId: string, goalId: string, patch: Partial<Goal>): Goal | null {
  const goals = goalStore.get(userId) ?? [];
  const goal = goals.find((g) => g.id === goalId);
  if (!goal) return null;
  Object.assign(goal, patch, { updatedAt: new Date().toISOString() });
  return goal;
}

export function getActiveGoals(userId: string): Goal[] {
  return (goalStore.get(userId) ?? []).filter((g) => g.status === 'active');
}

export function getAllGoals(userId: string): Goal[] {
  return [...(goalStore.get(userId) ?? [])];
}

// ── Projects ──

export function addProject(userId: string, partial: Omit<Project, 'id' | 'userId' | 'createdAt' | 'updatedAt'>): Project {
  const project: Project = {
    ...partial,
    id: `proj-${uid()}`,
    userId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (!projectStore.has(userId)) projectStore.set(userId, []);
  projectStore.get(userId)!.push(project);
  return project;
}

export function getActiveProjects(userId: string): Project[] {
  return (projectStore.get(userId) ?? []).filter((p) => p.status === 'active');
}

// ── Open Loops ──

export function addOpenLoop(userId: string, partial: Omit<OpenLoop, 'id' | 'userId' | 'createdAt'>): OpenLoop {
  const loop: OpenLoop = {
    ...partial,
    id: `loop-${uid()}`,
    userId,
    createdAt: new Date().toISOString(),
  };
  if (!loopStore.has(userId)) loopStore.set(userId, []);
  loopStore.get(userId)!.push(loop);
  return loop;
}

export function resolveLoop(userId: string, loopId: string, resolution: string): boolean {
  const loops = loopStore.get(userId) ?? [];
  const loop = loops.find((l) => l.id === loopId);
  if (!loop) return false;
  loop.status = 'resolved';
  loop.resolution = resolution;
  return true;
}

export function getOpenLoops(userId: string): OpenLoop[] {
  return (loopStore.get(userId) ?? []).filter((l) => l.status === 'open');
}

// ── Decisions ──

export function recordDecision(
  userId: string,
  partial: Omit<MissionDecision, 'id' | 'userId' | 'madeAt'>
): MissionDecision {
  const decision: MissionDecision = {
    ...partial,
    id: `dec-${uid()}`,
    userId,
    madeAt: new Date().toISOString(),
  };
  if (!decisionStore.has(userId)) decisionStore.set(userId, []);
  decisionStore.get(userId)!.push(decision);
  return decision;
}

export function getDecisions(userId: string): MissionDecision[] {
  return [...(decisionStore.get(userId) ?? [])];
}

// ── Abandoned Paths ──

export function recordAbandonedPath(
  userId: string,
  partial: Omit<AbandonedPath, 'id' | 'userId' | 'abandonedAt'>
): AbandonedPath {
  const path: AbandonedPath = {
    ...partial,
    id: `abandoned-${uid()}`,
    userId,
    abandonedAt: new Date().toISOString(),
  };
  if (!abandonedStore.has(userId)) abandonedStore.set(userId, []);
  abandonedStore.get(userId)!.push(path);
  return path;
}

export function getAbandonedPaths(userId: string): AbandonedPath[] {
  return [...(abandonedStore.get(userId) ?? [])];
}

/**
 * Produce a mission summary for injection into Atlas context.
 */
export function getMissionContext(userId: string): string {
  const goals = getActiveGoals(userId);
  const loops = getOpenLoops(userId);
  const projects = getActiveProjects(userId);

  const parts: string[] = [];

  if (goals.length > 0) {
    parts.push(
      `Active goals: ${goals
        .sort((a, b) => a.priority - b.priority)
        .map((g) => `[P${g.priority}] ${g.title}`)
        .join('; ')}`
    );
  }

  if (projects.length > 0) {
    parts.push(`Active projects: ${projects.map((p) => p.title).join('; ')}`);
  }

  if (loops.length > 0) {
    parts.push(`Open loops: ${loops.map((l) => l.description).join('; ')}`);
  }

  return parts.join('\n');
}
