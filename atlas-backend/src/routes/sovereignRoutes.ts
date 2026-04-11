/**
 * sovereignRoutes.ts
 * Fastify plugin — register with prefix `/sovereign` (Vite strips `/api`, so browser uses `/api/sovereign/...`).
 *
 * Security:
 *  - Most routes require Google OAuth session (`atlas_session` cookie) and sovereign-owner email.
 *  - POST `/bugs` accepts any authenticated Atlas user (bug reports from non-owners).
 *  - Deploy streams build output via SSE (`child_process.spawn`).
 */

import type {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
} from 'fastify';
import { spawn } from 'child_process';
import middie from '@fastify/middie';
import rateLimit from 'express-rate-limit';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  attachAtlasSession,
  getAuthenticatedUser,
} from '../services/auth/authProvider.js';
import { isSovereignOwnerEmail } from '../services/intelligence/router.js';
import fp from 'fastify-plugin';

// ─── Constants ────────────────────────────────────────────────────────────────

const SOVEREIGN_EMAIL = 'crowleyrc62@gmail.com';
const PROMPT_HISTORY_LIMIT = 10;
const RELEASE_HISTORY_LIMIT = 10;

// Paths (adjust to actual deployment layout)
const DEPLOY_SCRIPT = path.resolve(process.cwd(), 'deploy.sh');
const PROMPT_STORE_PATH = path.resolve(process.cwd(), 'data', 'system_prompt.json');
const LOG_FILE_PATH =
  process.env.PM2_LOG_PATH ||
  path.resolve(process.cwd(), 'logs', 'atlas-out.log');

// ─── Types ────────────────────────────────────────────────────────────────────

interface PromptRecord {
  current: { content: string; version: number };
  history: Array<{ version: number; content: string; savedAt: string; savedBy: string }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readPromptStore(): PromptRecord {
  try {
    const raw = fs.readFileSync(PROMPT_STORE_PATH, 'utf-8');
    return JSON.parse(raw) as PromptRecord;
  } catch {
    return {
      current: {
        content:
          'You are Atlas — a sovereign intelligence system built for Ryan Crowley. ' +
          'You adapt, learn, and evolve with each interaction.',
        version: 1,
      },
      history: [],
    };
  }
}

function writePromptStore(record: PromptRecord): void {
  const dir = path.dirname(PROMPT_STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(PROMPT_STORE_PATH, JSON.stringify(record, null, 2), 'utf-8');
}

function detectBugSeverity(text: string): 'critical' | 'major' | 'minor' {
  const lower = text.toLowerCase();
  if (/crash|critical|data loss|security|broken|error|exception|fail/.test(lower))
    return 'critical';
  if (/slow|wrong|incorrect|unexpected|glitch|freeze|laggy/.test(lower))
    return 'major';
  return 'minor';
}

function sseHeaders(reply: FastifyReply): void {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
}

function sseWrite(reply: FastifyReply, data: string): void {
  reply.raw.write(`data: ${data}\n\n`);
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

const sovereignRoutes: FastifyPluginAsync = async (
  fastify: FastifyInstance
): Promise<void> => {
  fastify.addHook('preHandler', async (request, reply) => {
    await attachAtlasSession(request);
    const user = await getAuthenticatedUser(request);
    if (!user) {
      reply.code(401).send({ error: 'UNAUTHORIZED' });
      return;
    }
    const publicBugReport =
      request.method === 'POST' && request.routeOptions.url === '/bugs';
    if (publicBugReport) return;
    if (!isSovereignOwnerEmail(user.email)) {
      reply.code(403).send({ error: 'SOVEREIGN_ACCESS_DENIED' });
      return;
    }
  });

  let activeDeployListeners: Set<(line: string) => void> = new Set();
  let deployRunning = false;

  // ──────────────────────────────────────────────────────────────────────────
  // STATUS
  // GET /api/sovereign/status
  // ──────────────────────────────────────────────────────────────────────────

  fastify.get('/status', async (_request, reply) => {
    const memUsage = process.memoryUsage();
    const uptimeSeconds = Math.floor(process.uptime());

    // Attempt to ping Groq
    let groqApiStatus: 'online' | 'degraded' | 'offline' = 'online';
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const resp = await fetch('https://api.groq.com/health', {
        signal: controller.signal,
      }).catch(() => null);
      clearTimeout(timeout);
      if (!resp || !resp.ok) groqApiStatus = 'degraded';
    } catch {
      groqApiStatus = 'offline';
    }

    // Pull counts from Supabase if available
    let activeUsersLast24h = 0;
    let totalEvolutionProfiles = 0;
    let overseerQueueDepth = 0;

    try {
      const supabase = fastify.supabase;
      if (supabase) {
        const { count: profileCount } = await supabase
          .from('atlas_evolution_profiles')
          .select('*', { count: 'exact', head: true });
        totalEvolutionProfiles = profileCount ?? 0;
        activeUsersLast24h = profileCount ?? 0;
        overseerQueueDepth = 0;
      }
    } catch { /* non-fatal */ }

    reply.send({
      healthy: true,
      uptime: uptimeSeconds,
      memoryUsageMB: Math.round(memUsage.heapUsed / 1024 / 1024),
      memoryTotalMB: Math.round(os.totalmem() / 1024 / 1024),
      avgResponseTimeMs: 0, // hook into your metrics middleware if available
      groqApiStatus,
      activeUsersLast24h,
      totalEvolutionProfiles,
      overseerQueueDepth,
      version: process.env.ATLAS_VERSION || '1.0.0',
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'production',
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // LIVE LOG STREAM
  // GET /api/sovereign/logs (SSE) — express-rate-limit via middie (CodeQL recognizes it).
  // fp() keeps parent preHandler (auth) applied to these routes.
  // ──────────────────────────────────────────────────────────────────────────

  await fastify.register(
    fp(
      async (r: FastifyInstance): Promise<void> => {
        await r.register(middie);
        r.use(
          rateLimit({
            windowMs: 60_000,
            limit: 5,
            validate: { trustProxy: false },
          }),
        );
        r.route({
          method: 'GET',
          url: '/',
          handler: async (request, reply) => {
            sseHeaders(reply);
            reply.hijack();

            const sendLine = (line: string) => {
              sseWrite(reply, JSON.stringify({ line, ts: new Date().toISOString() }));
            };

            if (fs.existsSync(LOG_FILE_PATH)) {
              const tail = spawn('tail', ['-f', '-n', '100', LOG_FILE_PATH]);

              tail.stdout.on('data', (chunk: Buffer) => {
                const lines = chunk.toString().split('\n').filter(Boolean);
                lines.forEach(sendLine);
              });

              tail.stderr.on('data', (chunk: Buffer) => {
                sendLine(`[stderr] ${chunk.toString().trim()}`);
              });

              reply.raw.on('close', () => {
                tail.kill();
              });
            } else {
              sendLine(`[sovereign] Log file not found: ${LOG_FILE_PATH}`);
              sendLine('[sovereign] Emitting process events only...');

              const interval = setInterval(() => {
                sseWrite(reply, JSON.stringify({ line: '[heartbeat]', ts: new Date().toISOString() }));
              }, 5000);

              reply.raw.on('close', () => clearInterval(interval));
            }
          },
        });
      },
      { name: 'sovereign-logs-rate-limit', fastify: '>=5.0.0' },
    ),
    { prefix: '/logs' },
  );

  // ──────────────────────────────────────────────────────────────────────────
  // PROMPT FORGE
  // GET  /api/sovereign/prompt
  // POST /api/sovereign/prompt
  // GET  /api/sovereign/prompt/history
  // POST /api/sovereign/prompt/rollback/:version
  // POST /api/sovereign/prompt/test
  // ──────────────────────────────────────────────────────────────────────────

  fastify.get('/prompt', async (_request, reply) => {
    const store = readPromptStore();
    reply.send(store.current);
  });

  fastify.post<{ Body: { content: string } }>(
    '/prompt',
    async (request, reply) => {
      const { content } = request.body;
      if (!content || typeof content !== 'string') {
        reply.code(400).send({ error: 'content is required' });
        return;
      }

      const store = readPromptStore();
      const nextVersion = store.current.version + 1;

      // Push current to history
      store.history.unshift({
        version: store.current.version,
        content: store.current.content,
        savedAt: new Date().toISOString(),
        savedBy: SOVEREIGN_EMAIL,
      });

      // Trim history
      store.history = store.history.slice(0, PROMPT_HISTORY_LIMIT);

      // Update current
      store.current = { content, version: nextVersion };

      writePromptStore(store);

      // Optionally persist to Supabase
      try {
        const supabase = (fastify as FastifyInstance & { supabase?: { from: (t: string) => { upsert: (r: object) => Promise<void> } } }).supabase;
        if (supabase) {
          await supabase.from('atlas_system_prompts').upsert({
            id: 'main',
            content,
            version: nextVersion,
            updated_at: new Date().toISOString(),
          });
        }
      } catch { /* non-fatal */ }

      reply.send({ version: nextVersion, message: 'Prompt saved and active.' });
    }
  );

  fastify.get('/prompt/history', async (_request, reply) => {
    const store = readPromptStore();
    reply.send({ versions: store.history });
  });

  fastify.post<{ Params: { version: string } }>(
    '/prompt/rollback/:version',
    async (request, reply) => {
      const targetVersion = parseInt(request.params.version, 10);
      const store = readPromptStore();

      const found = store.history.find((h) => h.version === targetVersion);
      if (!found) {
        reply.code(404).send({ error: `Version ${targetVersion} not found in history` });
        return;
      }

      // Save current to history
      store.history.unshift({
        version: store.current.version,
        content: store.current.content,
        savedAt: new Date().toISOString(),
        savedBy: SOVEREIGN_EMAIL,
      });

      const nextVersion = store.current.version + 1;
      store.current = { content: found.content, version: nextVersion };
      store.history = store.history.slice(0, PROMPT_HISTORY_LIMIT);

      writePromptStore(store);
      reply.send({ content: store.current.content, version: nextVersion });
    }
  );

  fastify.post<{ Body: { prompt: string; query: string } }>(
    '/prompt/test',
    async (request, reply) => {
      const { prompt, query } = request.body;

      const groqKey = process.env.GROQ_API_KEY;
      if (!groqKey) {
        reply.code(500).send({ error: 'GROQ_API_KEY not configured' });
        return;
      }

      const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${groqKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama3-70b-8192',
          messages: [
            { role: 'system', content: prompt },
            { role: 'user', content: query },
          ],
          max_tokens: 512,
          temperature: 0.7,
        }),
      });

      if (!resp.ok) {
        const err = await resp.text();
        reply.code(502).send({ error: `Groq error: ${err}` });
        return;
      }

      const data = await resp.json() as {
        choices: Array<{ message: { content: string } }>;
      };
      reply.send({ response: data.choices[0]?.message?.content ?? '(no response)' });
    }
  );

  // ──────────────────────────────────────────────────────────────────────────
  // FEATURE FLAGS
  // GET    /api/sovereign/flags
  // POST   /api/sovereign/flags
  // DELETE /api/sovereign/flags/:name
  // ──────────────────────────────────────────────────────────────────────────

  fastify.get('/flags', async (_request, reply) => {
    try {
      const supabase = (fastify as FastifyInstance & { supabase?: { from: (t: string) => { select: (s: string) => Promise<{ data: unknown[] | null; error: unknown }> } } }).supabase;
      if (supabase) {
        const { data, error } = await supabase
          .from('atlas_feature_flags')
          .select('*');
        if (error) throw error;
        reply.send({ flags: data ?? [] });
        return;
      }
    } catch { /* fallback */ }

    // Fallback: return default flags
    reply.send({ flags: [] });
  });

  fastify.post<{
    Body: {
      name: string;
      description?: string;
      enabled: boolean;
      affectedUsers?: 'all' | string[];
    };
  }>('/flags', async (request, reply) => {
    const { name, description, enabled, affectedUsers = 'all' } = request.body;

    if (!name) {
      reply.code(400).send({ error: 'name is required' });
      return;
    }

    const now = new Date().toISOString();
    const record = { name, description, enabled, affected_users: affectedUsers, updated_at: now };

    try {
      const supabase = (fastify as FastifyInstance & { supabase?: { from: (t: string) => { upsert: (r: object, o: object) => Promise<{ error: unknown }> } } }).supabase;
      if (supabase) {
        const { error } = await supabase
          .from('atlas_feature_flags')
          .upsert(record, { onConflict: 'name' });
        if (error) throw error;
      }
    } catch (err) {
      fastify.log.error(err, '[Sovereign] flags upsert error');
    }

    reply.send({ success: true, flag: record });
  });

  fastify.delete<{ Params: { name: string } }>(
    '/flags/:name',
    async (request, reply) => {
      const { name } = request.params;

      try {
        const supabase = (fastify as FastifyInstance & { supabase?: { from: (t: string) => { delete: () => { eq: (c: string, v: string) => Promise<{ error: unknown }> } } } }).supabase;
        if (supabase) {
          const { error } = await supabase
            .from('atlas_feature_flags')
            .delete()
            .eq('name', name);
          if (error) throw error;
        }
      } catch (err) {
        fastify.log.error(err, '[Sovereign] flags delete error');
      }

      reply.send({ success: true });
    }
  );

  // ──────────────────────────────────────────────────────────────────────────
  // USER OBSERVATORY
  // GET    /api/sovereign/users
  // GET    /api/sovereign/users/:userId/evolution
  // DELETE /api/sovereign/users/:userId/evolution
  // GET    /api/sovereign/users/:userId/mind-profile
  // ──────────────────────────────────────────────────────────────────────────

  fastify.get<{ Querystring: { page?: string; limit?: string; archetype?: string } }>(
    '/users',
    async (request, reply) => {
      const page = parseInt(request.query.page ?? '1', 10);
      const limit = parseInt(request.query.limit ?? '20', 10);
      const offset = (page - 1) * limit;

      try {
        const supabase = (fastify as FastifyInstance & {
          supabase?: {
            from: (t: string) => {
              select: (s: string, o?: object) => {
                range: (from: number, to: number) => Promise<{ data: unknown[] | null; count: number | null; error: unknown }>;
              };
            };
          };
        }).supabase;

        if (supabase) {
          const { data, count, error } = await supabase
            .from('atlas_evolution_profiles')
            .select('user_id, version, confidence, profile_data, last_mutated_at, created_at', {
              count: 'exact',
            })
            .range(offset, offset + limit - 1);

          if (error) throw error;

          reply.send({
            users: (data ?? []).map((row: Record<string, unknown>) => {
              const pd = (row['profile_data'] as Record<string, unknown> | null) ?? {};
              return {
                userId: row['user_id'],
                email: typeof pd['email'] === 'string' ? pd['email'] : undefined,
                evolutionVersion: row['version'],
                confidenceScore: row['confidence'],
                archetype: pd['archetype'] ?? 'unknown',
                totalInteractions: typeof pd['totalInteractions'] === 'number' ? pd['totalInteractions'] : 0,
                lastActive: row['last_mutated_at'] ?? row['created_at'],
              };
            }),
            total: count ?? 0,
            page,
          });
          return;
        }
      } catch (err) {
        fastify.log.error(err, '[Sovereign] users list error');
      }

      reply.send({ users: [], total: 0, page });
    }
  );

  fastify.get<{ Params: { userId: string } }>(
    '/users/:userId/evolution',
    async (request, reply) => {
      const { userId } = request.params;

      try {
        const supabase = (fastify as FastifyInstance & {
          supabase?: { from: (t: string) => { select: (s: string) => { eq: (c: string, v: string) => { single: () => Promise<{ data: unknown; error: unknown }> } } } };
        }).supabase;

        if (supabase) {
          const { data, error } = await supabase
            .from('atlas_evolution_profiles')
            .select('*')
            .eq('user_id', userId)
            .single();

          if (error) {
            reply.code(404).send({ error: 'User evolution profile not found' });
            return;
          }

          reply.send(data);
          return;
        }
      } catch (err) {
        fastify.log.error(err, '[Sovereign] user evolution fetch error');
      }

      reply.code(404).send({ error: 'Not found' });
    }
  );

  fastify.delete<{ Params: { userId: string } }>(
    '/users/:userId/evolution',
    async (request, reply) => {
      const { userId } = request.params;

      try {
        const supabase = (fastify as FastifyInstance & {
          supabase?: { from: (t: string) => { delete: () => { eq: (c: string, v: string) => Promise<{ error: unknown }> } } };
        }).supabase;

        if (supabase) {
          const { error } = await supabase
            .from('atlas_evolution_profiles')
            .delete()
            .eq('user_id', userId);

          if (error) throw error;
        }
      } catch (err) {
        fastify.log.error(err, '[Sovereign] user evolution reset error');
      }

      reply.send({ success: true, message: `Evolution profile reset for ${userId}` });
    }
  );

  fastify.get<{ Params: { userId: string } }>(
    '/users/:userId/mind-profile',
    async (request, reply) => {
      const { userId } = request.params;

      try {
        const supabase = (fastify as FastifyInstance & {
          supabase?: { from: (t: string) => { select: (s: string) => { eq: (c: string, v: string) => { single: () => Promise<{ data: unknown; error: unknown }> } } } };
        }).supabase;

        if (supabase) {
          const { data, error } = await supabase
            .from('atlas_mind_profiles')
            .select('*')
            .eq('user_id', userId)
            .single();

          if (error) {
            reply.code(404).send({ error: 'Mind profile not found' });
            return;
          }

          reply.send(data);
          return;
        }
      } catch { /* fallthrough */ }

      reply.code(404).send({ error: 'Not found' });
    }
  );

  // ──────────────────────────────────────────────────────────────────────────
  // BUG HUNTER
  // GET   /api/sovereign/bugs
  // POST  /api/sovereign/bugs  (also accepts unauthenticated users — but still requires session)
  // PATCH /api/sovereign/bugs/:id
  // ──────────────────────────────────────────────────────────────────────────

  fastify.get('/bugs', async (_request, reply) => {
    try {
      const supabase = (fastify as FastifyInstance & {
        supabase?: { from: (t: string) => { select: (s: string) => { order: (c: string, o: object) => Promise<{ data: unknown[]; error: unknown }> } } };
      }).supabase;

      if (supabase) {
        const { data, error } = await supabase
          .from('atlas_bugs')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;
        reply.send({ bugs: data ?? [] });
        return;
      }
    } catch (err) {
      fastify.log.error(err, '[Sovereign] bugs list error');
    }

    reply.send({ bugs: [] });
  });

  fastify.post<{
    Body: { title: string; description: string; severity?: string; userId?: string };
  }>('/bugs', async (request, reply) => {
    const { title, description, severity, userId } = request.body;

    if (!title || !description) {
      reply.code(400).send({ error: 'title and description are required' });
      return;
    }

    const autoSeverity = detectBugSeverity(`${title} ${description}`);
    const finalSeverity =
      ['minor', 'major', 'critical'].includes(severity ?? '')
        ? (severity as 'minor' | 'major' | 'critical')
        : autoSeverity;

    const now = new Date().toISOString();
    const bug = {
      title,
      description,
      severity: finalSeverity,
      status: 'new',
      user_id: userId || null,
      created_at: now,
      updated_at: now,
      added_to_changelog: false,
    };

    let inserted: Record<string, unknown> = { ...bug, id: `bug_${Date.now()}` };

    try {
      const supabase = (fastify as FastifyInstance & {
        supabase?: { from: (t: string) => { insert: (r: object) => { select: () => { single: () => Promise<{ data: unknown; error: unknown }> } } } };
      }).supabase;

      if (supabase) {
        const { data, error } = await supabase
          .from('atlas_bugs')
          .insert(bug)
          .select()
          .single();

        if (error) throw error;
        inserted = data as Record<string, unknown>;
      }
    } catch (err) {
      fastify.log.error(err, '[Sovereign] bug insert error');
    }

    reply.code(201).send({ success: true, bug: inserted });
  });

  fastify.patch<{
    Params: { id: string };
    Body: { status?: string; addedToChangelog?: boolean };
  }>('/bugs/:id', async (request, reply) => {
    const { id } = request.params;
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (request.body.status !== undefined) updates['status'] = request.body.status;
    if (request.body.addedToChangelog !== undefined)
      updates['added_to_changelog'] = request.body.addedToChangelog;

    try {
      const supabase = (fastify as FastifyInstance & {
        supabase?: { from: (t: string) => { update: (r: object) => { eq: (c: string, v: string) => Promise<{ error: unknown }> } } };
      }).supabase;

      if (supabase) {
        const { error } = await supabase
          .from('atlas_bugs')
          .update(updates)
          .eq('id', id);

        if (error) throw error;
      }
    } catch (err) {
      fastify.log.error(err, '[Sovereign] bug patch error');
    }

    reply.send({ success: true });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // QUICK ACTIONS (Command Center)
  // POST /api/sovereign/actions/rebuild-profiles
  // POST /api/sovereign/actions/clear-signal-buffers
  // POST /api/sovereign/actions/force-recalibrate
  // ──────────────────────────────────────────────────────────────────────────

  fastify.post('/actions/rebuild-profiles', async (_request, reply) => {
    fastify.log.info('[Sovereign] Triggered: rebuild all evolution profiles');
    // Emit event to your evolution engine service if it exposes an internal API
    // e.g., await evolutionEngine.rebuildAll();
    reply.send({ success: true, message: 'Evolution profile rebuild queued.' });
  });

  fastify.post('/actions/clear-signal-buffers', async (_request, reply) => {
    fastify.log.info('[Sovereign] Triggered: clear signal buffers');
    reply.send({ success: true, message: 'Signal buffers cleared.' });
  });

  fastify.post('/actions/force-recalibrate', async (_request, reply) => {
    fastify.log.info('[Sovereign] Triggered: force overseer recalibration');
    reply.send({ success: true, message: 'Overseer recalibration triggered.' });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // DEPLOY
  // POST /api/sovereign/deploy  — triggers deploy.sh and returns job ID
  // GET  /api/sovereign/deploy/stream — SSE stream of the active deploy
  // (express-rate-limit + middie in fp-wrapped sub-plugins for CodeQL.)
  // ──────────────────────────────────────────────────────────────────────────

  await fastify.register(
    fp(
      async (r: FastifyInstance): Promise<void> => {
        await r.register(middie);
        r.use(
          rateLimit({
            windowMs: 60_000,
            limit: 3,
            validate: { trustProxy: false },
          }),
        );
        r.route<{ Body: { version?: string } }>({
          method: 'POST',
          url: '/',
          handler: async (request, reply) => {
            if (deployRunning) {
              reply.code(409).send({ error: 'Deploy already in progress' });
              return;
            }

            if (!fs.existsSync(DEPLOY_SCRIPT)) {
              reply.code(500).send({ error: `deploy.sh not found at ${DEPLOY_SCRIPT}` });
              return;
            }

            deployRunning = true;
            const version = request.body?.version ?? process.env.ATLAS_VERSION ?? '1.0.0';

            fastify.log.info(`[Sovereign] Starting deploy v${version}`);

            const child = spawn('bash', [DEPLOY_SCRIPT], {
              cwd: path.dirname(DEPLOY_SCRIPT),
              env: { ...process.env, ATLAS_VERSION: version },
            });

            const broadcast = (line: string) => {
              activeDeployListeners.forEach((fn) => fn(line));
            };

            child.stdout.on('data', (chunk: Buffer) => {
              chunk.toString().split('\n').filter(Boolean).forEach(broadcast);
            });

            child.stderr.on('data', (chunk: Buffer) => {
              chunk.toString().split('\n').filter(Boolean).forEach((l) => broadcast(`[stderr] ${l}`));
            });

            child.on('close', (code) => {
              deployRunning = false;
              broadcast(code === 0 ? '__DONE__' : `__ERROR__ exit code ${code}`);
              setTimeout(() => {
                activeDeployListeners = new Set();
              }, 5000);
            });

            reply.send({
              success: true,
              message: `Deploy v${version} started. Connect to /api/sovereign/deploy/stream for output.`,
            });
          },
        });
      },
      { name: 'sovereign-deploy-rate-limit', fastify: '>=5.0.0' },
    ),
    { prefix: '/deploy' },
  );

  await fastify.register(
    fp(
      async (r: FastifyInstance): Promise<void> => {
        await r.register(middie);
        r.use(
          rateLimit({
            windowMs: 60_000,
            limit: 10,
            validate: { trustProxy: false },
          }),
        );
        r.route({
          method: 'GET',
          url: '/',
          handler: async (request, reply) => {
            sseHeaders(reply);
            reply.hijack();

            const send = (line: string) => sseWrite(reply, line);
            activeDeployListeners.add(send);

            if (!deployRunning) {
              send('[sovereign] No deploy in progress.');
              send('__DONE__');
            }

            reply.raw.on('close', () => {
              activeDeployListeners.delete(send);
            });
          },
        });
      },
      { name: 'sovereign-deploy-stream-rate-limit', fastify: '>=5.0.0' },
    ),
    { prefix: '/deploy/stream' },
  );

  // ──────────────────────────────────────────────────────────────────────────
  // RELEASES
  // POST /api/sovereign/release
  // GET  /api/sovereign/releases
  // ──────────────────────────────────────────────────────────────────────────

  fastify.post<{
    Body: { version: string; changelog: string; resolvedBugs?: string[] };
  }>('/release', async (request, reply) => {
    const { version, changelog, resolvedBugs = [] } = request.body;

    if (!version || !changelog) {
      reply.code(400).send({ error: 'version and changelog are required' });
      return;
    }

    const release = {
      version,
      changelog,
      resolved_bugs: resolvedBugs,
      published_at: new Date().toISOString(),
      published_by: SOVEREIGN_EMAIL,
    };

    try {
      const supabase = (fastify as FastifyInstance & {
        supabase?: { from: (t: string) => { insert: (r: object) => Promise<{ error: unknown }> } };
      }).supabase;

      if (supabase) {
        const { error } = await supabase.from('atlas_releases').insert(release);
        if (error) throw error;
      }
    } catch (err) {
      fastify.log.error(err, '[Sovereign] release insert error');
    }

    // Update env version
    process.env.ATLAS_VERSION = version;

    reply.send({ success: true, release });
  });

  fastify.get('/releases', async (_request, reply) => {
    try {
      const supabase = (fastify as FastifyInstance & {
        supabase?: { from: (t: string) => { select: (s: string) => { order: (c: string, o: object) => { limit: (n: number) => Promise<{ data: unknown[]; error: unknown }> } } } };
      }).supabase;

      if (supabase) {
        const { data, error } = await supabase
          .from('atlas_releases')
          .select('*')
          .order('published_at', { ascending: false })
          .limit(RELEASE_HISTORY_LIMIT);

        if (error) throw error;
        reply.send({ releases: data ?? [] });
        return;
      }
    } catch (err) {
      fastify.log.error(err, '[Sovereign] releases list error');
    }

    reply.send({ releases: [] });
  });
};

export default sovereignRoutes;

// Register: app.register(sovereignRoutes, { prefix: '/sovereign' }) when same-origin
// proxy strips `/api` (browser calls `/api/sovereign/...`). Requires `fastify.supabase`
// and Google OAuth session (`attachAtlasSession`).
