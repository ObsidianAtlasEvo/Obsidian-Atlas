/**
 * ATLAS TIER MANAGER — ISOLATION BOUNDARY
 * =========================================
 * This file defines UserTier = 'free' | 'sovereign' | 'creator'
 * and is used exclusively by:
 *   - atlas-backend/src/routes/models.ts
 *   - atlas-backend/src/routes/orchestrate.ts
 *
 * The v4 groundwork layer uses a SEPARATE taxonomy:
 *   core | sovereign | zenith  (groundwork/v4/subscriptionSchema.ts)
 *
 * DO NOT consolidate these until Phase 3 billing is live and confirmed.
 * Planned consolidation mapping:
 *   groundwork 'core'      → tierManager 'free'
 *   groundwork 'sovereign' → tierManager 'sovereign'
 *   groundwork 'zenith'    → tierManager 'creator'
 *
 * See ISSUE-03 in final_audit_and_patch_handoff.txt for full context.
 */

// ── Tier Manager ──────────────────────────────────────────────────────────────
// Controls which models and features are accessible to users based on their
// subscription tier. This is the single source of truth for tier logic.
//
// Tiers:
//  free      — local + free cloud models, limited parallelism
//  sovereign — + premium models (GPT-4, Claude, etc.), higher limits
//  creator   — all models, unlimited queries, raw access

import {
  ALL_MODELS,
  type ModelDefinition,
  type ProviderID,
} from './modelRegistry.js';

export type UserTier = 'free' | 'sovereign' | 'creator';

export interface TierConfig {
  tier: UserTier;
  /** Maximum number of models queried in a single orchestration call */
  maxModelsPerQuery: number;
  /** Provider IDs accessible to this tier */
  availableProviders: ProviderID[];
  /** Maximum queries per calendar day; -1 = unlimited */
  maxQueriesPerDay: number;
  /** Feature flags as strings for the frontend to act on */
  features: string[];
}

// ── Tier Definitions ──────────────────────────────────────────────────────────

const FREE_PROVIDERS: ProviderID[] = [
  'ollama',
  'groq',
  'together',
  'cohere',
  'google',
  'mistral',
  'deepseek',
];

const ALL_PROVIDERS: ProviderID[] = [
  'ollama',
  'groq',
  'together',
  'cohere',
  'google',
  'mistral',
  'deepseek',
  'openai',
  'anthropic',
  'perplexity',
  'xai',
];

const TIERS: Record<UserTier, TierConfig> = {
  free: {
    tier: 'free',
    maxModelsPerQuery: 3,
    availableProviders: FREE_PROVIDERS,
    maxQueriesPerDay: 100,
    features: [
      'local-models',
      'free-cloud-models',
      'basic-synthesis',
    ],
  },
  sovereign: {
    tier: 'sovereign',
    maxModelsPerQuery: 6,
    availableProviders: ALL_PROVIDERS,
    maxQueriesPerDay: 500,
    features: [
      'local-models',
      'free-cloud-models',
      'premium-models',
      'advanced-synthesis',
      'model-comparison',
    ],
  },
  creator: {
    tier: 'creator',
    maxModelsPerQuery: 11,
    availableProviders: ALL_PROVIDERS,
    maxQueriesPerDay: -1,
    features: [
      'local-models',
      'free-cloud-models',
      'premium-models',
      'advanced-synthesis',
      'model-comparison',
      'raw-responses',
      'custom-routing',
    ],
  },
};

// ── Public API ────────────────────────────────────────────────────────────────

/** Return the full configuration for a given tier. */
export function getTierConfig(tier: UserTier): TierConfig {
  return TIERS[tier];
}

/**
 * Check if a specific model ID is accessible under a given tier.
 * A model is accessible if its provider is in the tier's allowedProviders list.
 */
export function isModelAvailable(modelId: string, tier: UserTier): boolean {
  const tierConfig = TIERS[tier];
  const model = ALL_MODELS.find((m) => m.id === modelId);
  if (!model) return false;
  return (tierConfig.availableProviders as string[]).includes(model.provider);
}

/**
 * Return all model definitions accessible to the given tier.
 * Also filters to only defaultEnabled models for the 'free' tier to keep
 * the initial experience manageable.
 */
export function getAvailableModels(tier: UserTier): ModelDefinition[] {
  const tierConfig = TIERS[tier];
  return ALL_MODELS.filter((m) =>
    (tierConfig.availableProviders as string[]).includes(m.provider),
  );
}

/**
 * Return only the models that are enabled by default for a given tier.
 * Used when the user hasn't explicitly selected models.
 */
export function getDefaultEnabledModels(tier: UserTier): ModelDefinition[] {
  return getAvailableModels(tier).filter((m) => m.defaultEnabled);
}

/**
 * Check if a user is within their daily query quota.
 * @param tier - The user's subscription tier
 * @param queriesUsedToday - How many queries they've already made today
 * @returns true if they can make another query
 */
export function checkQuota(tier: UserTier, queriesUsedToday: number): boolean {
  const tierConfig = TIERS[tier];
  if (tierConfig.maxQueriesPerDay === -1) return true; // unlimited
  return queriesUsedToday < tierConfig.maxQueriesPerDay;
}

/**
 * Filter a list of model IDs to only those accessible under a given tier,
 * and cap the list at the tier's maxModelsPerQuery limit.
 */
export function filterAndCapModels(
  modelIds: string[],
  tier: UserTier,
): string[] {
  const tierConfig = TIERS[tier];
  return modelIds
    .filter((id) => isModelAvailable(id, tier))
    .slice(0, tierConfig.maxModelsPerQuery);
}

/** Return true if a specific feature flag is enabled for a tier. */
export function hasFeature(tier: UserTier, feature: string): boolean {
  return TIERS[tier].features.includes(feature);
}

/** Return all tier definitions (for the /v1/models/tiers endpoint). */
export function getAllTierConfigs(): Record<UserTier, TierConfig> {
  return { ...TIERS };
}
