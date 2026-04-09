// ── Models Route ──────────────────────────────────────────────────────────────
// REST endpoints for model management, availability checking, and tier info.
// All endpoints are read-heavy and O(n) in model count.

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  ALL_MODELS,
  ALL_PROVIDERS,
  getModelById,
  type ProviderID,
} from '../services/modelRegistry.js';
import {
  getAvailableModels,
  getTierConfig,
  getAllTierConfigs,
  isModelAvailable,
  type UserTier,
} from '../services/tierManager.js';
import { createAllProviders } from '../services/providers/index.js';

// ── In-memory model enable/disable store ─────────────────────────────────────
// In production this would be persisted to a DB keyed by userId.
// For now it lives in process memory and resets on server restart.

const modelOverrides = new Map<string, boolean>(); // modelId → enabled

function isModelEnabled(modelId: string): boolean {
  if (modelOverrides.has(modelId)) return modelOverrides.get(modelId) ?? true;
  const def = getModelById(modelId);
  return def?.defaultEnabled ?? false;
}

// ── Provider availability check ───────────────────────────────────────────────

async function checkProviderAvailability(
  providerId: ProviderID,
): Promise<boolean> {
  const provider = createAllProviders().get(providerId);
  if (!provider) return false;
  try {
    return await provider.isAvailable();
  } catch {
    return false;
  }
}

// ── Request body types ────────────────────────────────────────────────────────

interface ModelCheckBody {
  providerId: ProviderID;
}

interface ModelConfigureBody {
  modelId: string;
  enabled: boolean;
}

// ── Route handlers ────────────────────────────────────────────────────────────

/**
 * GET /v1/models
 * Return all known models with their availability status.
 * Availability = provider has an API key (or is local Ollama).
 */
async function handleListModels(
  _request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // Check availability for all providers in parallel
  const availabilityMap = new Map<ProviderID, boolean>();
  await Promise.all(
    ALL_PROVIDERS.map(async (p) => {
      const available = await checkProviderAvailability(p.id);
      availabilityMap.set(p.id, available);
    }),
  );

  const modelsWithStatus = ALL_MODELS.map((model) => ({
    ...model,
    providerAvailable: availabilityMap.get(model.provider) ?? false,
    enabled: isModelEnabled(model.id),
  }));

  await reply.send({
    models: modelsWithStatus,
    total: modelsWithStatus.length,
    providersChecked: ALL_PROVIDERS.length,
  });
}

/**
 * GET /v1/models/available
 * Return models available for the requesting user's tier.
 * Tier is read from the x-atlas-tier header or defaults to 'free'.
 */
async function handleListAvailableModels(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const tier = (
    (request.headers['x-atlas-tier'] as string | undefined) ?? 'free'
  ) as UserTier;

  const validTiers: UserTier[] = ['free', 'sovereign', 'creator'];
  const resolvedTier = validTiers.includes(tier) ? tier : 'free';

  const availabilityMap = new Map<ProviderID, boolean>();
  await Promise.all(
    ALL_PROVIDERS.map(async (p) => {
      const available = await checkProviderAvailability(p.id);
      availabilityMap.set(p.id, available);
    }),
  );

  const models = getAvailableModels(resolvedTier).map((model) => ({
    ...model,
    providerAvailable: availabilityMap.get(model.provider) ?? false,
    enabled: isModelEnabled(model.id),
  }));

  await reply.send({
    tier: resolvedTier,
    models,
    total: models.length,
  });
}

/**
 * POST /v1/models/check
 * Body: { providerId: string }
 * Performs a live availability check for a specific provider.
 */
async function handleCheckProvider(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const body = request.body as ModelCheckBody;
  const { providerId } = body;

  if (!providerId) {
    await reply.status(400).send({ error: 'providerId is required' });
    return;
  }

  const providerDef = ALL_PROVIDERS.find((p) => p.id === providerId);
  if (!providerDef) {
    await reply.status(404).send({ error: `Provider '${providerId}' not found` });
    return;
  }

  const checkStart = Date.now();
  const available = await checkProviderAvailability(providerId as ProviderID);
  const durationMs = Date.now() - checkStart;

  await reply.send({
    providerId,
    available,
    durationMs,
    message: available
      ? `Provider '${providerDef.name}' is reachable`
      : `Provider '${providerDef.name}' is not available — check API key or connectivity`,
  });
}

/**
 * GET /v1/models/tiers
 * Return all tier definitions with their feature sets.
 */
async function handleGetTiers(
  _request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  await reply.send({
    tiers: getAllTierConfigs(),
    current: getTierConfig('free'), // default if no user info
  });
}

/**
 * POST /v1/models/configure
 * Body: { modelId: string, enabled: boolean }
 * Toggle a model on or off. Stored in-memory.
 */
async function handleConfigureModel(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const body = request.body as ModelConfigureBody;
  const { modelId, enabled } = body;

  if (!modelId) {
    await reply.status(400).send({ error: 'modelId is required' });
    return;
  }

  if (typeof enabled !== 'boolean') {
    await reply.status(400).send({ error: 'enabled must be a boolean' });
    return;
  }

  const model = getModelById(modelId);
  if (!model) {
    await reply.status(404).send({ error: `Model '${modelId}' not found` });
    return;
  }

  modelOverrides.set(modelId, enabled);

  await reply.send({
    modelId,
    enabled,
    message: `Model '${model.name}' has been ${enabled ? 'enabled' : 'disabled'}`,
  });
}

// ── Tier-scoped model listing (helper used by orchestrate route) ──────────────

export function resolveModelListForTier(
  requestedModels: string[] | undefined,
  tier: UserTier,
): string[] {
  const tierConfig = getTierConfig(tier);

  if (requestedModels && requestedModels.length > 0) {
    // Filter to those accessible under this tier
    return requestedModels
      .filter((id) => isModelAvailable(id, tier))
      .slice(0, tierConfig.maxModelsPerQuery);
  }

  // Auto-select: use enabled default models for this tier
  return getAvailableModels(tier)
    .filter((m) => isModelEnabled(m.id))
    .slice(0, tierConfig.maxModelsPerQuery)
    .map((m) => m.id);
}

// ── Route registration ─────────────────────────────────────────────────────────

export default async function modelRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/models', handleListModels);
  app.get('/v1/models/available', handleListAvailableModels);
  app.get('/v1/models/tiers', handleGetTiers);

  app.post(
    '/v1/models/check',
    {
      schema: {
        body: {
          type: 'object',
          required: ['providerId'],
          properties: {
            providerId: { type: 'string' },
          },
        },
      },
    },
    handleCheckProvider,
  );

  app.post(
    '/v1/models/configure',
    {
      schema: {
        body: {
          type: 'object',
          required: ['modelId', 'enabled'],
          properties: {
            modelId: { type: 'string' },
            enabled: { type: 'boolean' },
          },
        },
      },
    },
    handleConfigureModel,
  );
}
