/**
 * CollapsibleNav.tsx
 * Unified navigation component for Obsidian Atlas across all breakpoints.
 *
 * Three operating modes:
 *   sidebar  (desktop)  — full-width rail (220px), labels + icons visible, pinned left.
 *   sidebar  (tablet)   — icon-only rail (56px), labels hidden, tooltips on hover.
 *   drawer   (mobile)   — full-screen bottom-sheet overlay, slides up from bottom.
 *
 * No additional dependencies required. All icons are inline SVG.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Chamber registry
// ─────────────────────────────────────────────────────────────────────────────

export interface Chamber {
  id: string;
  label: string;
  shortLabel?: string;
  description: string;
  category: string;
  icon: React.ReactNode;
}

// Inline SVG icons — self-contained, no library dependency
const Icons = {
  Chat: (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="w-5 h-5">
      <path
        d="M3 4a1 1 0 011-1h12a1 1 0 011 1v9a1 1 0 01-1 1H7.5L4 17.5V14H4a1 1 0 01-1-1V4z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Mind: (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="w-5 h-5">
      <circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2.5 2" />
      <circle cx="10" cy="10" r="1" fill="currentColor" />
    </svg>
  ),
  Pulse: (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="w-5 h-5">
      <polyline
        points="2,10 5,10 7,5 9,15 11,8 13,12 15,10 18,10"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  ),
  Memory: (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="w-5 h-5">
      <rect x="3" y="5" width="14" height="3" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="3" y="9.5" width="14" height="3" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="3" y="14" width="14" height="3" rx="1" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  ),
  Oracle: (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="w-5 h-5">
      <polygon
        points="10,2 12.5,7.5 18,8.5 14,12.5 15,18 10,15.5 5,18 6,12.5 2,8.5 7.5,7.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Archive: (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="w-5 h-5">
      <rect x="2" y="3" width="16" height="4" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M3 7v9a1 1 0 001 1h12a1 1 0 001-1V7"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M8 11h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  Insights: (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="w-5 h-5">
      <polyline
        points="3,15 7,9 11,12 16,5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx="16" cy="5" r="1.5" fill="currentColor" />
    </svg>
  ),
  Settings: (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="w-5 h-5">
      <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  ),
  Sovereign: (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="w-5 h-5">
      <path
        d="M10 2L3 6v5c0 4.1 3 7.7 7 8.9 4-1.2 7-4.8 7-8.9V6L10 2z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Cosmos: (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="w-5 h-5">
      <ellipse cx="10" cy="10" rx="8" ry="3.5" stroke="currentColor" strokeWidth="1.4" />
      <ellipse
        cx="10"
        cy="10"
        rx="8"
        ry="3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        transform="rotate(60 10 10)"
      />
      <ellipse
        cx="10"
        cy="10"
        rx="8"
        ry="3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        transform="rotate(-60 10 10)"
      />
      <circle cx="10" cy="10" r="1.5" fill="currentColor" />
    </svg>
  ),
};

export const CHAMBERS: Chamber[] = [
  // Core
  {
    id: 'chat',
    label: 'Chat',
    description: 'Converse with your sovereign intelligence',
    category: 'Core',
    icon: Icons.Chat,
  },
  {
    id: 'cognition-map',
    label: 'Cognition Map',
    shortLabel: 'Mind',
    description: 'Visual graph of your knowledge domains',
    category: 'Core',
    icon: Icons.Mind,
  },
  {
    id: 'pulse',
    label: 'Pulse',
    description: 'Real-time activity and signal stream',
    category: 'Core',
    icon: Icons.Pulse,
  },
  {
    id: 'memory-vault',
    label: 'Memory Vault',
    shortLabel: 'Memory',
    description: 'Persistent indexed knowledge store',
    category: 'Core',
    icon: Icons.Memory,
  },
  // Intelligence
  {
    id: 'oracle',
    label: 'Oracle',
    description: 'Multi-model reasoning and synthesis',
    category: 'Intelligence',
    icon: Icons.Oracle,
  },
  {
    id: 'insights',
    label: 'Insights',
    description: 'Patterns and trends across your data',
    category: 'Intelligence',
    icon: Icons.Insights,
  },
  // Storage
  {
    id: 'archive',
    label: 'Archive',
    description: 'Long-term document and media store',
    category: 'Storage',
    icon: Icons.Archive,
  },
  {
    id: 'cosmos',
    label: 'Cosmos',
    description: 'Explore conceptual space and connections',
    category: 'Storage',
    icon: Icons.Cosmos,
  },
  // System
  {
    id: 'sovereign',
    label: 'Sovereign',
    description: 'Privacy controls and data sovereignty',
    category: 'System',
    icon: Icons.Sovereign,
  },
  {
    id: 'settings',
    label: 'Settings',
    description: 'Configure Atlas and integrations',
    category: 'System',
    icon: Icons.Settings,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Atlas wordmark SVG
// ─────────────────────────────────────────────────────────────────────────────

function AtlasWordmark({ collapsed }: { collapsed: boolean }) {
  return (
    <div
      className="flex items-center gap-2.5 select-none"
      aria-label="Atlas"
    >
      {/* Geometric mark — always visible */}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        width={collapsed ? 28 : 24}
        height={collapsed ? 28 : 24}
        aria-hidden="true"
        className="flex-shrink-0"
      >
        <polygon
          points="12,2 22,8 22,16 12,22 2,16 2,8"
          stroke="#c9a84c"
          strokeWidth="1.5"
          fill="rgba(201,168,76,0.07)"
        />
        <circle cx="12" cy="12" r="3" fill="#c9a84c" opacity="0.9" />
        <line x1="12" y1="2" x2="12" y2="22" stroke="#c9a84c" strokeWidth="0.75" opacity="0.4" />
        <line x1="2" y1="8" x2="22" y2="16" stroke="#c9a84c" strokeWidth="0.75" opacity="0.4" />
        <line x1="2" y1="16" x2="22" y2="8" stroke="#c9a84c" strokeWidth="0.75" opacity="0.4" />
      </svg>

      {/* Wordmark — hidden when collapsed */}
      {!collapsed && (
        <span
          className="text-[#c9a84c] text-sm font-bold tracking-[0.22em] uppercase"
          style={{ fontFamily: 'system-ui, Inter, sans-serif' }}
        >
          Atlas
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Single nav item
// ─────────────────────────────────────────────────────────────────────────────

interface NavItemProps {
  chamber: Chamber;
  isActive: boolean;
  collapsed: boolean;
  onClick: () => void;
  showDescription?: boolean;
}

function NavItem({ chamber, isActive, collapsed, onClick, showDescription }: NavItemProps) {
  const [tooltipVisible, setTooltipVisible] = useState(false);

  return (
    <div className="relative group">
      <button
        onClick={onClick}
        aria-label={chamber.label}
        aria-current={isActive ? 'page' : undefined}
        onMouseEnter={() => collapsed && setTooltipVisible(true)}
        onMouseLeave={() => setTooltipVisible(false)}
        className={[
          'w-full flex items-center rounded-lg',
          'transition-all duration-150',
          'min-h-[44px]', // touch target
          collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5',
          isActive
            ? 'bg-[#2d1b4e]/70 text-[#c9a84c]'
            : 'text-[#9ca3af] hover:text-white hover:bg-white/5',
        ].join(' ')}
        style={{ touchAction: 'manipulation' }}
      >
        {/* Icon */}
        <span
          className={[
            'flex-shrink-0 transition-colors',
            isActive ? 'text-[#c9a84c]' : '',
          ].join(' ')}
        >
          {chamber.icon}
        </span>

        {/* Label — hidden when collapsed */}
        {!collapsed && (
          <div className="flex-1 min-w-0 text-left">
            <div
              className="text-sm font-medium truncate"
              style={{ fontFamily: 'system-ui, Inter, sans-serif' }}
            >
              {chamber.label}
            </div>
            {showDescription && (
              <div
                className="text-xs text-[#6b7280] truncate mt-0.5"
                style={{ fontFamily: 'system-ui, Inter, sans-serif' }}
              >
                {chamber.description}
              </div>
            )}
          </div>
        )}

        {/* Active indicator — right border */}
        {isActive && !collapsed && (
          <span className="w-0.5 h-4 rounded-full bg-[#c9a84c] flex-shrink-0" />
        )}
        {isActive && collapsed && (
          <span
            className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full bg-[#c9a84c]"
          />
        )}
      </button>

      {/* Tooltip — only when collapsed (tablet sidebar) */}
      {collapsed && tooltipVisible && (
        <div
          className={[
            'absolute left-full top-1/2 -translate-y-1/2 ml-3 z-50',
            'px-2.5 py-1.5 rounded-md',
            'bg-[#1a0a2e] border border-[#2d1b4e]',
            'text-white text-xs font-medium whitespace-nowrap',
            'shadow-xl',
            'pointer-events-none',
          ].join(' ')}
          style={{ fontFamily: 'system-ui, Inter, sans-serif' }}
          role="tooltip"
        >
          {chamber.label}
          <div className="text-[#6b7280] text-xs mt-0.5">{chamber.description}</div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Search bar (drawer only)
// ─────────────────────────────────────────────────────────────────────────────

function DrawerSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative mx-4 mb-4">
      <svg
        viewBox="0 0 20 20"
        fill="none"
        width={16}
        height={16}
        aria-hidden="true"
        className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6b7280] pointer-events-none"
      >
        <circle cx="8.5" cy="8.5" r="5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M13 13l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      <input
        type="text"
        placeholder="Search chambers..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={[
          'w-full pl-9 pr-4 py-2.5 rounded-lg',
          'bg-[#1a0a2e]/80 border border-[#2d1b4e]',
          'text-white text-sm placeholder-[#4b5563]',
          'focus:outline-none focus:border-[#c9a84c]/40',
          'transition-colors',
        ].join(' ')}
        style={{ fontFamily: 'system-ui, Inter, sans-serif' }}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Bottom-sheet drawer (mobile)
// ─────────────────────────────────────────────────────────────────────────────

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  activeChamber: string;
  onNavigate: (id: string) => void;
}

function MobileDrawer({ open, onClose, activeChamber, onNavigate }: DrawerProps) {
  const [search, setSearch] = useState('');
  const sheetRef = useRef<HTMLDivElement>(null);

  // Trap focus inside drawer when open
  useEffect(() => {
    if (open) sheetRef.current?.focus();
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    if (!search.trim()) return CHAMBERS;
    const q = search.toLowerCase();
    return CHAMBERS.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q),
    );
  }, [search]);

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<string, Chamber[]>();
    for (const c of filtered) {
      const arr = map.get(c.category) ?? [];
      arr.push(c);
      map.set(c.category, arr);
    }
    return map;
  }, [filtered]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{
          background: 'rgba(0,0,0,0.6)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.25s ease',
        }}
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className="fixed left-0 right-0 bottom-0 z-50 outline-none"
        style={{
          maxHeight: '88vh',
          background: '#0f0a1a',
          borderTop: '1px solid rgba(45,27,78,0.8)',
          borderRadius: '16px 16px 0 0',
          transform: open ? 'translateY(0)' : 'translateY(105%)',
          transition: 'transform 0.32s cubic-bezier(0.32, 0.72, 0, 1)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.7), 0 -1px 0 rgba(201,168,76,0.15)',
        }}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-[#2d1b4e]" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 flex-shrink-0">
          <AtlasWordmark collapsed={false} />
          <button
            onClick={onClose}
            aria-label="Close navigation"
            className={[
              'w-9 h-9 flex items-center justify-center rounded-lg',
              'text-[#6b7280] hover:text-white hover:bg-white/5',
              'transition-colors',
            ].join(' ')}
            style={{ touchAction: 'manipulation' }}
          >
            <svg viewBox="0 0 20 20" fill="none" width={18} height={18} aria-hidden="true">
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="flex-shrink-0">
          <DrawerSearch value={search} onChange={setSearch} />
        </div>

        {/* Chamber list */}
        <div
          className="flex-1 overflow-y-auto atlas-scroll px-4 pb-4"
          style={{ WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'] }}
        >
          {grouped.size === 0 && (
            <div className="text-center py-12 text-[#4b5563] text-sm">
              No chambers match "{search}"
            </div>
          )}

          {Array.from(grouped.entries()).map(([category, chambers]) => (
            <div key={category} className="mb-5">
              <div
                className="text-[10px] font-semibold tracking-[0.15em] text-[#4b5563] uppercase mb-2 px-1"
                style={{ fontFamily: 'system-ui, Inter, sans-serif' }}
              >
                {category}
              </div>
              <div className="space-y-0.5">
                {chambers.map((c) => (
                  <NavItem
                    key={c.id}
                    chamber={c}
                    isActive={activeChamber === c.id}
                    collapsed={false}
                    onClick={() => onNavigate(c.id)}
                    showDescription
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar nav (desktop / tablet)
// ─────────────────────────────────────────────────────────────────────────────

interface SidebarProps {
  activeChamber: string;
  onNavigate: (id: string) => void;
  collapsed: boolean; // tablet = true
}

function SidebarNav({ activeChamber, onNavigate, collapsed }: SidebarProps) {
  // Group chambers — settings goes at bottom
  const mainChambers = CHAMBERS.filter((c) => c.category !== 'System');
  const systemChambers = CHAMBERS.filter((c) => c.category === 'System');

  return (
    <nav
      aria-label="Primary navigation"
      className={[
        'flex flex-col h-full',
        'bg-[#0a0a0f]',
        'border-r border-[#1a0a2e]/80',
        'transition-all duration-250 ease-in-out',
        collapsed ? 'w-14' : 'w-[220px]',
      ].join(' ')}
      style={{
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div
        className={[
          'flex items-center border-b border-[#1a0a2e]/60',
          collapsed ? 'justify-center py-4 px-2' : 'px-4 py-4',
        ].join(' ')}
      >
        <AtlasWordmark collapsed={collapsed} />
      </div>

      {/* Main chambers */}
      <div
        className={[
          'flex-1 overflow-y-auto atlas-scroll py-3',
          collapsed ? 'px-1.5' : 'px-2',
        ].join(' ')}
        style={{ WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'] }}
      >
        {!collapsed && (
          <div
            className="text-[10px] font-semibold tracking-[0.15em] text-[#4b5563] uppercase mb-2 px-2"
            style={{ fontFamily: 'system-ui, Inter, sans-serif' }}
          >
            Chambers
          </div>
        )}
        <div className="space-y-0.5">
          {mainChambers.map((c) => (
            <NavItem
              key={c.id}
              chamber={c}
              isActive={activeChamber === c.id}
              collapsed={collapsed}
              onClick={() => onNavigate(c.id)}
            />
          ))}
        </div>
      </div>

      {/* System chambers at bottom */}
      <div
        className={[
          'border-t border-[#1a0a2e]/60 py-3',
          collapsed ? 'px-1.5' : 'px-2',
        ].join(' ')}
      >
        <div className="space-y-0.5">
          {systemChambers.map((c) => (
            <NavItem
              key={c.id}
              chamber={c}
              isActive={activeChamber === c.id}
              collapsed={collapsed}
              onClick={() => onNavigate(c.id)}
            />
          ))}
        </div>
      </div>
    </nav>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Public component
// ─────────────────────────────────────────────────────────────────────────────

export interface CollapsibleNavProps {
  activeChamber: string;
  onNavigate: (chamberId: string) => void;
  collapsed: boolean;
  drawerOpen: boolean;
  onDrawerClose: () => void;
  mode: 'sidebar' | 'drawer';
}

export function CollapsibleNav({
  activeChamber,
  onNavigate,
  collapsed,
  drawerOpen,
  onDrawerClose,
  mode,
}: CollapsibleNavProps) {
  if (mode === 'drawer') {
    return (
      <MobileDrawer
        open={drawerOpen}
        onClose={onDrawerClose}
        activeChamber={activeChamber}
        onNavigate={onNavigate}
      />
    );
  }

  return (
    <SidebarNav
      activeChamber={activeChamber}
      onNavigate={onNavigate}
      collapsed={collapsed}
    />
  );
}

export default CollapsibleNav;
