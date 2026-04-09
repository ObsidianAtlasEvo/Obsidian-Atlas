// Atlas-Audit: [EXEC-VAULT] Verified — Removed encryption theater; titles persist in localStorage only; copy states real browser-local scope.
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, Shield, EyeOff, Database, AlertCircle, Trash2 } from 'lucide-react';
import { AppState } from '../types';

const VAULT_LS = 'atlas_vault_titles_v1';

interface VaultViewProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

export function VaultView({ state, setState }: VaultViewProps) {
  const { vault } = state;
  const [isArchiving, setIsArchiving] = useState(false);
  const [newMaterialTitle, setNewMaterialTitle] = useState('');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(VAULT_LS);
      if (!raw) {
        setHydrated(true);
        return;
      }
      const o = JSON.parse(raw) as { titles?: string[] };
      if (Array.isArray(o.titles) && o.titles.length > 0) {
        setState((prev) => ({
          ...prev,
          vault: { ...prev.vault, privateMaterials: o.titles },
        }));
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, [setState]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(VAULT_LS, JSON.stringify({ titles: vault.privateMaterials }));
    } catch {
      /* ignore */
    }
  }, [vault.privateMaterials, hydrated]);

  const handleArchive = () => {
    if (!newMaterialTitle.trim()) return;

    setState((prev) => ({
      ...prev,
      vault: {
        ...prev.vault,
        privateMaterials: [...prev.vault.privateMaterials, newMaterialTitle.trim()],
      },
    }));

    setNewMaterialTitle('');
    setIsArchiving(false);
  };

  const handleRemove = (title: string) => {
    setState((prev) => ({
      ...prev,
      vault: {
        ...prev.vault,
        privateMaterials: prev.vault.privateMaterials.filter((t) => t !== title),
      },
    }));
  };

  return (
    <div className="p-12 space-y-12 max-w-5xl mx-auto h-full overflow-y-auto custom-scrollbar">
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-oxblood/10 rounded-sm border border-oxblood/20">
            <Lock className="w-8 h-8 text-oxblood" />
          </div>
          <div>
            <h2 className="text-4xl font-serif text-ivory tracking-tight">Sovereign Vault</h2>
            <p className="text-stone font-sans opacity-60 tracking-widest uppercase text-[10px]">
              Browser-local reference list — not encrypted, not cloud-synced
            </p>
          </div>
        </div>
        <p className="text-stone font-sans opacity-80 max-w-3xl leading-relaxed">
          The Vault stores <span className="text-ivory/90">titles only</span> in this browser&apos;s{' '}
          <span className="font-mono text-[11px] text-stone">localStorage</span>. It does not provide
          cryptography or filesystem isolation. Use it as a lightweight index of sensitive topics you
          handle elsewhere; for real secrecy, use an actual secrets manager or offline storage.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="glass-panel p-10 border-titanium/20 bg-titanium/5 space-y-6">
          <div className="flex items-center gap-3 text-stone">
            <Shield className="w-6 h-6" />
            <h3 className="instrument-label uppercase tracking-widest text-sm">Storage model</h3>
          </div>
          <ul className="space-y-3 text-xs text-stone leading-relaxed list-disc pl-4">
            <li>Persisted key: <span className="font-mono text-[10px]">{VAULT_LS}</span></li>
            <li>Clears if the user clears site data; not included in Firestore workspace sync.</li>
            <li>Not indexed into Mind Cartography or global search by design.</li>
          </ul>
        </div>

        <div className="glass-panel p-10 border-titanium/20 space-y-8">
          <div className="flex items-center gap-3 text-stone">
            <EyeOff className="w-6 h-6" />
            <h3 className="instrument-label uppercase tracking-widest text-sm">Private material index</h3>
          </div>

          <div className="space-y-4">
            {vault.privateMaterials.length > 0 ? (
              vault.privateMaterials.map((id) => (
                <div
                  key={id}
                  className="p-4 bg-titanium/5 border border-titanium/10 rounded-sm flex items-center justify-between group hover:border-gold/30 transition-all"
                >
                  <span className="text-xs text-ivory opacity-70">{id}</span>
                  <button
                    type="button"
                    onClick={() => handleRemove(id)}
                    className="text-stone hover:text-oxblood p-1 rounded-sm transition-colors"
                    title="Remove from local index"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            ) : (
              <div className="py-12 flex flex-col items-center justify-center text-center gap-4">
                <Database className="w-8 h-8 text-stone opacity-20" />
                <p className="text-xs text-stone opacity-40 italic">No entries in this browser yet.</p>
              </div>
            )}
          </div>

          <AnimatePresence>
            {isArchiving && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-4 overflow-hidden"
              >
                <input
                  type="text"
                  value={newMaterialTitle}
                  onChange={(e) => setNewMaterialTitle(e.target.value)}
                  placeholder="Label or title (stored as plain text)…"
                  className="w-full bg-obsidian/40 border border-titanium/10 rounded-sm p-3 text-xs text-ivory placeholder:text-stone/40 focus:border-gold/40 outline-none"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsArchiving(false)}
                    className="px-4 py-2 text-[10px] uppercase tracking-widest text-stone hover:text-ivory transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleArchive}
                    className="px-4 py-2 bg-gold/15 text-gold hover:bg-gold/25 text-[10px] uppercase tracking-widest rounded-sm transition-colors"
                  >
                    Save locally
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {!isArchiving && (
            <button
              type="button"
              onClick={() => setIsArchiving(true)}
              className="w-full py-4 border border-titanium/20 text-stone hover:text-ivory hover:bg-titanium/5 transition-all rounded-sm text-xs uppercase tracking-widest"
            >
              Add local entry
            </button>
          )}
        </div>
      </div>

      <div className="p-8 bg-oxblood/5 border border-oxblood/20 rounded-sm space-y-4">
        <div className="flex items-center gap-3 text-oxblood">
          <AlertCircle className="w-5 h-5" />
          <h4 className="instrument-label uppercase tracking-widest text-xs">Scope</h4>
        </div>
        <p className="text-xs text-stone opacity-60 leading-relaxed">
          Entries here are excluded from Firestore workspace sync and from automated graph ingestion. They exist
          only to remind you what not to surface in shared Atlas surfaces on this device.
        </p>
      </div>
    </div>
  );
}
