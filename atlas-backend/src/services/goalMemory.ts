import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GoalStatus = 'active' | 'paused' | 'completed' | 'abandoned' | 'blocked';
export type ProjectStatus = 'active' | 'incubating' | 'on_hold' | 'shipped' | 'cancelled';
export type LoopStatus = 'open' | 'in_progress' | 'resolved' | 'deliberately_left_open';
export type DecisionFinality = 'tentative' | 'committed' | 'reversed' | 'under_review';

export interface Goal {
  id: string;
  userId: string;
  title: string;
  description: string;
  status: GoalStatus;
  horizon: 'immediate' | 'short_term' | 'long_term' | 'life_level';
  createdAt: number;
  updatedAt: number;
  lastMentionedAt: number;
  mentionCount: number;         // how many times user has referenced this
  relatedProjectIds: string[];
  blockers: Blocker[];
  progress: number;             // 0-1, user-reported or Atlas-inferred
  atlasObservation: string;     // what Atlas has noticed about this goal
  autoDetected: boolean;        // did Atlas detect this from conversation, or did user set it?
  confidenceInAutoDetection: number;
}

export interface Project {
  id: string;
  userId: string;
  name: string;
  description: string;
  status: ProjectStatus;
  domain: string;
  createdAt: number;
  updatedAt: number;
  lastActiveAt: number;
  relatedGoalIds: string[];
  openLoops: OpenLoop[];
  decisions: Decision[];
  abandonedPaths: AbandonedPath[];
  keyEntities: string[];        // people, tools, concepts central to this project
  atlasContext: string;         // Atlas's running summary of this project
  sessionReferences: string[];  // session IDs where this project was discussed
}

export interface OpenLoop {
  id: string;
  projectId: string;
  description: string;
  status: LoopStatus;
  openedAt: number;
  resolvedAt?: number;
  resolution?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  atlasFlag: boolean;           // Atlas flagged this as important
}

export interface Decision {
  id: string;
  projectId: string;
  description: string;
  finality: DecisionFinality;
  madeAt: number;
  reasoning: string;
  alternatives: string[];
  reversalCount: number;
  atlasAssessment: string;      // Atlas's view on this decision
}

export interface AbandonedPath {
  id: string;
  projectId: string;
  description: string;
  abandonedAt: number;
  reason: string;
  retrievable: boolean;         // could this be worth revisiting?
}

export interface Blocker {
  id: string;
  description: string;
  severity: 'minor' | 'moderate' | 'critical';
  since: number;
  resolved: boolean;
}

export interface MissionState {
  userId: string;
  goals: Goal[];
  projects: Project[];
  lastSyncedAt: number;
  atlasActiveFocus: string | null;  // what Atlas thinks the user's current primary focus is
}

// ---------------------------------------------------------------------------
// Pattern Banks
// ---------------------------------------------------------------------------

const GOAL_PATTERNS: RegExp[] = [
  /\bi\s+want\s+to\b/i,
  /\bmy\s+goal\s+is\b/i,
  /\bi'?m?\s+trying\s+to\b/i,
  /\bi\s+need\s+to\b/i,
  /\bworking\s+toward(?:s)?\b/i,
  /\baiming\s+for\b/i,
  /\bmy\s+objective\s+is\b/i,
  /\bi\s+hope\s+to\b/i,
  /\bi\s+plan\s+to\b/i,
];

const PROJECT_PATTERNS: RegExp[] = [
  /\b(?:my\s+)?project\b/i,
  /\bbuilding\b/i,
  /\bworking\s+on\b/i,
  /\bshipping\b/i,
  /\blaunching\b/i,
  /\bdeveloping\b/i,
  /\bcreating\b/i,
  /\bdeploying\b/i,
];

const OPEN_LOOP_PATTERNS: RegExp[] = [
  /\bi\s+haven'?t\s+figured\s+out\b/i,
  /\bstill\s+need\s+to\b/i,
  /\bunsure\s+about\b/i,
  /\bneed\s+to\s+decide\b/i,
  /\bnot\s+sure\s+(?:how|what|whether|if)\b/i,
  /\bhaven'?t\s+decided\b/i,
  /\bopen\s+question\b/i,
  /\bfiguring\s+out\b/i,
];

const DECISION_PATTERNS: RegExp[] = [
  /\bi'?ve?\s+decided\b/i,
  /\bgoing\s+with\b/i,
  /\bchose\s+to\b/i,
  /\bcommitted\s+to\b/i,
  /\bi'?m?\s+going\s+to\b/i,
  /\bwe'?re?\s+going\s+with\b/i,
  /\bdecided\s+on\b/i,
  /\bsettled\s+on\b/i,
];

const BLOCKER_PATTERNS: RegExp[] = [
  /\bblocked\s+by\b/i,
  /\bcan'?t\s+move\s+forward\s+until\b/i,
  /\bwaiting\s+on\b/i,
  /\bstuck\s+(?:on|because|until)\b/i,
  /\bblocking\s+(?:me|us|progress)\b/i,
  /\bdepends\s+on\b/i,
];

const ABANDONED_PATTERNS: RegExp[] = [
  /\bgave\s+up\s+on\b/i,
  /\bdecided\s+against\b/i,
  /\bnot\s+going\s+to\b/i,
  /\babandoned\b/i,
  /\bdropped\b/i,
  /\bscrapped\b/i,
  /\bshelved\b/i,
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract sentences from free-form text, splitting on '.', '!', '?', ';', '\n'.
 */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?;])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Pull a short label from a sentence by trimming the pattern and cropping length.
 */
function labelFromSentence(sentence: string, maxLength = 80): string {
  return sentence.length > maxLength ? sentence.slice(0, maxLength - 1) + '…' : sentence;
}

/**
 * Infer horizon from natural language.
 */
function inferHorizon(sentence: string): Goal['horizon'] {
  const s = sentence.toLowerCase();
  if (/\b(today|this\s+hour|right\s+now|immediately|asap)\b/.test(s)) return 'immediate';
  if (/\b(this\s+week|next\s+week|soon|shortly|in\s+a\s+few\s+days)\b/.test(s)) return 'short_term';
  if (/\b(this\s+year|next\s+year|quarter|long[\s-]term)\b/.test(s)) return 'long_term';
  if (/\b(life|lifetime|someday|ultimately|forever|career|dream)\b/.test(s)) return 'life_level';
  return 'short_term';
}

/**
 * Infer project domain from sentence keywords.
 */
function inferDomain(sentence: string): string {
  const s = sentence.toLowerCase();
  if (/\b(code|app|software|api|backend|frontend|database|deploy|server|web|mobile)\b/.test(s)) return 'software';
  if (/\b(design|ui|ux|figma|prototype|mockup|wireframe)\b/.test(s)) return 'design';
  if (/\b(write|writing|blog|article|book|essay|content|copy)\b/.test(s)) return 'writing';
  if (/\b(market|sales|growth|customer|seo|ads|campaign|revenue)\b/.test(s)) return 'marketing';
  if (/\b(research|study|paper|data|analysis|experiment|thesis)\b/.test(s)) return 'research';
  if (/\b(product|roadmap|feature|launch|ship|release|mvp)\b/.test(s)) return 'product';
  return 'general';
}

/**
 * Attempt to extract a proper-noun project name from a sentence.
 * Looks for quoted names or TitleCase words near project pattern keywords.
 */
function extractProjectName(sentence: string): string | null {
  // Quoted name: "Project Falcon", 'Atlas', etc.
  const quoted = sentence.match(/["']([A-Z][^"']{1,40})["']/);
  if (quoted) return quoted[1];

  // TitleCase sequence (2-4 consecutive words starting with capitals)
  const titleCase = sentence.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/);
  if (titleCase && titleCase[1].length > 3) return titleCase[1];

  return null;
}

/**
 * Check if a goal with similar title already exists to avoid duplicates.
 */
function findSimilarGoal(title: string, goals: Goal[]): Goal | undefined {
  const normalised = title.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  return goals.find((g) => {
    const gNorm = g.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    return gNorm === normalised || gNorm.includes(normalised) || normalised.includes(gNorm);
  });
}

/**
 * Check if a project with similar name already exists.
 */
function findSimilarProject(name: string, projects: Project[]): Project | undefined {
  const normalised = name.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  return projects.find((p) => {
    const pNorm = p.name.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    return pNorm === normalised || pNorm.includes(normalised) || normalised.includes(pNorm);
  });
}

/**
 * Compute an overall active focus from current state.
 */
function deriveActiveFocus(state: MissionState): string | null {
  const activeGoals = state.goals.filter((g) => g.status === 'active');
  if (activeGoals.length === 0) return null;

  // Highest mention count + most recently mentioned
  const primary = activeGoals.sort((a, b) => {
    const score = (g: Goal) => g.mentionCount * 0.6 + (g.lastMentionedAt / 1e9) * 0.4;
    return score(b) - score(a);
  })[0];

  return primary?.title ?? null;
}

// ---------------------------------------------------------------------------
// GoalMemory Class
// ---------------------------------------------------------------------------

export class GoalMemory {
  /**
   * Auto-detect goals, open loops, and project updates from a conversation message.
   */
  async detectFromMessage(
    userId: string,
    message: string,
    sessionId: string,
    existingState: MissionState
  ): Promise<{ newGoals: Goal[]; newLoops: OpenLoop[]; updatedProjects: Project[] }> {
    const now = Date.now();
    const sentences = splitSentences(message);

    const newGoals: Goal[] = [];
    const newLoops: OpenLoop[] = [];
    const updatedProjects: Project[] = [];

    for (const sentence of sentences) {
      // ---- Goal detection ----
      if (GOAL_PATTERNS.some((p) => p.test(sentence))) {
        const title = labelFromSentence(sentence);
        const existing = findSimilarGoal(title, existingState.goals);

        if (existing) {
          // Bump mention count on the existing goal
          existing.mentionCount += 1;
          existing.lastMentionedAt = now;
          existing.updatedAt = now;
        } else {
          // Create a new auto-detected goal
          const goal: Goal = {
            id: randomUUID(),
            userId,
            title,
            description: sentence,
            status: 'active',
            horizon: inferHorizon(sentence),
            createdAt: now,
            updatedAt: now,
            lastMentionedAt: now,
            mentionCount: 1,
            relatedProjectIds: [],
            blockers: [],
            progress: 0,
            atlasObservation: `Auto-detected from conversation. User expressed: "${labelFromSentence(sentence, 120)}"`,
            autoDetected: true,
            confidenceInAutoDetection: this._goalConfidence(sentence),
          };
          newGoals.push(goal);
        }
      }

      // ---- Blocker detection ----
      if (BLOCKER_PATTERNS.some((p) => p.test(sentence))) {
        const blocker: Blocker = {
          id: randomUUID(),
          description: labelFromSentence(sentence),
          severity: /\b(critical|completely|totally|entirely|can'?t\s+do\s+anything)\b/i.test(sentence)
            ? 'critical'
            : /\b(major|significant|serious)\b/i.test(sentence)
            ? 'moderate'
            : 'minor',
          since: now,
          resolved: false,
        };

        // Attach to the most recently updated active goal if one exists
        const targetGoal = [...existingState.goals, ...newGoals]
          .filter((g) => g.status === 'active' || g.status === 'blocked')
          .sort((a, b) => b.updatedAt - a.updatedAt)[0];

        if (targetGoal) {
          targetGoal.blockers.push(blocker);
          targetGoal.status = 'blocked';
          targetGoal.updatedAt = now;
        }
      }

      // ---- Project detection ----
      if (PROJECT_PATTERNS.some((p) => p.test(sentence))) {
        const projectName = extractProjectName(sentence);
        if (projectName) {
          const existing = findSimilarProject(projectName, existingState.projects);
          if (existing) {
            if (!existing.sessionReferences.includes(sessionId)) {
              existing.sessionReferences.push(sessionId);
            }
            existing.lastActiveAt = now;
            existing.updatedAt = now;
            updatedProjects.push(existing);
          } else {
            // Only auto-create projects we can name
            const project: Project = {
              id: randomUUID(),
              userId,
              name: projectName,
              description: sentence,
              status: 'incubating',
              domain: inferDomain(sentence),
              createdAt: now,
              updatedAt: now,
              lastActiveAt: now,
              relatedGoalIds: newGoals.map((g) => g.id),
              openLoops: [],
              decisions: [],
              abandonedPaths: [],
              keyEntities: [],
              atlasContext: `Auto-detected project from: "${labelFromSentence(sentence, 120)}"`,
              sessionReferences: [sessionId],
            };
            updatedProjects.push(project);
          }
        }
      }

      // ---- Open loop detection ----
      if (OPEN_LOOP_PATTERNS.some((p) => p.test(sentence))) {
        // Attach to first active/updated project if available
        const targetProject = [...existingState.projects, ...updatedProjects]
          .filter((p) => p.status === 'active' || p.status === 'incubating')
          .sort((a, b) => b.lastActiveAt - a.lastActiveAt)[0];

        const loop: OpenLoop = {
          id: randomUUID(),
          projectId: targetProject?.id ?? '',
          description: labelFromSentence(sentence),
          status: 'open',
          openedAt: now,
          priority: /\b(critical|urgent|immediately|asap|blocker)\b/i.test(sentence)
            ? 'critical'
            : /\b(important|must|need|required)\b/i.test(sentence)
            ? 'high'
            : /\b(should|would\s+be\s+nice|eventually)\b/i.test(sentence)
            ? 'low'
            : 'medium',
          atlasFlag: /\b(critical|urgent|important|must)\b/i.test(sentence),
        };

        if (targetProject) {
          targetProject.openLoops.push(loop);
        }
        newLoops.push(loop);
      }

      // ---- Decision detection ----
      if (DECISION_PATTERNS.some((p) => p.test(sentence))) {
        const targetProject = [...existingState.projects, ...updatedProjects]
          .sort((a, b) => b.lastActiveAt - a.lastActiveAt)[0];

        if (targetProject) {
          const decision: Decision = {
            id: randomUUID(),
            projectId: targetProject.id,
            description: labelFromSentence(sentence),
            finality: /\bcommitted\b/i.test(sentence) ? 'committed' : 'tentative',
            madeAt: now,
            reasoning: sentence,
            alternatives: [],
            reversalCount: 0,
            atlasAssessment: `Decision auto-detected from conversation message.`,
          };
          targetProject.decisions.push(decision);
          if (!updatedProjects.includes(targetProject)) {
            updatedProjects.push(targetProject);
          }
        }
      }

      // ---- Abandoned path detection ----
      if (ABANDONED_PATTERNS.some((p) => p.test(sentence))) {
        const targetProject = [...existingState.projects, ...updatedProjects]
          .sort((a, b) => b.lastActiveAt - a.lastActiveAt)[0];

        if (targetProject) {
          const abandoned: AbandonedPath = {
            id: randomUUID(),
            projectId: targetProject.id,
            description: labelFromSentence(sentence),
            abandonedAt: now,
            reason: sentence,
            retrievable: !/\b(never|definitely\s+not|permanently|completely)\b/i.test(sentence),
          };
          targetProject.abandonedPaths.push(abandoned);
          if (!updatedProjects.includes(targetProject)) {
            updatedProjects.push(targetProject);
          }
        }
      }
    }

    return { newGoals, newLoops, updatedProjects };
  }

  /**
   * Compute a confidence score for goal auto-detection based on pattern strength.
   */
  private _goalConfidence(sentence: string): number {
    const strong = [/\bmy\s+goal\s+is\b/i, /\bi'?ve?\s+been\s+working\s+toward\b/i];
    if (strong.some((p) => p.test(sentence))) return 0.9;

    const medium = [/\bi\s+want\s+to\b/i, /\baiming\s+for\b/i, /\bi\s+need\s+to\b/i];
    if (medium.some((p) => p.test(sentence))) return 0.75;

    return 0.6;
  }

  /**
   * Synthesize a mission context string for injection into the Atlas system prompt.
   */
  buildMissionContext(state: MissionState): string {
    const activeGoals = state.goals
      .filter((g) => g.status === 'active')
      .sort((a, b) => b.mentionCount - a.mentionCount)
      .slice(0, 3);

    const activeProjects = state.projects.filter((p) => p.status === 'active');

    const highPriorityLoops = state.projects
      .flatMap((p) => p.openLoops)
      .filter(
        (l) =>
          (l.status === 'open' || l.status === 'in_progress') &&
          (l.priority === 'high' || l.priority === 'critical')
      )
      .slice(0, 5);

    const recentDecisions = state.projects
      .flatMap((p) => p.decisions)
      .sort((a, b) => b.madeAt - a.madeAt)
      .slice(0, 2);

    const lines: string[] = ['ACTIVE MISSION CONTEXT:'];

    lines.push(
      `Primary focus: ${state.atlasActiveFocus ?? 'Not yet established'}`
    );

    if (activeGoals.length > 0) {
      lines.push(
        `Active goals: ${activeGoals
          .map((g) => `${g.title} [${Math.round(g.progress * 100)}%]`)
          .join(', ')}`
      );
    } else {
      lines.push(`Active goals: None tracked yet`);
    }

    if (activeProjects.length > 0) {
      lines.push(`Current projects: ${activeProjects.map((p) => p.name).join(', ')}`);
    } else {
      lines.push(`Current projects: None tracked yet`);
    }

    if (highPriorityLoops.length > 0) {
      lines.push(
        `Open loops requiring resolution: ${highPriorityLoops
          .map((l) => `[${l.priority.toUpperCase()}] ${l.description}`)
          .join(' | ')}`
      );
    }

    if (recentDecisions.length > 0) {
      lines.push(
        `Recent decisions: ${recentDecisions
          .map((d) => `${d.description} (${d.finality})`)
          .join(' | ')}`
      );
    }

    // Blocked goals warning
    const blockedGoals = state.goals.filter((g) => g.status === 'blocked');
    if (blockedGoals.length > 0) {
      lines.push(
        `Blocked goals: ${blockedGoals
          .map((g) => {
            const critical = g.blockers.filter((b) => !b.resolved && b.severity === 'critical');
            return critical.length > 0
              ? `${g.title} [CRITICAL BLOCKER]`
              : g.title;
          })
          .join(', ')}`
      );
    }

    return lines.join('\n');
  }

  /**
   * Update an existing goal's status and progress.
   */
  updateGoal(
    state: MissionState,
    goalId: string,
    updates: Partial<Goal>
  ): MissionState {
    const now = Date.now();
    const goals = state.goals.map((g) => {
      if (g.id !== goalId) return g;
      return {
        ...g,
        ...updates,
        id: g.id,           // never allow id to be overwritten
        userId: g.userId,   // never allow userId to be overwritten
        updatedAt: now,
      };
    });

    const newState: MissionState = {
      ...state,
      goals,
      lastSyncedAt: now,
      atlasActiveFocus: deriveActiveFocus({ ...state, goals }),
    };

    return newState;
  }

  /**
   * Add a decision to a project.
   */
  recordDecision(
    state: MissionState,
    projectId: string,
    decision: Omit<Decision, 'id'>
  ): MissionState {
    const now = Date.now();
    const projects = state.projects.map((p) => {
      if (p.id !== projectId) return p;
      const newDecision: Decision = { ...decision, id: randomUUID() };
      return {
        ...p,
        decisions: [...p.decisions, newDecision],
        updatedAt: now,
        lastActiveAt: now,
      };
    });

    return { ...state, projects, lastSyncedAt: now };
  }

  /**
   * Close an open loop, attaching a resolution string and timestamp.
   */
  resolveLoop(
    state: MissionState,
    loopId: string,
    resolution: string
  ): MissionState {
    const now = Date.now();
    const projects = state.projects.map((project) => {
      const openLoops = project.openLoops.map((loop) => {
        if (loop.id !== loopId) return loop;
        return {
          ...loop,
          status: 'resolved' as LoopStatus,
          resolvedAt: now,
          resolution,
        };
      });
      const anyChanged = openLoops.some((l, i) => l !== project.openLoops[i]);
      if (!anyChanged) return project;
      return { ...project, openLoops, updatedAt: now };
    });

    return { ...state, projects, lastSyncedAt: now };
  }

  /**
   * Flag items for user review: stale goals (30+ days since mention),
   * unresolved critical blockers, and old open loops.
   */
  getStaleItems(state: MissionState): {
    staleGoals: Goal[];
    criticalBlockers: Blocker[];
    oldLoops: OpenLoop[];
  } {
    const now = Date.now();
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

    const staleGoals = state.goals.filter(
      (g) =>
        g.status === 'active' &&
        now - g.lastMentionedAt > THIRTY_DAYS_MS
    );

    const criticalBlockers = state.goals
      .flatMap((g) => g.blockers)
      .filter((b) => !b.resolved && b.severity === 'critical');

    const oldLoops = state.projects
      .flatMap((p) => p.openLoops)
      .filter(
        (l) =>
          (l.status === 'open' || l.status === 'in_progress') &&
          now - l.openedAt > THIRTY_DAYS_MS
      );

    return { staleGoals, criticalBlockers, oldLoops };
  }

  /**
   * Persist MissionState to Supabase table: atlas_mission_state
   */
  async save(
    userId: string,
    state: MissionState,
    supabaseUrl: string,
    supabaseKey: string
  ): Promise<void> {
    const client = createClient(supabaseUrl, supabaseKey);
    const payload = {
      user_id: userId,
      state: JSON.stringify(state),
      last_synced_at: new Date(state.lastSyncedAt).toISOString(),
    };

    const { error } = await client
      .from('atlas_mission_state')
      .upsert(payload, { onConflict: 'user_id' });

    if (error) {
      throw new Error(`GoalMemory.save failed: ${error.message}`);
    }
  }

  /**
   * Load MissionState from Supabase table: atlas_mission_state
   */
  async load(
    userId: string,
    supabaseUrl: string,
    supabaseKey: string
  ): Promise<MissionState | null> {
    const client = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await client
      .from('atlas_mission_state')
      .select('state')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // no row found
      throw new Error(`GoalMemory.load failed: ${error.message}`);
    }

    if (!data?.state) return null;

    try {
      return JSON.parse(data.state) as MissionState;
    } catch {
      throw new Error(`GoalMemory.load: failed to parse stored state`);
    }
  }
}
