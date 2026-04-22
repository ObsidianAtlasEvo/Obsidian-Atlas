import React, { useState, useEffect, useCallback } from 'react';
import {
  getUserPreferences,
  patchUserPreferences,
  MODEL_DISPLAY_NAMES,
  MODEL_MIN_TIER,
  ALL_MODELS_ORDERED,
  type UserPreferences,
} from '../lib/atlasApi';

const TIER_ORDER: Record<string, number> = { core: 0, sovereign: 1, zenith: 2 };
const TIER_LABELS: Record<string, string> = { core: 'Core', sovereign: 'Sovereign', zenith: 'Zenith' };

export function ModelSelectorSettings() {
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPrefs = useCallback(async () => {
    const p = await getUserPreferences();
    if (p) setPrefs(p);
    setLoading(false);
  }, []);

  useEffect(() => { void fetchPrefs(); }, [fetchPrefs]);

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (!prefs) return;
    const value = e.target.value;
    const newModel = value === '' ? null : value;

    // Check if model is available — if not, don't persist
    if (newModel && !prefs.availableModels.includes(newModel)) return;

    setPrefs((prev) => prev ? { ...prev, preferredModel: newModel } : prev);
    const result = await patchUserPreferences(newModel);
    if (!result) void fetchPrefs();
  };

  if (loading) {
    return (
      <div className="p-3 bg-obsidian/40 border border-titanium/5 rounded-sm">
        <span className="text-xs text-stone/40">Loading model preferences...</span>
      </div>
    );
  }

  if (!prefs) {
    return (
      <div className="p-3 bg-obsidian/40 border border-titanium/5 rounded-sm">
        <span className="text-xs text-stone/40">Sign in to set model preferences</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="p-3 bg-obsidian/40 border border-titanium/5 rounded-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs text-stone">Default Model</span>
          <select
            value={prefs.preferredModel ?? ''}
            onChange={(e) => void handleChange(e)}
            className="bg-graphite border border-titanium/20 text-xs text-ivory p-1 rounded-sm outline-none max-w-[180px]"
          >
            <option value="">Auto (recommended)</option>
            {ALL_MODELS_ORDERED.map((modelId) => {
              const isAvailable = prefs.availableModels.includes(modelId);
              const name = MODEL_DISPLAY_NAMES[modelId] ?? modelId;
              const minTier = MODEL_MIN_TIER[modelId] ?? 'core';
              const tierNum = TIER_ORDER[minTier] ?? 0;
              const userTierNum = TIER_ORDER[prefs.tier] ?? 0;
              const locked = tierNum > userTierNum;
              const lockSuffix = locked ? ` [${TIER_LABELS[minTier]}]` : '';

              return (
                <option
                  key={modelId}
                  value={modelId}
                  disabled={!isAvailable}
                >
                  {locked ? '\u{1F512} ' : ''}{name}{lockSuffix}
                </option>
              );
            })}
          </select>
        </div>
      </div>
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] text-stone/30 uppercase tracking-wider">
          Tier: {TIER_LABELS[prefs.tier] ?? prefs.tier}
        </span>
        <span className="text-[10px] text-stone/30">
          {prefs.availableModels.length} models available
        </span>
      </div>
    </div>
  );
}
