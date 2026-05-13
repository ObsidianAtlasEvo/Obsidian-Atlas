import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  getDeepResearchQuotaSnapshot,
  setUserTavilyByok,
} from '../services/intelligence/quotaManager.js';
import { supabaseRest } from '../db/supabase.js';
import { getDb } from '../db/sqlite.js';
import { generateDigestForUser } from '../services/autonomy/digestGeneratorService.js';
import { listTruthEntriesAsync } from '../services/governance/truthLedgerService.js';

const quotaBodySchema = z.object({
  userId: z.string().min(1),
});

const byokBodySchema = z.object({
  userId: z.string().min(1),
  /** Set to `null` or empty string to clear BYOK. */
  tavilyApiKey: z.union([z.string(), z.null()]),
});

// ── Constitutional principles ───────────────────────────────────────────────

const principleCreateSchema = z.object({
  principle_text: z.string().min(1).max(2000),
});

const principleUpdateSchema = z.object({
  principle_text: z.string().min(1).max(2000).optional(),
  active: z.boolean().optional(),
});

const transparencyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const identityMemoriesQuerySchema = z.object({
  kind: z.string().trim().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// ── Identity profile types ──────────────────────────────────────────────────

interface IdentitySignalRow {
  domain: string;
  signal_content: string;
  identity_weight: number | null;
  scope_confidence: number | null;
  provenance: string | null;
  created_at: string;
}

interface UserMemoryRow {
  id: string;
  kind: string;
  content: string;
  provenance: string | null;
  stability_score: number | null;
  created_at: string;
}

interface EvolutionEventRow {
  event_type: string;
  title: string;
  body: string;
  significance: number;
  related_domain: string | null;
  created_at: string;
}

interface SemanticClaimRow {
  claim: string;
  domain: string | null;
  confidence: number;
  evidence_count: number;
  created_at: string;
}

interface PrincipleRow {
  id: string;
  user_id: string;
  principle_text: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface TransparencyRow {
  id: string;
  session_id: string;
  response_id: string | null;
  passed: boolean;
  principles_checked: number;
  compliance_score: number | null;
  violations: unknown;
  created_at: string;
}

interface IntelligenceDigestRow {
  id: string;
  user_id: string;
  digest_type: string;
  event_count: number;
  digest_markdown: string;
  viewed: boolean;
  viewed_at: string | null;
  created_at: string;
}

interface UnackedCountRow {
  id: string;
}

export function registerSovereigntyRoutes(app: FastifyInstance): void {
  app.post('/v1/sovereignty/deep-research-quota', async (request, reply) => {
    const parsed = quotaBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    const snap = getDeepResearchQuotaSnapshot(parsed.data.userId);
    return reply.send({
      hasByok: snap.hasByok,
      unlimited: snap.unlimited,
      usedToday: snap.usedToday,
      limit: snap.limit,
      resetsUtcMidnight: snap.resetsUtcMidnight,
    });
  });

  app.put('/v1/sovereignty/tavily-byok', async (request, reply) => {
    const parsed = byokBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    const raw = parsed.data.tavilyApiKey;
    setUserTavilyByok(parsed.data.userId, raw === null ? null : raw);
    return reply.send({ ok: true });
  });

  // ── Constitutional principles CRUD ──────────────────────────────────────

  app.get('/v1/sovereignty/principles', async (request, reply) => {
    const auth = request.atlasAuthUser;
    if (!auth?.supabaseId) {
      return reply.status(401).send({ error: 'unauthenticated' });
    }
    const userId = auth.supabaseId;

    const result = await supabaseRest<PrincipleRow[]>(
      'GET',
      `user_constitutional_principles?user_id=eq.${encodeURIComponent(userId)}&select=id,user_id,principle_text,active,created_at,updated_at&order=created_at.desc`,
    );
    if (!result.ok) return reply.status(500).send({ error: 'fetch_failed' });
    return reply.send({ principles: result.data ?? [] });
  });

  app.post('/v1/sovereignty/principles', async (request, reply) => {
    const auth = request.atlasAuthUser;
    if (!auth?.supabaseId) {
      return reply.status(401).send({ error: 'unauthenticated' });
    }
    const parsed = principleCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    const result = await supabaseRest<PrincipleRow[]>(
      'POST',
      'user_constitutional_principles',
      [{
        user_id: auth.supabaseId,
        principle_text: parsed.data.principle_text,
        active: true,
      }],
    );
    if (!result.ok || !result.data || result.data.length === 0) {
      return reply.status(500).send({ error: 'create_failed' });
    }
    return reply.status(201).send({ principle: result.data[0] });
  });

  app.patch<{ Params: { id: string } }>('/v1/sovereignty/principles/:id', async (request, reply) => {
    const auth = request.atlasAuthUser;
    if (!auth?.supabaseId) {
      return reply.status(401).send({ error: 'unauthenticated' });
    }
    const parsed = principleUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    if (parsed.data.principle_text === undefined && parsed.data.active === undefined) {
      return reply.status(400).send({ error: 'no_fields_to_update' });
    }
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (parsed.data.principle_text !== undefined) patch.principle_text = parsed.data.principle_text;
    if (parsed.data.active !== undefined) patch.active = parsed.data.active;

    const id = request.params.id;
    const result = await supabaseRest<PrincipleRow[]>(
      'PATCH',
      `user_constitutional_principles?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(auth.supabaseId)}`,
      patch,
    );
    if (!result.ok || !result.data || result.data.length === 0) {
      return reply.status(404).send({ error: 'not_found' });
    }
    return reply.send({ principle: result.data[0] });
  });

  app.delete<{ Params: { id: string } }>('/v1/sovereignty/principles/:id', async (request, reply) => {
    const auth = request.atlasAuthUser;
    if (!auth?.supabaseId) {
      return reply.status(401).send({ error: 'unauthenticated' });
    }
    const id = request.params.id;
    const result = await supabaseRest(
      'DELETE',
      `user_constitutional_principles?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(auth.supabaseId)}`,
    );
    if (!result.ok) return reply.status(500).send({ error: 'delete_failed' });
    return reply.send({ ok: true });
  });

  app.get('/v1/sovereignty/transparency-log', async (request, reply) => {
    const auth = request.atlasAuthUser;
    if (!auth?.supabaseId) {
      return reply.status(401).send({ error: 'unauthenticated' });
    }
    const parsed = transparencyQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    const { limit, offset } = parsed.data;

    const result = await supabaseRest<TransparencyRow[]>(
      'GET',
      `behavior_transparency_log?user_id=eq.${encodeURIComponent(auth.supabaseId)}&select=id,session_id,response_id,passed,principles_checked,compliance_score,violations,created_at&order=created_at.desc&limit=${limit}&offset=${offset}`,
    );
    if (!result.ok) return reply.status(500).send({ error: 'fetch_failed' });
    return reply.send({ entries: result.data ?? [], limit, offset });
  });

  // ── Background Intelligence Digest ──────────────────────────────────────

  app.get('/v1/sovereignty/digest', async (request, reply) => {
    const auth = request.atlasAuthUser;
    if (!auth?.supabaseId) {
      return reply.status(401).send({ error: 'unauthenticated' });
    }
    const userId = auth.supabaseId;

    const latest = await supabaseRest<IntelligenceDigestRow[]>(
      'GET',
      `intelligence_digests?user_id=eq.${encodeURIComponent(userId)}` +
        `&select=id,user_id,digest_type,event_count,digest_markdown,viewed,viewed_at,created_at` +
        `&order=created_at.desc&limit=1`,
    );
    if (!latest.ok) return reply.status(500).send({ error: 'fetch_failed' });

    let digest: IntelligenceDigestRow | null = latest.data?.[0] ?? null;
    if (digest && !digest.viewed) {
      const nowIso = new Date().toISOString();
      const upd = await supabaseRest<IntelligenceDigestRow[]>(
        'PATCH',
        `intelligence_digests?id=eq.${encodeURIComponent(digest.id)}&user_id=eq.${encodeURIComponent(userId)}`,
        { viewed: true, viewed_at: nowIso },
      );
      if (upd.ok && upd.data && upd.data.length > 0 && upd.data[0]) {
        digest = upd.data[0];
      } else {
        digest = { ...digest, viewed: true, viewed_at: nowIso };
      }
    }

    const unacked = await supabaseRest<UnackedCountRow[]>(
      'GET',
      `watcher_events?user_id=eq.${encodeURIComponent(userId)}&acknowledged=eq.false&select=id`,
    );
    const unacked_event_count = unacked.ok && unacked.data ? unacked.data.length : 0;

    return reply.send({ digest, unacked_event_count });
  });

  app.post('/v1/sovereignty/digest/generate', async (request, reply) => {
    const auth = request.atlasAuthUser;
    if (!auth?.supabaseId) {
      return reply.status(401).send({ error: 'unauthenticated' });
    }
    const digest = await generateDigestForUser(auth.supabaseId, 'on_demand');
    if (!digest) {
      return reply.send({ message: 'No unacknowledged events to digest' });
    }
    return reply.send({ digest });
  });

  // ── Identity Profile (read-only) ────────────────────────────────────────

  app.get('/v1/sovereignty/identity-profile', async (request, reply) => {
    const auth = request.atlasAuthUser;
    if (!auth?.supabaseId) {
      return reply.status(401).send({ error: 'unauthenticated' });
    }
    const userId = auth.supabaseId;

    // Identity domains (from Supabase identity_signals — grouped client-side).
    let identityDomains: Array<{
      domain: string;
      signal_count: number;
      top_signals: Array<{
        content: string;
        confidence: number;
        kind: string;
        provenance: string;
        created_at: string;
      }>;
    }> = [];
    try {
      const signalsRes = await supabaseRest<IdentitySignalRow[]>(
        'GET',
        `identity_signals?user_id=eq.${encodeURIComponent(userId)}` +
          `&active=eq.true&superseded_by=is.null` +
          `&select=domain,signal_content,identity_weight,scope_confidence,provenance,created_at` +
          `&order=identity_weight.desc.nullslast&limit=200`,
      );
      if (signalsRes.ok && Array.isArray(signalsRes.data)) {
        const byDomain = new Map<string, IdentitySignalRow[]>();
        for (const row of signalsRes.data) {
          const arr = byDomain.get(row.domain) ?? [];
          arr.push(row);
          byDomain.set(row.domain, arr);
        }
        identityDomains = [...byDomain.entries()].map(([domain, rows]) => {
          const sorted = [...rows].sort((a, b) => {
            const ac = a.identity_weight ?? a.scope_confidence ?? 0;
            const bc = b.identity_weight ?? b.scope_confidence ?? 0;
            return bc - ac;
          });
          return {
            domain,
            signal_count: rows.length,
            top_signals: sorted.slice(0, 3).map((s) => ({
              content: s.signal_content,
              confidence: s.identity_weight ?? s.scope_confidence ?? 0,
              kind: 'identity_signal',
              provenance: s.provenance ?? 'assistant_inferred',
              created_at: s.created_at,
            })),
          };
        });
      }
    } catch (err) {
      console.warn('[identity-profile] domain fetch failed:', err instanceof Error ? err.message : err);
    }

    // Memory stats + recent corrections (from Supabase user_memories).
    let memoryStats = {
      total: 0,
      by_kind: {} as Record<string, number>,
      correction_count: 0,
      high_confidence_count: 0,
    };
    let recentCorrections: Array<{ content: string; created_at: string }> = [];
    try {
      const memRes = await supabaseRest<UserMemoryRow[]>(
        'GET',
        `user_memories?user_id=eq.${encodeURIComponent(userId)}` +
          `&superseded_by=is.null` +
          `&select=id,kind,content,provenance,stability_score,created_at` +
          `&order=created_at.desc&limit=1000`,
      );
      if (memRes.ok && Array.isArray(memRes.data)) {
        const byKind: Record<string, number> = {};
        let corrections = 0;
        let highConf = 0;
        for (const m of memRes.data) {
          byKind[m.kind] = (byKind[m.kind] ?? 0) + 1;
          if (m.kind === 'correction') corrections++;
          if ((m.stability_score ?? 0) > 0.7) highConf++;
        }
        memoryStats = {
          total: memRes.data.length,
          by_kind: byKind,
          correction_count: corrections,
          high_confidence_count: highConf,
        };
        recentCorrections = memRes.data
          .filter((m) => m.kind === 'correction')
          .slice(0, 5)
          .map((m) => ({ content: m.content, created_at: m.created_at }));
      }
    } catch (err) {
      console.warn('[identity-profile] memory fetch failed:', err instanceof Error ? err.message : err);
    }

    // Evolution highlights (from SQLite evolution_timeline_events).
    let evolutionHighlights: Array<{
      event_type: string;
      title: string;
      body: string;
      significance: number;
      related_domain: string | null;
      created_at: string;
    }> = [];
    try {
      const db = getDb();
      const rows = db
        .prepare(
          `SELECT event_type, title, body, significance, related_domain, created_at
           FROM evolution_timeline_events
           WHERE user_id = ?
           ORDER BY significance DESC, created_at DESC
           LIMIT 5`,
        )
        .all(userId) as EvolutionEventRow[];
      evolutionHighlights = rows.map((r) => ({
        event_type: r.event_type,
        title: r.title,
        body: r.body,
        significance: r.significance,
        related_domain: r.related_domain,
        created_at: r.created_at,
      }));
    } catch (err) {
      console.warn('[identity-profile] evolution fetch failed:', err instanceof Error ? err.message : err);
    }

    // Truth ledger — routed through truthLedgerService (P4-A2). Honors
    // `storeFlags.truth()` across sqlite / dual / supabase modes.
    let truthLedgerSummary: Array<{ statement: string; status: string; confidence: number }> = [];
    try {
      truthLedgerSummary = await listTruthEntriesAsync(userId, 8);
    } catch (err) {
      console.warn('[identity-profile] truth fetch failed:', err instanceof Error ? err.message : err);
    }

    // Semantic claims (from SQLite semantic_claims).
    let semanticClaims: Array<{
      claim: string;
      domain: string;
      confidence: number;
      evidence_count: number;
      created_at: string;
    }> = [];
    try {
      const db = getDb();
      const rows = db
        .prepare(
          `SELECT claim, domain, confidence, evidence_count, created_at
           FROM semantic_claims
           WHERE user_id = ? AND invalidated_at IS NULL
           ORDER BY confidence DESC
           LIMIT 10`,
        )
        .all(userId) as SemanticClaimRow[];
      semanticClaims = rows.map((r) => ({
        claim: r.claim,
        domain: r.domain ?? 'other',
        confidence: r.confidence,
        evidence_count: r.evidence_count,
        created_at: r.created_at,
      }));
    } catch (err) {
      console.warn('[identity-profile] semantic_claims fetch failed:', err instanceof Error ? err.message : err);
    }

    return reply.send({
      identity_domains: identityDomains,
      memory_stats: memoryStats,
      evolution_highlights: evolutionHighlights,
      recent_corrections: recentCorrections,
      truth_ledger_summary: truthLedgerSummary,
      semantic_claims: semanticClaims,
    });
  });

  app.get('/v1/sovereignty/identity-profile/memories', async (request, reply) => {
    const auth = request.atlasAuthUser;
    if (!auth?.supabaseId) {
      return reply.status(401).send({ error: 'unauthenticated' });
    }
    const parsed = identityMemoriesQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() });
    }
    const { kind, limit, offset } = parsed.data;
    const userId = auth.supabaseId;

    try {
      const kindFilter = kind ? `&kind=eq.${encodeURIComponent(kind)}` : '';
      // Order by correction-kind first, then stability_score desc, then created_at desc.
      // PostgREST: sort by an expression isn't supported, so request a large page and sort here.
      const res = await supabaseRest<UserMemoryRow[]>(
        'GET',
        `user_memories?user_id=eq.${encodeURIComponent(userId)}` +
          `&superseded_by=is.null${kindFilter}` +
          `&select=id,kind,content,provenance,stability_score,created_at` +
          `&order=stability_score.desc.nullslast,created_at.desc&limit=500`,
      );
      const all = res.ok && Array.isArray(res.data) ? res.data : [];
      const sorted = [...all].sort((a, b) => {
        const ac = a.kind === 'correction' ? 1 : 0;
        const bc = b.kind === 'correction' ? 1 : 0;
        if (ac !== bc) return bc - ac;
        const aS = a.stability_score ?? 0;
        const bS = b.stability_score ?? 0;
        if (aS !== bS) return bS - aS;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      const page = sorted.slice(offset, offset + limit);
      return reply.send({
        memories: page.map((m) => ({
          id: m.id,
          content: m.content,
          kind: m.kind,
          provenance: m.provenance ?? 'assistant_inferred',
          stability_score: m.stability_score ?? 0,
          created_at: m.created_at,
        })),
        total: sorted.length,
      });
    } catch (err) {
      console.warn('[identity-profile/memories] failed:', err instanceof Error ? err.message : err);
      return reply.send({ memories: [], total: 0 });
    }
  });

  app.post('/v1/sovereignty/digest/events/acknowledge-all', async (request, reply) => {
    const auth = request.atlasAuthUser;
    if (!auth?.supabaseId) {
      return reply.status(401).send({ error: 'unauthenticated' });
    }
    const userId = auth.supabaseId;
    const nowIso = new Date().toISOString();
    const result = await supabaseRest<UnackedCountRow[]>(
      'PATCH',
      `watcher_events?user_id=eq.${encodeURIComponent(userId)}&acknowledged=eq.false&select=id`,
      { acknowledged: true, acknowledged_at: nowIso },
    );
    if (!result.ok) return reply.status(500).send({ error: 'update_failed' });
    const acknowledged_count = result.data?.length ?? 0;
    return reply.send({ acknowledged_count });
  });
}
