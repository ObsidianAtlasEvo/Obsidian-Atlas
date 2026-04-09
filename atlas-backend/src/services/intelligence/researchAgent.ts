import { randomUUID } from 'node:crypto';
import { z } from 'zod';

/** Single cited finding after Tavily search + extract fusion. */
export const verifiedEvidenceItemSchema = z.object({
  id: z.string().min(1).max(80),
  url: z.string().url(),
  title: z.string().min(1).max(500),
  excerpt: z.string().min(1).max(24_000),
  engines: z.array(z.enum(['tavily_search', 'tavily_extract'])).min(1),
  retrievedAt: z.string().min(1),
});

export type VerifiedEvidenceItem = z.infer<typeof verifiedEvidenceItemSchema>;

export const verifiedEvidenceArraySchema = z.array(verifiedEvidenceItemSchema);

export type ResearchTerminalHandler = (message: string) => void;

/** Break a complex prompt into 2–3 focused web queries (no extra LLM — keeps latency predictable). */
export function decomposeResearchQueries(userPrompt: string): string[] {
  const core = userPrompt.trim().replace(/\s+/g, ' ').slice(0, 500);
  if (!core) return ['atlas research query'];

  const sentences = core
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const first = sentences[0] ?? core;

  const queries: string[] = [first];
  if (sentences.length > 1 && queries.length < 3) {
    queries.push(sentences[1]!.slice(0, 240));
  }
  if (queries.length < 3 && core.length > 80) {
    queries.push(`${first.slice(0, 120)} key facts evidence`);
  }
  return queries.slice(0, 3);
}

type TavilySearchResult = {
  url: string;
  title?: string;
  content?: string;
  raw_content?: string;
};

async function tavilySearch(
  apiKey: string,
  query: string,
  signal?: AbortSignal
): Promise<TavilySearchResult[]> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query: query.slice(0, 400),
      search_depth: 'advanced',
      include_raw_content: true,
      max_results: 8,
    }),
    signal,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Tavily search ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = (await res.json()) as { results?: TavilySearchResult[] };
  return data.results ?? [];
}

type TavilyExtractChunk = { url: string; raw_content?: string };

async function tavilyExtractUrls(
  apiKey: string,
  urls: string[],
  signal?: AbortSignal
): Promise<TavilyExtractChunk[]> {
  if (urls.length === 0) return [];

  const res = await fetch('https://api.tavily.com/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      urls: urls.slice(0, 15),
    }),
    signal,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Tavily extract ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = (await res.json()) as { results?: TavilyExtractChunk[] };
  return data.results ?? [];
}

function normalizeUrlKey(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    return u.href.replace(/\/$/, '');
  } catch {
    return url;
  }
}

function dedupeAndBuildEvidence(
  byUrl: Map<
    string,
    {
      title: string;
      excerpt: string;
      engines: Set<VerifiedEvidenceItem['engines'][number]>;
    }
  >
): VerifiedEvidenceItem[] {
  const out: VerifiedEvidenceItem[] = [];
  const now = new Date().toISOString();
  for (const [url, v] of byUrl) {
    const engines = [...v.engines];
    const parsed = verifiedEvidenceItemSchema.safeParse({
      id: randomUUID(),
      url,
      title: v.title.slice(0, 500),
      excerpt: v.excerpt.slice(0, 24_000),
      engines,
      retrievedAt: now,
    });
    if (parsed.success) out.push(parsed.data);
  }
  return out.slice(0, 24);
}

/**
 * Tavily-only sovereign research: advanced search per sub-query, then extract on top URLs.
 * `tavilyApiKey` comes from quotaManager (BYOK or system key after quota check).
 */
export async function runSovereignTavilyResearch(input: {
  userPrompt: string;
  tavilyApiKey: string;
  onTerminal?: ResearchTerminalHandler;
  signal?: AbortSignal;
}): Promise<VerifiedEvidenceItem[]> {
  const { userPrompt, tavilyApiKey, onTerminal, signal } = input;
  const key = tavilyApiKey.trim();
  if (!key) {
    onTerminal?.('No Tavily API key available — skipping web evidence (model knowledge only).');
    return [];
  }

  const queries = decomposeResearchQueries(userPrompt);
  onTerminal?.(`Decomposed ${queries.length} research queries (Tavily advanced)…`);

  const byUrl = new Map<
    string,
    { title: string; excerpt: string; engines: Set<VerifiedEvidenceItem['engines'][number]> }
  >();

  const add = (
    url: string,
    title: string,
    excerpt: string,
    engine: VerifiedEvidenceItem['engines'][number]
  ) => {
    const k = normalizeUrlKey(url);
    if (!k.startsWith('http')) return;
    const prev = byUrl.get(k);
    const mergedExcerpt = prev
      ? `${prev.excerpt}\n\n---\n\n${excerpt}`.slice(0, 24_000)
      : excerpt.slice(0, 24_000);
    const engines = prev?.engines ?? new Set();
    engines.add(engine);
    byUrl.set(k, { title: title || k, excerpt: mergedExcerpt, engines });
  };

  let searchOk = true;

  for (const q of queries) {
    try {
      onTerminal?.(`Tavily search (advanced): "${q.slice(0, 80)}${q.length > 80 ? '…' : ''}"`);
      const tResults = await tavilySearch(key, q, signal);
      for (const r of tResults) {
        const body = (r.raw_content ?? r.content ?? '').slice(0, 8000);
        add(r.url, r.title ?? r.url, body || r.url, 'tavily_search');
      }
    } catch (e) {
      searchOk = false;
      onTerminal?.(
        `Tavily search error (${e instanceof Error ? e.message : String(e)}). Continuing with any prior sources or internal knowledge.`
      );
    }
  }

  const topUrls = [...byUrl.keys()].slice(0, 12);
  if (topUrls.length) {
    try {
      onTerminal?.(`Tavily extracting markdown from ${topUrls.length} URLs…`);
      const extracted = await tavilyExtractUrls(key, topUrls, signal);
      for (const ex of extracted) {
        if (ex.raw_content?.trim()) {
          add(ex.url, ex.url, ex.raw_content.slice(0, 12_000), 'tavily_extract');
        }
      }
    } catch (e) {
      onTerminal?.(
        `Tavily extract skipped (${e instanceof Error ? e.message : String(e)}). Using search snippets only.`
      );
    }
  }

  const evidence = dedupeAndBuildEvidence(byUrl);
  onTerminal?.(
    `Structured ${evidence.length} cited sources from Tavily${!searchOk && evidence.length === 0 ? ' (no coverage)' : !searchOk ? ' (partial coverage)' : ''}.`
  );

  const validated = verifiedEvidenceArraySchema.safeParse(evidence);
  return validated.success ? validated.data : [];
}

export function formatVerifiedEvidenceForPrompt(evidence: VerifiedEvidenceItem[]): string {
  if (evidence.length === 0) {
    return '(no web evidence retrieved — rely on careful reasoning and flag uncertainty)';
  }
  return evidence
    .map(
      (e, i) =>
        `### Source ${i + 1}\n- URL: ${e.url}\n- Title: ${e.title}\n- Engines: ${e.engines.join(', ')}\n- Excerpt:\n${e.excerpt.slice(0, 6000)}${e.excerpt.length > 6000 ? '…' : ''}`
    )
    .join('\n\n');
}
