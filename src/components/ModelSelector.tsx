import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  getUserPreferences,
  patchUserPreferences,
  MODEL_DISPLAY_NAMES,
  MODEL_MIN_TIER,
  ALL_MODELS_ORDERED,
  type UserPreferences,
} from '../lib/atlasApi';

const TIER_ORDER: Record<string, number> = { free: 0, core: 1, sovereign: 2 };
const TIER_LABELS: Record<string, string> = { free: 'Free', core: 'Core', sovereign: 'Sovereign' };

function tierUnlockLabel(modelTier: string, userTier: string): string | null {
  const mt = TIER_ORDER[modelTier] ?? 0;
  const ut = TIER_ORDER[userTier] ?? 0;
  if (mt <= ut) return null;
  return `Upgrade to ${TIER_LABELS[modelTier] ?? modelTier} to unlock`;
}

interface ModelSelectorProps {
  onUpgradeClick: () => void;
  compact?: boolean;
}

export function ModelSelector({ onUpgradeClick, compact }: ModelSelectorProps) {
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchPrefs = useCallback(async () => {
    const p = await getUserPreferences();
    if (p) setPrefs(p);
    setLoading(false);
  }, []);

  useEffect(() => { void fetchPrefs(); }, [fetchPrefs]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSelect = async (modelId: string) => {
    if (!prefs) return;

    const isAvailable = prefs.availableModels.includes(modelId);
    if (!isAvailable) {
      onUpgradeClick();
      setOpen(false);
      return;
    }

    // Optimistic update
    const newModel = modelId === prefs.preferredModel ? null : modelId;
    setPrefs((prev) => prev ? { ...prev, preferredModel: newModel } : prev);
    setOpen(false);

    const result = await patchUserPreferences(newModel);
    if (!result) {
      // Revert on failure
      void fetchPrefs();
    }
  };

  if (loading) {
    return (
      <div style={{
        padding: '4px 10px',
        fontSize: '0.7rem',
        color: 'rgba(226,232,240,0.3)',
        letterSpacing: '0.06em',
      }}>
        ...
      </div>
    );
  }

  if (!prefs) return null;

  const currentModel = prefs.preferredModel;
  const displayName = currentModel
    ? MODEL_DISPLAY_NAMES[currentModel] ?? currentModel
    : 'Auto';

  // Group models by tier for display
  const tierGroups: { tier: string; label: string; models: string[] }[] = [
    { tier: 'free', label: 'Free', models: [] },
    { tier: 'core', label: 'Core', models: [] },
    { tier: 'sovereign', label: 'Sovereign', models: [] },
  ];

  for (const modelId of ALL_MODELS_ORDERED) {
    const minTier = MODEL_MIN_TIER[modelId] ?? 'free';
    const group = tierGroups.find((g) => g.tier === minTier);
    if (group) group.models.push(modelId);
  }

  return (
    <div ref={dropdownRef} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Pill button */}
      <button
        onClick={() => setOpen((p) => !p)}
        title="Select AI model"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: compact ? '3px 8px' : '4px 10px',
          background: 'rgba(88,28,135,0.12)',
          border: '1px solid rgba(88,28,135,0.25)',
          borderRadius: 6,
          color: currentModel ? 'rgba(201,162,39,0.85)' : 'rgba(226,232,240,0.45)',
          fontSize: compact ? '0.62rem' : '0.7rem',
          fontFamily: 'inherit',
          cursor: 'pointer',
          transition: 'all 140ms ease',
          letterSpacing: '0.04em',
          whiteSpace: 'nowrap',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
        {displayName}
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: 0,
          marginBottom: 6,
          minWidth: 220,
          background: 'rgba(10,7,20,0.96)',
          border: '1px solid rgba(88,28,135,0.3)',
          borderRadius: 8,
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          zIndex: 100,
          overflow: 'hidden',
          animation: 'atlas-fade-in 150ms ease both',
        }}>
          {/* Auto option */}
          <button
            onClick={() => void handleSelect(currentModel ?? '')}
            style={{
              width: '100%',
              textAlign: 'left',
              padding: '8px 12px',
              background: !currentModel ? 'rgba(88,28,135,0.15)' : 'transparent',
              border: 'none',
              borderBottom: '1px solid rgba(88,28,135,0.12)',
              color: !currentModel ? 'rgba(201,162,39,0.9)' : 'rgba(226,232,240,0.5)',
              fontSize: '0.72rem',
              fontFamily: 'inherit',
              cursor: 'pointer',
              transition: 'background 100ms ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>Auto (recommended)</span>
            {!currentModel && (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(201,162,39,0.8)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </button>

          {/* Grouped model list */}
          {tierGroups.map((group) => {
            if (group.models.length === 0) return null;
            return (
              <div key={group.tier}>
                <div style={{
                  padding: '6px 12px 3px',
                  fontSize: '0.58rem',
                  fontWeight: 600,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'rgba(226,232,240,0.25)',
                }}>
                  {group.label}
                </div>
                {group.models.map((modelId) => {
                  const isAvailable = prefs.availableModels.includes(modelId);
                  const isSelected = currentModel === modelId;
                  const lockTip = tierUnlockLabel(MODEL_MIN_TIER[modelId] ?? 'free', prefs.tier);
                  const name = MODEL_DISPLAY_NAMES[modelId] ?? modelId;

                  return (
                    <button
                      key={modelId}
                      onClick={() => void handleSelect(modelId)}
                      title={lockTip ?? name}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '6px 12px',
                        background: isSelected ? 'rgba(88,28,135,0.15)' : 'transparent',
                        border: 'none',
                        color: isAvailable
                          ? (isSelected ? 'rgba(201,162,39,0.9)' : 'rgba(226,232,240,0.7)')
                          : 'rgba(226,232,240,0.25)',
                        fontSize: '0.72rem',
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                        transition: 'background 100ms ease',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {!isAvailable && <span style={{ fontSize: '0.65rem' }}>&#128274;</span>}
                        {name}
                      </span>
                      {isSelected && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(201,162,39,0.8)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
