/**
 * CommandPalette — universal search overlay (⌘K / Ctrl+K).
 *
 * Opens over the active chamber, filters every navigable surface in the
 * chamber catalog, and navigates (via `setActiveMode`) on select. Toggled
 * exclusively through `useNavStore.commandPaletteOpen` so the bottom-nav
 * Search button, the desktop NavRail search trigger, and the global
 * keyboard shortcut all share one state source.
 *
 * Kept deliberately small: no backend calls, no journal/decision/scenario
 * row search here. Chamber-level content search still lives in
 * `components/GlobalSearch.tsx` and can be composed later; the Refine.txt
 * §6 contract only requires chamber-level jump-to-anywhere today.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAtlasStore } from '../../store/useAtlasStore';
import { useNavStore } from '../../store/useNavStore';
import {
  ALL_CHAMBERS,
  SECTIONS,
  ICONS,
  Icon,
  getChamber,
} from './chamberCatalog';
import type { ChamberDef, ChamberId, SectionId } from './chamberCatalog';

interface SearchableItem {
  chamber: ChamberDef;
  sectionLabel: string;
}

function matches(item: SearchableItem, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    item.chamber.label.toLowerCase().includes(needle) ||
    (item.chamber.description?.toLowerCase().includes(needle) ?? false) ||
    item.sectionLabel.toLowerCase().includes(needle)
  );
}

export default function CommandPalette() {
  const open = useNavStore((s) => s.commandPaletteOpen);
  const setOpen = useNavStore((s) => s.setCommandPaletteOpen);
  const setActiveMode = useAtlasStore((s) => s.setActiveMode);
  const currentUser = useAtlasStore((s) => s.currentUser);
  const isCreator = currentUser?.role === 'sovereign_creator';

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      // Defer focus so the overlay is mounted before the input grabs focus.
      const t = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(t);
    }
    return;
  }, [open]);

  const sectionLabelById = useMemo(() => {
    const map = new Map<SectionId, string>();
    for (const s of SECTIONS) map.set(s.id, s.label);
    return map;
  }, []);

  const items: SearchableItem[] = useMemo(() => {
    return ALL_CHAMBERS
      .filter((c) => !c.creatorOnly || isCreator)
      .map((chamber) => ({
        chamber,
        sectionLabel: chamber.section ? sectionLabelById.get(chamber.section) ?? 'Primary' : 'Primary',
      }));
  }, [isCreator, sectionLabelById]);

  const filtered = useMemo(() => items.filter((i) => matches(i, query)), [items, query]);

  // Clamp active index when filter narrows.
  useEffect(() => {
    if (activeIndex >= filtered.length) setActiveIndex(0);
  }, [filtered.length, activeIndex]);

  if (!open) return null;

  const commit = (chamber: ChamberDef) => {
    setActiveMode(chamber.id);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = filtered[activeIndex];
      if (target) commit(target.chamber);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Atlas command palette"
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(8, 4, 24, 0.7)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '12vh',
        paddingLeft: 16,
        paddingRight: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 560,
          background: 'rgba(18, 10, 42, 0.95)',
          border: '1px solid rgba(201,162,39,0.24)',
          borderRadius: 8,
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '70vh',
          overflow: 'hidden',
          fontFamily: 'inherit',
          color: 'rgba(226,232,240,0.92)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '14px 16px',
            borderBottom: '1px solid rgba(88,28,135,0.24)',
          }}
        >
          <Icon path={ICONS.search} size={16} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Jump to a chamber…"
            aria-label="Search chambers"
            autoComplete="off"
            spellCheck={false}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'inherit',
              fontSize: '0.95rem',
              fontFamily: 'inherit',
            }}
          />
          <kbd
            style={{
              fontSize: '0.65rem',
              padding: '2px 6px',
              borderRadius: 3,
              border: '1px solid rgba(226,232,240,0.2)',
              color: 'rgba(226,232,240,0.55)',
            }}
          >
            esc
          </kbd>
        </div>

        <div style={{ overflowY: 'auto', padding: 6 }}>
          {filtered.length === 0 ? (
            <div
              style={{
                padding: '28px 16px',
                textAlign: 'center',
                color: 'rgba(226,232,240,0.55)',
                fontSize: '0.85rem',
              }}
            >
              No chambers match “{query}”.
            </div>
          ) : (
            filtered.map((item, i) => {
              const isActive = i === activeIndex;
              return (
                <button
                  key={item.chamber.id}
                  onClick={() => commit(item.chamber)}
                  onMouseEnter={() => setActiveIndex(i)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 12px',
                    background: isActive ? 'rgba(88,28,135,0.28)' : 'transparent',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    color: 'inherit',
                    textAlign: 'left',
                    fontFamily: 'inherit',
                    fontSize: '0.875rem',
                    transition: 'background 120ms ease',
                  }}
                >
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 28,
                      height: 28,
                      borderRadius: 4,
                      background: 'rgba(26,16,60,0.6)',
                      color: 'rgba(201,162,39,0.85)',
                      flexShrink: 0,
                    }}
                  >
                    <Icon path={ICONS[item.chamber.icon] ?? ICONS.atlas} size={14} />
                  </span>
                  <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span style={{ fontWeight: 600, color: 'rgba(226,232,240,0.95)' }}>
                      {item.chamber.label}
                    </span>
                    {item.chamber.description && (
                      <span
                        style={{
                          fontSize: '0.75rem',
                          color: 'rgba(226,232,240,0.55)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.chamber.description}
                      </span>
                    )}
                  </span>
                  <span
                    style={{
                      fontSize: '0.625rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      color: 'rgba(226,232,240,0.45)',
                      flexShrink: 0,
                    }}
                  >
                    {item.sectionLabel}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 14px',
            borderTop: '1px solid rgba(88,28,135,0.24)',
            fontSize: '0.7rem',
            color: 'rgba(226,232,240,0.45)',
            letterSpacing: '0.06em',
          }}
        >
          <span>
            {filtered.length} {filtered.length === 1 ? 'chamber' : 'chambers'}
          </span>
          <span style={{ display: 'flex', gap: 10 }}>
            <span>↑↓ navigate</span>
            <span>⏎ open</span>
          </span>
        </div>
      </div>
    </div>
  );
}

// Re-export ChamberId so callers can use the selected chamber type if needed.
export type { ChamberId };
