/**
 * Semantic Memory Consolidation — Chronos background job.
 *
 * Reviews a user's memory clusters and asks the background LLM to extract
 * 3-7 durable higher-order claims about how this person thinks and operates
 * (e.g. "systematically underestimates implementation timelines"). Claims
 * are persisted to `semantic_claims` and surfaced in the Atlas identity
 * prompt as COGNITIVE_PATTERNS so Atlas operates from pattern-level
 * knowledge, not just episodic memory.
 *
 * Throttling and caps are enforced internally — safe to call once per
 * Chronos per-user tick.
 *
 * Background-only: must NEVER consume Groq tokens. Always routes through
 * backgroundModelProvider (Gemini → OpenAI).
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getDb } from '../../db/sqlite.js';
import { supabaseRest } from '../../db/supabase.js';
import { createBackgroundModelProvider } from '../model/backgroundModelProvider.js';
import { shouldWriteSqlite, shouldWriteSupabase, storeFlags } from '../../utils/storeFlags.js';
import { deterministicUuid } from '../../utils/uuidMapping.js';

const MIN_MEMORIES_TO_CONSOLIDATE = 15;
const THROTTLE_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
const MAX_ACTIVE_CLAIMS_PER_USER = 50;
const MEMORY_SAMPLE_LIMIT = 60;
const DUPLICATE_OVERLAP_THRESHOLD = 0.6;

const SUPPORTED_KINDS = ['preference', 'fact', 'pattern', 'goal'] as const;

const SEMANTIC_DOMAINS = [
  'planning',
  'execution',
  'communication',
  'decision-making',
  'learning',
  'creativity',
  'relationships',
  'technical',
  'financial',
  'other',
] as const;
type SemanticDomain = (typeof SEMANTIC_DOMAINS)[number];

const claimSchema = z.object({
  claim: z.string().min(20).max(800),
  domain: z.enum(SEMANTIC_DOMAINS),
  confidence: z.number().min(0).max(1),
  supporting_memory_indices: z.array(z.number().int().nonnegative()).min(3),
});

const consolidationOutputSchema = z.object({
  claims: z.array(claimSchema).max(7),
});

interface MemoryRow {
  id: string;
  kind: string;
  summary: string;
  confidence: number;
}

interface ExistingClaimRow {
  id: string;
  claim: string;
  domain: string | null;
  confidence: number;
}

/**
 * Run semantic consolidation for a user. Safe to call every tick: returns
 * early when throttle, cap, or insufficient-data conditions apply.
 */
export async function runConsolidationForUser(userId: string): Promise<void> {
  if (!userId) return;

  const db = getDb();

  // ── Step 1: eligibility ────────────────────────────────────────────────
  const activeClaimsRow = db
    .prepare(
      `SELECT COUNT(*) AS n FROM semantic_claims
       WHERE user_id = ? AND invalidated_at IS NULL`,
    )
    .get(userId) as { n: number };
  const activeClaims = activeClaimsRow?.n ?? 0;

  if (activeClaims >= MAX_ACTIVE_CLAIMS_PER_USER) {
    return;
  }

  const memoriesCountRow = db
    .prepare(
      `SELECT COUNT(*) AS n FROM memories
       WHERE user_id = ? AND archived_at IS NULL`,
    )
    .get(userId) as { n: number };
  const totalMemories = memoriesCountRow?.n ?? 0;

  if (totalMemories < MIN_MEMORIES_TO_CONSOLIDATE) {
    return;
  }

  const lastRunRow = db
    .prepare(
      `SELECT updated_at FROM semantic_claims
       WHERE user_id = ?
       ORDER BY updated_at DESC LIMIT 1`,
    )
    .get(userId) as { updated_at: string } | undefined;

  if (lastRunRow?.updated_at) {
    const last = Date.parse(lastRunRow.updated_at);
    if (Number.isFinite(last) && Date.now() - last < THROTTLE_MS) {
      return;
    }
  }

  // ── Step 2: load memory clusters ───────────────────────────────────────
  const kindPlaceholders = SUPPORTED_KINDS.map(() => '?').join(',');
  const memories = db
    .prepare(
      `SELECT id, kind, summary, confidence FROM memories
       WHERE user_id = ?
         AND archived_at IS NULL
         AND kind IN (${kindPlaceholders})
       ORDER BY confidence DESC, created_at DESC
       LIMIT ?`,
    )
    .all(userId, ...SUPPORTED_KINDS, MEMORY_SAMPLE_LIMIT) as MemoryRow[];

  if (memories.length < MIN_MEMORIES_TO_CONSOLIDATE) {
    return;
  }

  const formattedList = memories
    .map((m, idx) => `${idx}. [${m.kind}] ${m.summary} (confidence: ${m.confidence.toFixed(2)})`)
    .join('\n');

  // ── Step 3: LLM generation ─────────────────────────────────────────────
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(formattedList);

  let llmText: string;
  try {
    const provider = createBackgroundModelProvider();
    const out = await provider.generate({
      userId,
      systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      jsonMode: true,
      temperature: 0.3,
      timeoutMs: 30_000,
    });
    llmText = out.text;
  } catch (err) {
    console.warn(
      '[semanticConsolidation] background LLM call failed (non-fatal):',
      err instanceof Error ? err.message : String(err),
    );
    return;
  }

  const parsed = parseConsolidationJson(llmText);
  if (!parsed || parsed.claims.length === 0) {
    return;
  }

  // ── Step 4: persist claims ─────────────────────────────────────────────
  const existingClaims = db
    .prepare(
      `SELECT id, claim, domain, confidence FROM semantic_claims
       WHERE user_id = ? AND invalidated_at IS NULL`,
    )
    .all(userId) as ExistingClaimRow[];

  const nowIso = new Date().toISOString();
  const mode = storeFlags.semanticClaims();
  const writeSqlite = shouldWriteSqlite(mode);
  const writeSupabase = shouldWriteSupabase(mode);
  let inserted = 0;

  for (const c of parsed.claims) {
    // Map indices to memory IDs (filter out-of-range).
    const evidenceIds = c.supporting_memory_indices
      .filter((i) => i >= 0 && i < memories.length)
      .map((i) => memories[i]!.id);

    if (evidenceIds.length < 3) continue;

    // Duplicate detection: skip if a similar active claim already exists.
    const duplicate = existingClaims.find(
      (e) => wordOverlapRatio(e.claim, c.claim) > DUPLICATE_OVERLAP_THRESHOLD,
    );
    if (duplicate) {
      if (c.confidence > duplicate.confidence) {
        if (writeSqlite) {
          db.prepare(
            `UPDATE semantic_claims
             SET confidence = ?, updated_at = ?
             WHERE id = ?`,
          ).run(c.confidence, nowIso, duplicate.id);
        }
        if (writeSupabase) {
          await mirrorConfidenceUpdate(duplicate.id, c.confidence, nowIso);
        }
      }
      continue;
    }

    // Supersession: invalidate any lower-confidence claim in the same domain.
    const supersedeTargets = existingClaims.filter(
      (e) => e.domain === c.domain && e.confidence < c.confidence,
    );
    if (supersedeTargets.length > 0) {
      if (writeSqlite) {
        const placeholders = supersedeTargets.map(() => '?').join(',');
        db.prepare(
          `UPDATE semantic_claims
           SET invalidated_at = ?, updated_at = ?
           WHERE id IN (${placeholders})`,
        ).run(nowIso, nowIso, ...supersedeTargets.map((s) => s.id));
      }
      if (writeSupabase) {
        await mirrorSupersessionUpdate(
          supersedeTargets.map((s) => s.id),
          nowIso,
        );
      }
    }

    const newId = randomUUID();
    if (writeSqlite) {
      db.prepare(
        `INSERT INTO semantic_claims
           (id, user_id, claim, domain, confidence, evidence_memory_ids,
            evidence_count, times_surfaced, last_surfaced_at, invalidated_at,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, ?, ?)`,
      ).run(
        newId,
        userId,
        c.claim,
        c.domain,
        c.confidence,
        JSON.stringify(evidenceIds),
        evidenceIds.length,
        nowIso,
        nowIso,
      );
    }
    if (writeSupabase) {
      await mirrorInsert({
        sqliteId: newId,
        userId,
        claim: c.claim,
        domain: c.domain,
        confidence: c.confidence,
        evidenceIds,
        nowIso,
      });
    }
    inserted += 1;

    if (activeClaims + inserted >= MAX_ACTIVE_CLAIMS_PER_USER) break;
  }
}

// ── Supabase mirroring (P4 dual-write) ────────────────────────────────────
//
// All three helpers are best-effort: Supabase failures are logged but never
// thrown, so a Postgres outage during the `dual` phase does not break the
// SQLite-of-record path.

async function mirrorInsert(args: {
  sqliteId: string;
  userId: string;
  claim: string;
  domain: string;
  confidence: number;
  evidenceIds: string[];
  nowIso: string;
}): Promise<void> {
  try {
    const res = await supabaseRest('POST', 'semantic_claims', {
      id: deterministicUuid('semantic_claims', args.sqliteId),
      user_id: args.userId,
      claim: args.claim,
      domain: args.domain,
      confidence: args.confidence,
      evidence_memory_ids: args.evidenceIds.map((id) =>
        deterministicUuid('memories', id),
      ),
      evidence_count: args.evidenceIds.length,
      times_surfaced: 0,
      last_surfaced_at: null,
      invalidated_at: null,
      created_at: args.nowIso,
      updated_at: args.nowIso,
    });
    if (!res.ok) {
      console.error(
        `[semanticConsolidation] supabase insert failed (status=${res.status ?? 'n/a'})`,
      );
    }
  } catch (err) {
    console.error('[semanticConsolidation] supabase insert error:', err);
  }
}

async function mirrorConfidenceUpdate(
  sqliteId: string,
  confidence: number,
  nowIso: string,
): Promise<void> {
  try {
    const pgId = deterministicUuid('semantic_claims', sqliteId);
    const res = await supabaseRest(
      'PATCH',
      `semantic_claims?id=eq.${encodeURIComponent(pgId)}`,
      { confidence, updated_at: nowIso },
    );
    if (!res.ok) {
      console.error(
        `[semanticConsolidation] supabase confidence patch failed (status=${res.status ?? 'n/a'})`,
      );
    }
  } catch (err) {
    console.error('[semanticConsolidation] supabase confidence patch error:', err);
  }
}

async function mirrorSupersessionUpdate(
  sqliteIds: string[],
  nowIso: string,
): Promise<void> {
  if (sqliteIds.length === 0) return;
  try {
    const pgIds = sqliteIds.map((id) => deterministicUuid('semantic_claims', id));
    const inList = pgIds.map((id) => `"${id}"`).join(',');
    const res = await supabaseRest(
      'PATCH',
      `semantic_claims?id=in.(${encodeURIComponent(inList)})`,
      { invalidated_at: nowIso, updated_at: nowIso },
    );
    if (!res.ok) {
      console.error(
        `[semanticConsolidation] supabase supersession patch failed (status=${res.status ?? 'n/a'})`,
      );
    }
  } catch (err) {
    console.error('[semanticConsolidation] supabase supersession patch error:', err);
  }
}

// ── Prompt construction ───────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `You are analyzing a user's memory records to identify durable higher-order patterns about how this person thinks and operates.

Your task: identify 3-7 durable higher-order claims that describe this person's patterns, tendencies, or characteristics — things that go BEYOND the individual facts and reveal something consistent about how they think, work, or make decisions.

Rules:
- Each claim must be supported by at least 3 memories from the list above
- Claims must be behavioral/cognitive patterns, NOT restatements of facts
- Good: "This user tends to front-load planning before execution is confirmed, which creates misalignment between strategy and delivery timelines"
- Bad: "This user likes Python" (just a fact)
- Bad: "This user is smart" (vague/evaluative)
- Claims should be specific enough to actually inform how Atlas responds
- Each claim needs a domain tag: planning | execution | communication | decision-making | learning | creativity | relationships | technical | financial | other

Respond ONLY with valid JSON of the form:
{
  "claims": [
    {
      "claim": "full claim text",
      "domain": "planning",
      "confidence": 0.0-1.0,
      "supporting_memory_indices": [0, 3, 7]
    }
  ]
}`;
}

function buildUserPrompt(formattedMemoryList: string): string {
  return `Below is a sample of what Atlas has learned about this user from their conversations. Each line is prefixed with its 0-based index — use those indices in supporting_memory_indices.

${formattedMemoryList}

Return only the JSON object. No prose, no markdown fences.`;
}

// ── Parsing ───────────────────────────────────────────────────────────────

function parseConsolidationJson(raw: string): z.infer<typeof consolidationOutputSchema> | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  const tryParse = (s: string): z.infer<typeof consolidationOutputSchema> | null => {
    try {
      const obj = JSON.parse(s) as unknown;
      const res = consolidationOutputSchema.safeParse(obj);
      return res.success ? res.data : null;
    } catch {
      return null;
    }
  };

  const direct = tryParse(cleaned);
  if (direct) return direct;

  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  return tryParse(match[0]);
}

// ── Duplicate detection ───────────────────────────────────────────────────

/** Symmetric word-overlap ratio: |A∩B| / min(|A|, |B|). */
function wordOverlapRatio(a: string, b: string): number {
  const wordsA = tokenize(a);
  const wordsB = tokenize(b);
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection += 1;
  }
  const denom = Math.min(wordsA.size, wordsB.size);
  return denom === 0 ? 0 : intersection / denom;
}

const STOPWORDS = new Set([
  'a', 'an', 'and', 'the', 'is', 'are', 'was', 'were', 'to', 'of', 'in', 'on',
  'at', 'for', 'with', 'by', 'as', 'this', 'that', 'these', 'those', 'it',
  'its', 'be', 'been', 'being', 'has', 'have', 'had', 'do', 'does', 'did',
  'but', 'or', 'if', 'then', 'so', 'than', 'user', 'tends',
]);

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

// Exported for tests.
export const __internal = {
  parseConsolidationJson,
  wordOverlapRatio,
  consolidationOutputSchema,
  SUPPORTED_KINDS,
  SEMANTIC_DOMAINS,
};

export type { SemanticDomain };
