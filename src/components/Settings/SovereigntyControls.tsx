import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Cpu, KeyRound, Shield, ExternalLink, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { atlasApiUrl } from '../../lib/atlasApi';

export type DeepResearchQuotaDto = {
  hasByok: boolean;
  unlimited: boolean;
  usedToday: number;
  limit: number;
  resetsUtcMidnight: boolean;
};

type QuietPowerQuotaModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message?: string;
};

/**
 * “Quiet Power” — soft modal when system deep-research quota is exhausted.
 */
export function QuietPowerQuotaModal({ open, onOpenChange, message }: QuietPowerQuotaModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="Close"
            className="fixed inset-0 z-[200] bg-obsidian/75 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => onOpenChange(false)}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="quota-modal-title"
            className="fixed left-1/2 top-1/2 z-[201] w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-sm border border-gold/15 bg-graphite/95 p-8 shadow-[0_0_0_1px_rgba(212,175,55,0.06),0_24px_80px_rgba(0,0,0,0.55)]"
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="absolute right-4 top-4 text-stone/50 transition-colors hover:text-ivory"
              aria-label="Dismiss"
            >
              <X size={18} />
            </button>
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-sm border border-gold/20 bg-gold/[0.06]">
                <Shield size={20} className="text-gold/90" />
              </div>
              <div>
                <h2 id="quota-modal-title" className="font-serif text-sm uppercase tracking-[0.2em] text-ivory">
                  Deep research at rest
                </h2>
                <p className="mt-1 text-[10px] uppercase tracking-widest text-stone/50">
                  System quota · UTC day
                </p>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-stone/80">
              {message ??
                'You have used today’s complimentary Maximum Clarity deep-research passes on the shared Tavily key. The limit protects the public tier while keeping Atlas sustainable.'}
            </p>
            <p className="mt-4 text-xs leading-relaxed text-stone/70">
              Bring your own Tavily key in Sovereignty → Compute &amp; Research Limits for unlimited deep research.
              Tavily offers a free developer tier suitable for personal use.
            </p>
            <a
              href="https://tavily.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex items-center gap-2 border-b border-gold/30 pb-0.5 text-[11px] font-medium uppercase tracking-[0.15em] text-gold transition-colors hover:border-gold/60 hover:text-gold/90"
            >
              Get a Tavily API key
              <ExternalLink size={14} className="opacity-70" />
            </a>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

type SovereigntyControlsProps = {
  userId: string;
  className?: string;
};

/**
 * Compute & research limits: system deep-research quota + Tavily BYOK (server-side only; key never echoed to client).
 */
export function SovereigntyControls({ userId, className }: SovereigntyControlsProps) {
  const [quota, setQuota] = useState<DeepResearchQuotaDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [keyDraft, setKeyDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveHint, setSaveHint] = useState<string | null>(null);

  const refreshQuota = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch(atlasApiUrl('/v1/sovereignty/deep-research-quota'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        setLoadError('Could not load research quota.');
        return;
      }
      const data = (await res.json()) as DeepResearchQuotaDto;
      setQuota(data);
    } catch {
      setLoadError('Could not reach Atlas backend.');
    }
  }, [userId]);

  useEffect(() => {
    void refreshQuota();
  }, [refreshQuota]);

  const saveByok = async () => {
    const trimmed = keyDraft.trim();
    if (!trimmed.length) {
      setSaveHint('Paste a Tavily key to save, or use Remove my key to clear BYOK.');
      return;
    }
    setSaving(true);
    setSaveHint(null);
    try {
      const res = await fetch(atlasApiUrl('/v1/sovereignty/tavily-byok'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          userId,
          tavilyApiKey: trimmed,
        }),
      });
      if (!res.ok) {
        setSaveHint('Save failed. Try again.');
        setSaving(false);
        return;
      }
      setKeyDraft('');
      setSaveHint('Key stored securely on the server.');
      await refreshQuota();
    } catch {
      setSaveHint('Network error while saving.');
    } finally {
      setSaving(false);
    }
  };

  const used = quota?.usedToday ?? 0;
  const limit = quota?.limit ?? 5;
  const pct = quota?.unlimited ? 100 : Math.min(100, Math.round((used / limit) * 100));

  return (
    <section
      className={cn(
        'rounded-sm border border-titanium/10 bg-titanium/[0.03] p-8 space-y-6',
        className
      )}
    >
      <div className="flex items-center gap-3 border-b border-titanium/10 pb-4">
        <Cpu size={22} className="text-gold" />
        <div>
          <h3 className="text-sm font-serif uppercase tracking-[0.25em] text-ivory">Compute &amp; Research Limits</h3>
          <p className="text-[10px] font-mono uppercase tracking-widest text-stone/50">
            Maximum Clarity · Tavily BYOK
          </p>
        </div>
      </div>

      {loadError && <p className="text-xs text-red-400/90">{loadError}</p>}

      {quota?.unlimited ? (
        <div className="space-y-2 rounded-sm border border-emerald-500/20 bg-emerald-500/[0.04] p-4">
          <div className="flex items-center gap-2 text-emerald-400/95">
            <Shield size={16} />
            <span className="text-[11px] font-bold uppercase tracking-widest">Sovereign compute active</span>
          </div>
          <p className="text-xs text-stone/75">Unlimited deep research via your Tavily API key.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-stone/50">
            <span>Deep research quota</span>
            <span className="font-mono text-stone/70">
              {used}/{limit} used today (UTC)
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-sm bg-obsidian/80">
            <div
              className="h-full bg-gradient-to-r from-gold/40 to-gold/70 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-[10px] leading-relaxed text-stone/55">
            Five Maximum Clarity runs per UTC day on the shared key. Add your own key below to bypass this cap.
          </p>
        </div>
      )}

      <div className="space-y-3 border-t border-titanium/10 pt-6">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-stone/45">
          <KeyRound size={14} className="text-gold/60" />
          Tavily API key (BYOK)
        </div>
        <input
          type="password"
          autoComplete="off"
          value={keyDraft}
          onChange={(e) => setKeyDraft(e.target.value)}
          placeholder={quota?.hasByok ? 'Paste a new key to replace, or clear below' : 'tvly-…'}
          className="w-full rounded-sm border border-titanium/15 bg-graphite/40 px-4 py-3 text-xs text-ivory placeholder:text-stone/35 focus:border-gold/25 focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveByok()}
            className="rounded-sm bg-gold px-5 py-2 text-[10px] font-bold uppercase tracking-widest text-obsidian transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save key'}
          </button>
          <button
            type="button"
            disabled={saving || !quota?.hasByok}
            onClick={() => {
              setKeyDraft('');
              void (async () => {
                setSaving(true);
                setSaveHint(null);
                try {
                  const res = await fetch(atlasApiUrl('/v1/sovereignty/tavily-byok'), {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ userId, tavilyApiKey: null }),
                  });
                  if (res.ok) {
                    setSaveHint('BYOK removed.');
                    await refreshQuota();
                  } else setSaveHint('Could not clear key.');
                } catch {
                  setSaveHint('Network error.');
                } finally {
                  setSaving(false);
                }
              })();
            }}
            className="text-[10px] uppercase tracking-widest text-stone/50 underline-offset-4 hover:text-stone hover:underline disabled:opacity-30"
          >
            Remove my key
          </button>
        </div>
        {saveHint && <p className="text-[10px] text-stone/60">{saveHint}</p>}
        <p className="text-[9px] leading-relaxed text-stone/40">
          Keys are stored only on the Atlas backend database and are never returned to the browser or written to the console.
        </p>
      </div>
    </section>
  );
}
