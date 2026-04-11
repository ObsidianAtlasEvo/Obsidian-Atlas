/**
 * IndexedDB storage adapter for Zustand `persist` middleware.
 * Uses idb-keyval for a simple, reliable key-value store.
 */
import { get, set, del, createStore } from 'idb-keyval';
import type { StateStorage } from 'zustand/middleware';

const atlasStore = createStore('obsidian-atlas-persist-v1', 'zustand');

export const idbStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    const value = await get<string>(name, atlasStore);
    return value ?? null;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await set(name, value, atlasStore);
  },
  removeItem: async (name: string): Promise<void> => {
    await del(name, atlasStore);
  },
};
