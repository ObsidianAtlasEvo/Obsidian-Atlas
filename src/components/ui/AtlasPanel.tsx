// Atlas-Audit: [X] Section X — Panel primitive repair: layout variants (dense / rail / inset), token borders/shadows, focus-visible ring. Downstream: any surface using AtlasPanel gets consistent hierarchy; new layouts reuse one component instead of ad-hoc glass classes.
import React from 'react';
import { cn } from '../../lib/utils';

export type AtlasPanelTier = 'standard' | 'elevated' | 'chamber';
export type AtlasPanelLayout = 'default' | 'dense' | 'rail' | 'inset';

const tierClass: Record<AtlasPanelTier, string> = {
  standard:
    'rounded-[var(--radius-lg)] p-[var(--space-4)] md:p-[var(--space-5)] border-[length:var(--border-hairline)] bg-[var(--atlas-surface-panel)] shadow-[var(--atlas-shadow-sm)]',
  elevated:
    'rounded-[var(--radius-xl)] p-[var(--space-5)] md:p-[var(--space-6)] border-[length:var(--border-hairline)] bg-[var(--atlas-surface-elevated)] shadow-[var(--atlas-shadow-lg)]',
  chamber:
    'rounded-[var(--radius-2xl)] p-[var(--space-6)] border-[length:var(--border-hairline)] bg-[var(--atlas-surface-elevated)] shadow-[var(--atlas-shadow-chamber)]',
};

const layoutClass: Record<AtlasPanelLayout, string> = {
  default: '',
  dense:
    '!rounded-[var(--radius-md)] !p-[var(--space-3)] md:!p-[var(--space-4)] !shadow-[var(--atlas-shadow-sm)]',
  rail:
    '!rounded-[var(--radius-md)] !py-[var(--space-3)] !px-[var(--space-4)] !bg-[var(--atlas-surface-rail)] !border-[color:var(--border-subtle)] !shadow-[var(--atlas-shadow-sm)]',
  inset:
    '!rounded-[var(--radius-md)] !bg-[var(--atlas-surface-inset)] !border-[color:var(--border-structural)] !shadow-none',
};

/**
 * Tiered intelligence surface — not a generic card.
 */
export function AtlasPanel({
  tier = 'standard',
  layout = 'default',
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & {
  tier?: AtlasPanelTier;
  layout?: AtlasPanelLayout;
}): React.ReactElement {
  return (
    <div
      className={cn(
        'backdrop-blur-xl border-[color:var(--border-default)]',
        'transition-[border-color,box-shadow,background-color] duration-[var(--atlas-motion-standard)]',
        'hover:border-[color:var(--atlas-border-hover)]',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--atlas-ring-focus)] focus-visible:ring-offset-0',
        tierClass[tier],
        layoutClass[layout],
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function AtlasPanelHeader({
  kicker,
  title,
  aside,
}: {
  kicker?: string;
  title: string;
  aside?: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex items-start justify-between gap-[var(--space-4)] mb-[var(--space-4)] pb-[var(--space-3)] border-b border-[color:var(--border-structural)]">
      <div className="min-w-0 space-y-[var(--space-1)]">
        {kicker && (
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone/55">{kicker}</p>
        )}
        <h2 className="font-serif text-lg md:text-xl text-ivory tracking-tight leading-tight">{title}</h2>
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </div>
  );
}
