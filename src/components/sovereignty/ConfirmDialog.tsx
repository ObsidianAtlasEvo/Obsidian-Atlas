import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, X } from 'lucide-react';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  requireReason?: boolean;
  reasonPlaceholder?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (reason?: string) => void;
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  requireReason = false,
  reasonPlaceholder = 'Reason (audit trail)',
  busy = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const [reason, setReason] = React.useState('');

  React.useEffect(() => {
    if (!open) setReason('');
  }, [open]);

  const canConfirm = !busy && (!requireReason || reason.trim().length > 0);

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
            onClick={onCancel}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            className="fixed left-1/2 top-1/2 z-[201] w-[min(92vw,460px)] -translate-x-1/2 -translate-y-1/2 rounded-sm border border-gold/15 bg-graphite/95 p-8 shadow-[0_0_0_1px_rgba(212,175,55,0.06),0_24px_80px_rgba(0,0,0,0.55)]"
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            <button
              type="button"
              onClick={onCancel}
              className="absolute right-4 top-4 text-stone/50 hover:text-ivory"
              aria-label="Dismiss"
            >
              <X size={16} />
            </button>
            <div className="mb-5 flex items-center gap-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-sm border ${
                  destructive ? 'border-red-500/30 bg-red-500/[0.06]' : 'border-gold/20 bg-gold/[0.06]'
                }`}
              >
                <AlertTriangle size={20} className={destructive ? 'text-red-400/90' : 'text-gold/90'} />
              </div>
              <h2 id="confirm-dialog-title" className="font-serif text-sm uppercase tracking-[0.2em] text-ivory">
                {title}
              </h2>
            </div>
            <div className="mb-4 text-xs leading-relaxed text-stone/80">{body}</div>

            {requireReason && (
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={reasonPlaceholder}
                rows={3}
                className="mb-4 w-full rounded-sm border border-titanium/15 bg-graphite/40 px-3 py-2 text-xs text-ivory placeholder:text-stone/35 focus:border-gold/25 focus:outline-none"
              />
            )}

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                className="rounded-sm px-4 py-2 text-[10px] uppercase tracking-widest text-stone/70 hover:text-ivory disabled:opacity-40"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={() => onConfirm(requireReason ? reason.trim() : undefined)}
                disabled={!canConfirm}
                className={`rounded-sm px-5 py-2 text-[10px] font-bold uppercase tracking-widest transition-opacity disabled:cursor-not-allowed disabled:opacity-40 ${
                  destructive
                    ? 'bg-red-500/80 text-ivory hover:bg-red-500'
                    : 'bg-gold text-obsidian hover:opacity-90'
                }`}
              >
                {busy ? 'Working…' : confirmLabel}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
