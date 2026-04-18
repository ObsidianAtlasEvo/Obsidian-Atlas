/**
 * Navigation UI store — drawer state, pinned chambers, command palette,
 * recent chambers, keyboard shortcuts state.
 *
 * Kept separate from the main `useAtlasStore` because:
 *   - it is UI-only (no network, no persistence of user knowledge)
 *   - it persists to localStorage (not IDB) — recovery after refresh should be
 *     instant, and these values are a few hundred bytes at most
 *   - it is read by many shell components and shouldn't invalidate the main
 *     AtlasStore's shape every time we add a nav affordance
 *
 * Persistence: localStorage via zustand/middleware. Recents are kept to the
 * last 6 entries. Pinned chambers are capped at 8 (desktop); mobile UI should
 * only render the first 4.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ChamberId, SectionId } from '../components/shell/chamberCatalog';

export const PIN_LIMIT = 8;          // absolute cap (desktop + mobile combined)
export const PIN_VISIBLE_MOBILE = 4; // Refine.txt §5 "max 4 pinned on mobile"
export const RECENTS_LIMIT = 6;

export interface NavState {
  /** User-pinned chamber ids, in display order. Capped at PIN_LIMIT. */
  pinnedChambers: ChamberId[];
  /** Most recently visited chambers (most recent first), capped at RECENTS_LIMIT. */
  recentChambers: ChamberId[];
  /** Which accordion section is open in the mobile drawer (null = all closed). */
  openDrawerSection: SectionId | null;
  /** Is Labs expanded inside Strategy (drawer and desktop rail). */
  labsExpanded: boolean;
  /** Is the universal search / command palette open. */
  commandPaletteOpen: boolean;
  /** Is the mobile nav drawer open. */
  mobileDrawerOpen: boolean;
}

export interface NavActions {
  pinChamber: (id: ChamberId) => void;
  unpinChamber: (id: ChamberId) => void;
  togglePinChamber: (id: ChamberId) => void;
  reorderPinned: (ids: ChamberId[]) => void;
  recordRecent: (id: ChamberId) => void;
  setOpenDrawerSection: (section: SectionId | null) => void;
  setLabsExpanded: (expanded: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleCommandPalette: () => void;
  setMobileDrawerOpen: (open: boolean) => void;
}

export type NavStore = NavState & NavActions;

const initialState: NavState = {
  pinnedChambers: [],
  recentChambers: [],
  openDrawerSection: null,
  labsExpanded: false,
  commandPaletteOpen: false,
  mobileDrawerOpen: false,
};

export const useNavStore = create<NavStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      pinChamber: (id) => {
        const current = get().pinnedChambers;
        if (current.includes(id)) return;
        const next = [...current, id].slice(0, PIN_LIMIT);
        set({ pinnedChambers: next });
      },

      unpinChamber: (id) =>
        set((s) => ({ pinnedChambers: s.pinnedChambers.filter((x) => x !== id) })),

      togglePinChamber: (id) => {
        const { pinnedChambers } = get();
        if (pinnedChambers.includes(id)) {
          get().unpinChamber(id);
        } else {
          get().pinChamber(id);
        }
      },

      reorderPinned: (ids) =>
        set(() => ({ pinnedChambers: ids.slice(0, PIN_LIMIT) })),

      recordRecent: (id) =>
        set((s) => {
          const filtered = s.recentChambers.filter((x) => x !== id);
          return { recentChambers: [id, ...filtered].slice(0, RECENTS_LIMIT) };
        }),

      setOpenDrawerSection: (section) => set({ openDrawerSection: section }),

      setLabsExpanded: (expanded) => set({ labsExpanded: expanded }),

      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

      toggleCommandPalette: () =>
        set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),

      setMobileDrawerOpen: (open) => set({ mobileDrawerOpen: open }),
    }),
    {
      name: 'atlas-nav',
      storage: createJSONStorage(() => {
        // Guard against SSR or environments without localStorage
        if (typeof window === 'undefined') {
          const mem = new Map<string, string>();
          return {
            getItem: (k) => mem.get(k) ?? null,
            setItem: (k, v) => { mem.set(k, v); },
            removeItem: (k) => { mem.delete(k); },
          };
        }
        return window.localStorage;
      }),
      // Only persist the durable bits. Ephemeral overlay state resets on reload.
      partialize: (state) => ({
        pinnedChambers: state.pinnedChambers,
        recentChambers: state.recentChambers,
        openDrawerSection: state.openDrawerSection,
        labsExpanded: state.labsExpanded,
      }),
      version: 1,
    },
  ),
);
