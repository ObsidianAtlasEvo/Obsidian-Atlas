import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FileText, Shield, CheckCircle2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  PRIVACY_POLICY,
  TERMS_AND_CONDITIONS,
  type LegalDocument,
} from '../../lib/legal/documents';
import {
  acceptLegalDocument,
  getLegalAcceptance,
  type LegalAcceptanceState,
} from '../../lib/legal/api';
import { LegalDocumentView } from './LegalDocumentView';

type GateStatus = 'loading' | 'prompt' | 'submitting' | 'error' | 'accepted';

interface PendingDoc {
  doc: LegalDocument;
  checked: boolean;
}

/**
 * Blocks the app until the signed-in user has accepted the current versions
 * of both the Terms & Conditions and the Privacy Policy.
 *
 * Behavior:
 *   - Fetches /v1/legal/acceptance on mount.
 *   - If both are already accepted for the current versions, renders children.
 *   - Otherwise shows a full-screen modal with only the documents that still
 *     need acceptance. Each doc has a required "I have read and agree"
 *     checkbox; the user clicks Accept to record agreement.
 *   - Acceptance is one-time per version. Bumping the version in
 *     lib/legal/documents.ts + backend/config/legalVersions.ts re-prompts.
 *
 * Network failures: if the acceptance probe fails, we don't block the app
 * (fail-open) — logging the user out because our server hiccuped would be a
 * worse UX than a brief gap in enforcement. The probe retries on next mount.
 */
export function LegalGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<GateStatus>('loading');
  const [state, setState] = useState<LegalAcceptanceState | null>(null);
  const [pendingIndex, setPendingIndex] = useState(0);
  const [pending, setPending] = useState<PendingDoc[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setStatus('loading');
    const result = await getLegalAcceptance();
    if (!result) {
      // Fail-open: server issue shouldn't lock users out. Treat as accepted
      // for this session; they'll be re-prompted next login if still pending.
      setStatus('accepted');
      return;
    }
    setState(result);

    const toAccept: PendingDoc[] = [];
    if (!result.accepted.terms) {
      toAccept.push({ doc: TERMS_AND_CONDITIONS, checked: false });
    }
    if (!result.accepted.privacy) {
      toAccept.push({ doc: PRIVACY_POLICY, checked: false });
    }

    if (toAccept.length === 0) {
      setStatus('accepted');
      return;
    }

    setPending(toAccept);
    setPendingIndex(0);
    setStatus('prompt');
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const current = pending[pendingIndex];

  const toggleChecked = useCallback(() => {
    setPending((prev) =>
      prev.map((p, i) => (i === pendingIndex ? { ...p, checked: !p.checked } : p)),
    );
  }, [pendingIndex]);

  const handleAccept = useCallback(async () => {
    if (!current || !current.checked) return;
    setStatus('submitting');
    setSubmitError(null);

    const result = await acceptLegalDocument(current.doc.kind, current.doc.version);
    if (!result.ok) {
      setSubmitError(
        result.error === 'stale_version'
          ? 'This policy has been updated — reloading the latest version.'
          : 'We couldn\u2019t save your acceptance. Please try again.',
      );
      setStatus('error');
      return;
    }

    // Advance to next pending doc or finish.
    if (pendingIndex + 1 < pending.length) {
      setPendingIndex(pendingIndex + 1);
      setStatus('prompt');
    } else {
      setStatus('accepted');
    }
  }, [current, pending.length, pendingIndex]);

  const progressText = useMemo(() => {
    if (pending.length <= 1) return null;
    return `${pendingIndex + 1} of ${pending.length}`;
  }, [pending.length, pendingIndex]);

  if (status === 'loading') {
    return (
      <div className="min-h-[100dvh] w-full bg-black flex flex-col items-center justify-center">
        <p className="text-[11px] text-stone/50 font-serif tracking-[0.2em]">
          Preparing Agreement{'…'}
        </p>
      </div>
    );
  }

  if (status === 'accepted') {
    return <>{children}</>;
  }

  // prompt | submitting | error
  if (!current) {
    // Defensive — shouldn't happen, but don't hard-crash. Fall through to app.
    return <>{children}</>;
  }

  return (
    <>
      {/* Always render children under the modal so any persistent state
          (Zustand store, WebSockets) keeps initializing. Pointer-events
          are blocked by the backdrop. */}
      {children}
      <AnimatePresence>
        <motion.div
          key="legal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-obsidian/90 backdrop-blur-sm z-[100]"
        />
        <motion.div
          key="legal-modal"
          initial={{ opacity: 0, scale: 0.96, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 20 }}
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(92vw,780px)] max-h-[90vh] bg-graphite border border-titanium/20 rounded-lg shadow-2xl z-[101] flex flex-col overflow-hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="legal-gate-title"
        >
          <header className="flex items-center justify-between gap-3 p-5 border-b border-titanium/10 bg-obsidian/60 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 bg-gold/10 rounded-sm shrink-0">
                {current.doc.kind === 'terms' ? (
                  <FileText className="w-4 h-4 text-gold" />
                ) : (
                  <Shield className="w-4 h-4 text-gold" />
                )}
              </div>
              <div className="min-w-0">
                <h2
                  id="legal-gate-title"
                  className="text-sm font-serif text-ivory uppercase tracking-widest truncate"
                >
                  Before You Continue
                </h2>
                <p className="text-[10px] text-stone/60 uppercase tracking-widest font-mono">
                  Please review and accept {progressText ? `(${progressText})` : ''}
                </p>
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            <LegalDocumentView document={current.doc} />
          </div>

          <footer className="shrink-0 border-t border-titanium/10 bg-obsidian/70 p-4 flex flex-col gap-3">
            {submitError && (
              <div className="text-xs text-red-400 bg-red-500/5 border border-red-500/20 rounded-sm px-3 py-2">
                {submitError}
              </div>
            )}
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={current.checked}
                onChange={toggleChecked}
                disabled={status === 'submitting'}
                className="w-4 h-4 accent-gold cursor-pointer"
              />
              <span className="text-xs text-ivory">
                I have read and agree to the {current.doc.title}.
              </span>
            </label>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] text-stone/40 font-mono uppercase tracking-widest">
                v{current.doc.version}
              </span>
              <button
                type="button"
                onClick={handleAccept}
                disabled={!current.checked || status === 'submitting'}
                className={cn(
                  'px-6 py-2 text-xs font-bold uppercase tracking-widest rounded-sm transition-colors flex items-center gap-2',
                  current.checked && status !== 'submitting'
                    ? 'bg-gold text-obsidian hover:bg-ivory'
                    : 'bg-titanium/10 text-stone/40 cursor-not-allowed',
                )}
              >
                {status === 'submitting' ? (
                  'Saving\u2026'
                ) : pendingIndex + 1 < pending.length ? (
                  <>
                    Accept & Continue <CheckCircle2 size={14} />
                  </>
                ) : (
                  <>
                    Accept & Enter <CheckCircle2 size={14} />
                  </>
                )}
              </button>
            </div>
            {state && pending.length > 1 && (
              <p className="text-[10px] text-stone/40 uppercase tracking-widest text-center">
                You can review these policies anytime from Settings.
              </p>
            )}
          </footer>
        </motion.div>
      </AnimatePresence>
    </>
  );
}
