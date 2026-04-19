/**
 * activeIdentityComposer.ts — Phase 0.8: Produces the live identity lens for
 * the current turn.
 *
 * Responsibilities:
 *   composeActiveIdentity()   — assembles a compact ActiveIdentityContract
 *                               from resolved domain state, scoped to the
 *                               current chamber/project/topic.
 *   formatIdentityForOverseer() — renders the contract as a token-efficient
 *                               string block for Overseer injection.
 *
 * Design invariants:
 *   - Hard token cap: formatIdentityForOverseer() never exceeds 400 tokens
 *     (~1600 chars). We enforce a character budget of 1500 as a proxy.
 *   - Caps: max 6 constraints, max 4 scope exceptions, max 3 uncertainty notes.
 *   - Returns empty/minimal contract gracefully when no identity data exists.
 *   - No Supabase calls here — delegates to identityResolutionService.
 */

import { env } from '../../config/env.js';
import { getResolvedIdentity } from './identityResolutionService.js';
import {
  type ActiveIdentityContract,
  type IdentityDomain,
  type ResolvedIdentityDomain,
  type ScopeResolution,
} from './identityGovernance.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ComposeInput {
  userId: string;
  chamber?: string;
  projectKey?: string;
  topic?: string;
  recentSignals?: string[];
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build the ActiveIdentityContract for the current turn.
 *
 * Steps:
 * 1. getResolvedIdentity(userId) — cache-first.
 * 2. Filter domains by current chamber (prefer chamber-scoped over global when chamber set).
 * 3. Select highest-confidence, non-contradicted signals per domain.
 * 4. Build contract fields with hard caps.
 * 5. Return contract.
 */
export async function composeActiveIdentity(
  input: ComposeInput,
): Promise<ActiveIdentityContract> {
  const empty = buildEmptyContract(input.userId);

  if (!env.memoryLayerEnabled) return empty;
  if (!input.userId) return empty;

  try {
    const domains = await getResolvedIdentity(input.userId);
    if (!domains || domains.length === 0) return empty;

    // Filter: prefer scoped domains matching current context, fall back to global.
    const filtered = filterDomains(domains, input.chamber, input.projectKey, input.topic);

    // Extract per-domain data.
    const commDomain = pickBestDomain(filtered, 'communication_profile');
    const challengeDomain = pickBestDomain(filtered, 'challenge_profile');
    const constraintDomains = filtered.filter(
      (d) => d.domain === 'active_constraints' && d.contradictionStatus !== 'unresolved',
    );

    // Build tone profile from communication_profile payload.
    const activeToneProfile = extractToneProfile(commDomain);
    const activeDepthProfile = extractDepthProfile(commDomain);
    const activeChallengeProfile = extractChallengeProfile(challengeDomain);

    // Build scope exceptions from any chamber/project scoped entries.
    const activeScopeExceptions: ScopeResolution[] = buildScopeExceptions(filtered, input)
      .slice(0, 4); // hard cap: 4

    // Constraints from active_constraints domain payload.
    const activeIdentityConstraints = extractConstraints(constraintDomains)
      .slice(0, 6); // hard cap: 6

    // Conflict warnings from domains with unresolved contradictions.
    const activeConflictsToRespect = extractConflicts(filtered)
      .slice(0, 4);

    // Uncertainty notes from low-confidence domains.
    const activeUncertaintyNotes = extractUncertaintyNotes(filtered)
      .slice(0, 3); // hard cap: 3

    // Behaviour boundaries from active_constraints + challenge_profile.
    const activeBehaviorBoundaries = extractBehaviorBoundaries(filtered)
      .slice(0, 4);

    return {
      userId: input.userId,
      activeToneProfile,
      activeDepthProfile,
      activeChallengeProfile,
      activeScopeExceptions,
      activeIdentityConstraints,
      activeConflictsToRespect,
      activeUncertaintyNotes,
      activeBehaviorBoundaries,
      resolvedAt: new Date(),
    };
  } catch (err) {
    console.warn('[activeIdentityComposer] composeActiveIdentity threw:',
      err instanceof Error ? err.message : err);
    return empty;
  }
}

/**
 * Render an ActiveIdentityContract as a compact, token-efficient string block
 * suitable for injection into the Overseer system prompt.
 *
 * Hard cap: 1500 characters (~375 tokens). Sections are truncated if needed.
 * Empty/trivial contracts return an empty string.
 */
export function formatIdentityForOverseer(
  contract: ActiveIdentityContract | null | undefined,
): string {
  if (!contract) return '';

  const hasContent =
    Object.keys(contract.activeToneProfile).length > 0 ||
    contract.activeIdentityConstraints.length > 0 ||
    contract.activeChallengeProfile['style'] !== undefined ||
    contract.activeScopeExceptions.length > 0;

  if (!hasContent) return '';

  const lines: string[] = [];

  lines.push('IDENTITY_RESOLUTION_CONTEXT:');

  // Confirmed global preferences.
  const globalPrefs = buildGlobalPrefsLines(contract);
  if (globalPrefs.length > 0) {
    lines.push('confirmed_global_preferences:');
    lines.push(...globalPrefs);
  }

  // Active scoped preferences.
  if (contract.activeScopeExceptions.length > 0) {
    lines.push('active_scoped_preferences:');
    for (const scope of contract.activeScopeExceptions) {
      lines.push(`  - [${scope.scopeType}${scope.scopeKey ? `/${scope.scopeKey}` : ''}] ${scope.scopeReasoning.slice(0, 80)}`);
    }
  }

  // Active constraints (hard-stops).
  if (contract.activeIdentityConstraints.length > 0) {
    lines.push('active_constraints:');
    for (const c of contract.activeIdentityConstraints) {
      lines.push(`  - ${c}`);
    }
  }

  // Contradiction warnings.
  if (contract.activeConflictsToRespect.length > 0) {
    lines.push('contradiction_warnings:');
    for (const w of contract.activeConflictsToRespect) {
      lines.push(`  - [CONTESTED] ${w}`);
    }
  }

  // User corrections.
  if (contract.activeBehaviorBoundaries.length > 0) {
    lines.push('user_corrections_in_effect:');
    for (const b of contract.activeBehaviorBoundaries) {
      lines.push(`  - ${b}`);
    }
  }

  const raw = lines.join('\n');

  // Enforce hard character budget.
  if (raw.length > 1500) {
    return raw.slice(0, 1497) + '…';
  }
  return raw;
}

// ── Private helpers ───────────────────────────────────────────────────────────

function buildEmptyContract(userId: string): ActiveIdentityContract {
  return {
    userId,
    activeToneProfile: {},
    activeDepthProfile: {},
    activeChallengeProfile: {},
    activeScopeExceptions: [],
    activeIdentityConstraints: [],
    activeConflictsToRespect: [],
    activeUncertaintyNotes: [],
    activeBehaviorBoundaries: [],
    resolvedAt: new Date(),
  };
}

/**
 * Filter domains:
 * - When chamber is set, include chamber-scoped domains for that chamber AND global.
 * - When projectKey is set, include project-scoped AND global.
 * - Otherwise, global only.
 * - Always prefer non-contradicted domains, but include contradicted with a flag.
 */
function filterDomains(
  domains: ResolvedIdentityDomain[],
  chamber?: string,
  projectKey?: string,
  _topic?: string,
): ResolvedIdentityDomain[] {
  return domains.filter((d) => {
    if (d.scopeType === 'global') return true;
    if (d.scopeType === 'session') return false; // session never in global lens
    if (chamber && d.scopeType === 'chamber' && d.scopeKey === chamber) return true;
    if (projectKey && d.scopeType === 'project' && d.scopeKey === projectKey) return true;
    return false;
  });
}

function pickBestDomain(
  domains: ResolvedIdentityDomain[],
  targetDomain: IdentityDomain,
): ResolvedIdentityDomain | undefined {
  const candidates = domains.filter(
    (d) => d.domain === targetDomain && d.contradictionStatus !== 'unresolved',
  );
  if (candidates.length === 0) return undefined;
  // Prefer scoped over global, then highest confidence.
  candidates.sort((a, b) => {
    const scopeScore = (d: ResolvedIdentityDomain) => d.scopeType !== 'global' ? 1 : 0;
    return scopeScore(b) - scopeScore(a) || b.confidence - a.confidence;
  });
  return candidates[0];
}

function extractToneProfile(
  domain: ResolvedIdentityDomain | undefined,
): Record<string, unknown> {
  if (!domain?.payload) return {};
  const topSignals = domain.payload['topSignals'];
  if (!Array.isArray(topSignals) || topSignals.length === 0) return {};

  // Build a simple tone profile from top signal content.
  const tone: Record<string, unknown> = {};
  const content = (topSignals[0] as { content?: string })?.content ?? '';

  if (/\b(concise|brief|short)\b/i.test(content)) tone['verbosity'] = 'concise';
  else if (/\b(detailed|verbose|thorough|comprehensive)\b/i.test(content)) tone['verbosity'] = 'detailed';

  if (/\b(formal|professional)\b/i.test(content)) tone['formality'] = 'formal';
  else if (/\b(casual|informal|conversational)\b/i.test(content)) tone['formality'] = 'casual';

  if (/\b(markdown|bullet|list)\b/i.test(content)) tone['format'] = 'markdown';
  else if (/\b(plain|no.markdown|text.only)\b/i.test(content)) tone['format'] = 'plain';

  return tone;
}

function extractDepthProfile(
  domain: ResolvedIdentityDomain | undefined,
): Record<string, unknown> {
  if (!domain?.payload) return {};
  const topSignals = domain.payload['topSignals'];
  if (!Array.isArray(topSignals) || topSignals.length === 0) return {};

  const content = (topSignals[0] as { content?: string })?.content ?? '';
  const depth: Record<string, unknown> = {};

  if (/\b(technical|expert|advanced|deep)\b/i.test(content)) depth['level'] = 'technical';
  else if (/\b(simple|beginner|basic|overview)\b/i.test(content)) depth['level'] = 'simple';

  return depth;
}

function extractChallengeProfile(
  domain: ResolvedIdentityDomain | undefined,
): Record<string, unknown> {
  if (!domain?.payload) return {};
  const topSignals = domain.payload['topSignals'];
  if (!Array.isArray(topSignals) || topSignals.length === 0) return {};

  const content = (topSignals[0] as { content?: string })?.content ?? '';
  const profile: Record<string, unknown> = {};

  if (/\b(challenge|push back|question|probe|devil)\b/i.test(content)) profile['style'] = 'challenging';
  else if (/\b(agree|affirm|support|validate)\b/i.test(content)) profile['style'] = 'supportive';

  return profile;
}

function buildScopeExceptions(
  domains: ResolvedIdentityDomain[],
  input: ComposeInput,
): ScopeResolution[] {
  const exceptions: ScopeResolution[] = [];

  for (const d of domains) {
    if (d.scopeType === 'global') continue;
    if (d.contradictionStatus === 'unresolved') continue;

    exceptions.push({
      scopeType: d.scopeType,
      scopeKey: d.scopeKey,
      scopeStrength: d.scopeType === 'session' ? 'narrow' : 'moderate',
      scopeConfidence: d.confidence,
      scopeReasoning: buildScopeReasoning(d, input),
    });
  }

  return exceptions;
}

function buildScopeReasoning(d: ResolvedIdentityDomain, _input: ComposeInput): string {
  const topSignals = d.payload['topSignals'];
  if (Array.isArray(topSignals) && topSignals.length > 0) {
    const content = (topSignals[0] as { content?: string })?.content ?? '';
    return content.slice(0, 80);
  }
  return `Scoped to ${d.scopeType}${d.scopeKey ? `/${d.scopeKey}` : ''}`;
}

function extractConstraints(
  domains: ResolvedIdentityDomain[],
): string[] {
  const constraints: string[] = [];
  for (const d of domains) {
    const topSignals = d.payload['topSignals'];
    if (!Array.isArray(topSignals)) continue;
    for (const s of topSignals) {
      const content = (s as { content?: string })?.content;
      if (content) constraints.push(content.slice(0, 120));
    }
  }
  return constraints;
}

function extractConflicts(
  domains: ResolvedIdentityDomain[],
): string[] {
  return domains
    .filter((d) => d.contradictionStatus === 'unresolved')
    .map((d) => `Unresolved contradiction in '${d.domain}'${d.scopeKey ? ` (${d.scopeKey})` : ''}`);
}

function extractUncertaintyNotes(
  domains: ResolvedIdentityDomain[],
): string[] {
  return domains
    .filter((d) => d.confidence < 0.5 && d.contradictionStatus !== 'unresolved')
    .map((d) => `Low-confidence signal in '${d.domain}' (${(d.confidence * 100).toFixed(0)}%)`);
}

function extractBehaviorBoundaries(
  domains: ResolvedIdentityDomain[],
): string[] {
  const boundaries: string[] = [];
  // Use active_constraints and challenge_profile as boundary sources.
  const relevant = domains.filter(
    (d) =>
      (d.domain === 'active_constraints' || d.domain === 'challenge_profile') &&
      d.contradictionStatus !== 'unresolved',
  );
  for (const d of relevant) {
    const topSignals = d.payload['topSignals'];
    if (!Array.isArray(topSignals)) continue;
    for (const s of topSignals) {
      const content = (s as { content?: string })?.content;
      if (content) boundaries.push(content.slice(0, 120));
    }
  }
  return boundaries;
}

function buildGlobalPrefsLines(contract: ActiveIdentityContract): string[] {
  const lines: string[] = [];

  // Tone.
  const tone = contract.activeToneProfile;
  if (typeof tone['verbosity'] === 'string') lines.push(`  verbosity: ${tone['verbosity']}`);
  if (typeof tone['formality'] === 'string') lines.push(`  formality: ${tone['formality']}`);
  if (typeof tone['format'] === 'string') lines.push(`  format: ${tone['format']}`);

  // Depth.
  const depth = contract.activeDepthProfile;
  if (typeof depth['level'] === 'string') lines.push(`  depth: ${depth['level']}`);

  // Challenge.
  const challenge = contract.activeChallengeProfile;
  if (typeof challenge['style'] === 'string') lines.push(`  challenge_style: ${challenge['style']}`);

  return lines;
}
