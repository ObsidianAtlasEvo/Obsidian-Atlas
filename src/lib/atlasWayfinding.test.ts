// Atlas-Audit: [EXEC-MODE] Verified — isKnownActiveMode + coerceActiveMode / tryCoerceActiveMode (shell navigators + tests).
// Atlas-Audit: [EXEC-GUARD] Verified — getAtlasWayfindingFromState yields Workspace domain for unknown slugs without throwing.
// Atlas-Audit: [QA-WAYFIND] Verified — Record<ActiveMode> exhaustiveness is enforced by tsc; sample modes assert non–Workspace domains.
// Atlas-Audit: [QA-P1] Verified — Expectations aligned with atlasWayfinding copy (constitution crumb).
import { describe, expect, it } from 'vitest';
import type { AppState } from '../types';
import {
  coerceActiveMode,
  getAtlasWayfinding,
  getAtlasWayfindingFromState,
  isKnownActiveMode,
  tryCoerceActiveMode,
} from './atlasWayfinding';

type ActiveMode = AppState['activeMode'];

describe('getAtlasWayfinding', () => {
  it('maps sovereign substrate modes to doctrine / intelligence domains', () => {
    const c = getAtlasWayfinding('constitution');
    expect(c.domain).toBe('Doctrine');
    expect(c.crumb).toEqual(['Atlas', 'Doctrine', 'Personal constitution']);

    const m = getAtlasWayfinding('mind-cartography');
    expect(m.domain).toBe('Map');
    expect(m.title).toContain('Mind');
  });

  it('maps every sampled activeMode to a named domain (full map enforced at compile time)', () => {
    const sample: ActiveMode[] = [
      'forge',
      'arena',
      'roadmap',
      'chrysalis',
      'today-in-atlas',
      'core-systems',
      'threads',
      'capabilities',
      'auth',
    ];
    for (const m of sample) {
      const w = getAtlasWayfinding(m);
      expect(w.domain).not.toBe('Workspace');
      expect(w.crumb).toEqual(['Atlas', w.domain, w.title]);
    }
  });

  it('maps forge to pressure domain', () => {
    const f = getAtlasWayfinding('forge');
    expect(f.domain).toBe('Pressure');
    expect(f.title).toContain('Forge');
  });
});

describe('isKnownActiveMode', () => {
  it('rejects empty and unknown strings', () => {
    expect(isKnownActiveMode('')).toBe(false);
    expect(isKnownActiveMode('   ')).toBe(false);
    expect(isKnownActiveMode('not-a-mode')).toBe(false);
  });

  it('accepts registered modes', () => {
    expect(isKnownActiveMode('pulse')).toBe(true);
    expect(isKnownActiveMode('today-in-atlas')).toBe(true);
  });
});

describe('coerceActiveMode / tryCoerceActiveMode', () => {
  it('tryCoerce returns undefined for non-strings and unknown slugs', () => {
    expect(tryCoerceActiveMode(undefined)).toBeUndefined();
    expect(tryCoerceActiveMode(1)).toBeUndefined();
    expect(tryCoerceActiveMode('bogus-mode')).toBeUndefined();
  });

  it('coerce preserves fallback when invalid', () => {
    expect(coerceActiveMode('x', 'pulse')).toBe('pulse');
  });

  it('coerce accepts trimmed known modes', () => {
    expect(coerceActiveMode('  pulse  ', 'today-in-atlas')).toBe('pulse');
  });
});

describe('getAtlasWayfindingFromState', () => {
  it('matches getAtlasWayfinding for known modes', () => {
    const a = getAtlasWayfinding('pulse');
    const b = getAtlasWayfindingFromState('pulse');
    expect(b).toEqual(a);
  });

  it('returns Workspace domain for unknown mode strings', () => {
    const u = getAtlasWayfindingFromState('not-a-real-atlas-mode');
    expect(u.domain).toBe('Workspace');
    expect(u.crumb[0]).toBe('Atlas');
    expect(u.crumb).toHaveLength(3);
  });
});
