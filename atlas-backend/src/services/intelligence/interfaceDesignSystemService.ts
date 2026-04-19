/**
 * interfaceDesignSystemService.ts — Phase 0.98: Vanta Gold design tokens.
 */

export interface DesignTokens {
  primary: string;
  background: string;
  surface: string;
  border: string;
  text: string;
  subtext: string;
  accent: string;
}

const TOKENS: DesignTokens = {
  primary: '#C9A84C',
  background: '#0D0D0D',
  surface: '#1A1A1A',
  border: '#2A2A2A',
  text: '#F5F5F5',
  subtext: '#999',
  accent: '#E8C96A',
};

export function getDesignTokens(): DesignTokens {
  return { ...TOKENS };
}

const PANEL_TIER_CLASS: Record<string, string> = {
  tier1: 'panel-sovereign',
  tier2: 'panel-primary',
  tier3: 'panel-secondary',
  tier4: 'panel-ambient',
};

export function getPanelTier(tier: string): string {
  return PANEL_TIER_CLASS[tier] ?? 'panel-default';
}

const MOTION_CLASS: Record<string, string> = {
  enter: 'motion-enter',
  exit: 'motion-exit',
  pulse: 'motion-pulse',
  fade: 'motion-fade',
  slide: 'motion-slide',
};

export function getMotionClass(type: string): string {
  return MOTION_CLASS[type] ?? 'motion-none';
}

const CHAMBER_THEME: Record<string, Partial<DesignTokens>> = {
  directive_center: { accent: '#E8C96A' },
  crucible: { accent: '#C95A4C', primary: '#B84438' },
  reality_engine: { accent: '#4CC9B0', primary: '#2EA088' },
  mirrorforge: { accent: '#C94CB0', primary: '#A02E92' },
  default: {},
};

export function getChamberTheme(chamber: string): Partial<DesignTokens> {
  return { ...(CHAMBER_THEME[chamber] ?? CHAMBER_THEME.default!) };
}
