/**
 * Atlas Natural Language Summary
 * Phase 4 Section 4 — Explainability Layer
 *
 * Generates weekly digest of governance explanations.
 * Rule-based fallback when no LLM is available.
 */

import type { ExplanationEntry } from './explanationStore';

export interface NLSummary {
  text: string;
  generatedAt: Date;
  entryCount: number;
  method: 'llm' | 'rule-based';
}

const WARN_CRITICAL_EVENTS = new Set([
  'mutation_quarantined',
  'constitution_violation',
  'degraded_mode_entered',
  'quarantine_spike_detected',
  'claim_contradicted',
  'evolution_frozen',
  'identity_conflict',
]);

function isWarnOrCritical(entry: ExplanationEntry): boolean {
  return WARN_CRITICAL_EVENTS.has(entry.eventType.toLowerCase());
}

function filterRecentWarnCritical(entries: ExplanationEntry[]): ExplanationEntry[] {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return entries.filter(
    (e) => e.timestamp >= sevenDaysAgo && isWarnOrCritical(e)
  );
}

/**
 * Build a plain-text rule-based digest from explanation entries.
 */
function buildRuleBasedDigest(entries: ExplanationEntry[]): string {
  if (entries.length === 0) {
    return 'No policy violations or critical events detected in the past 7 days.';
  }

  const byType = new Map<string, number>();
  const actors = new Set<string>();
  const targets = new Set<string>();

  for (const e of entries) {
    byType.set(e.eventType, (byType.get(e.eventType) ?? 0) + 1);
    actors.add(e.actorId);
    targets.add(e.targetId);
  }

  const topEvents = [...byType.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([type, count]) => `${type} (${count})`)
    .join(', ');

  const lines: string[] = [
    `${entries.length} policy violation${entries.length > 1 ? 's' : ''} detected in the past 7 days.`,
    `Top affected event types: ${topEvents}.`,
    `Unique actors involved: ${actors.size}.`,
    `Unique targets affected: ${targets.size}.`,
  ];

  if (entries.length >= 10) {
    lines.push(
      'Warning: elevated violation rate — consider reviewing governance rules or actor permissions.'
    );
  }

  return lines.join('\n');
}

/**
 * Try the LLM-backed endpoint, return null on failure.
 */
async function tryLlmSummary(entries: ExplanationEntry[]): Promise<string | null> {
  try {
    const resp = await fetch('/api/governance/nlsummary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entries: entries.map((e) => ({
          ...e,
          timestamp: e.timestamp instanceof Date ? e.timestamp.toISOString() : e.timestamp,
        })),
      }),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { text?: string };
    return data.text ?? null;
  } catch {
    return null;
  }
}

/**
 * Generate a weekly digest of WARN/CRITICAL severity entries from the past 7 days.
 * Attempts LLM generation first, falls back to rule-based.
 */
export async function generateWeeklyDigest(
  entries: ExplanationEntry[]
): Promise<NLSummary> {
  const filtered = filterRecentWarnCritical(entries);

  // Try LLM first
  const llmText = await tryLlmSummary(filtered);
  if (llmText) {
    return {
      text: llmText,
      generatedAt: new Date(),
      entryCount: filtered.length,
      method: 'llm',
    };
  }

  // Rule-based fallback
  return {
    text: buildRuleBasedDigest(filtered),
    generatedAt: new Date(),
    entryCount: filtered.length,
    method: 'rule-based',
  };
}
