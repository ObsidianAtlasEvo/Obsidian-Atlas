import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { LEGAL_DOCUMENTS, type LegalDocumentKind } from '../../lib/legal/documents';
import { LegalDocumentView } from './LegalDocumentView';

/**
 * Read-only viewer for a legal document. Opened from Settings → Privacy & Data.
 * Does not record any acceptance — purely for reference. Users can close it
 * and return to whatever they were doing.
 */
export function LegalViewerModal({
  kind,
  onClose,
}: {
  kind: LegalDocumentKind | null;
  onClose: () => void;
}) {
  const doc = kind ? LEGAL_DOCUMENTS[kind] : null;

  return (
    <AnimatePresence>
      {doc && (
        <>
          <motion.div
            key="legal-viewer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-obsidian/85 backdrop-blur-sm z-[60]"
          />
          <motion.div
            key="legal-viewer-modal"
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 20 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="legal-viewer-title"
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(92vw,780px)] max-h-[90vh] bg-graphite border border-titanium/20 rounded-lg shadow-2xl z-[61] flex flex-col overflow-hidden"
          >
            <header className="flex items-center justify-between p-5 border-b border-titanium/10 bg-obsidian/60 shrink-0">
              <h2
                id="legal-viewer-title"
                className="text-sm font-serif text-ivory uppercase tracking-widest"
              >
                {doc.title}
              </h2>
              <button
                onClick={onClose}
                aria-label="Close"
                className="p-2 text-stone/60 hover:text-ivory transition-colors rounded-sm hover:bg-titanium/10"
              >
                <X size={18} />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              <LegalDocumentView document={doc} />
            </div>
            <footer className="shrink-0 border-t border-titanium/10 bg-obsidian/70 p-3 flex items-center justify-between">
              <span className="text-[10px] text-stone/40 font-mono uppercase tracking-widest">
                Obsidian Atlas Tech · v{doc.version}
              </span>
              <button
                onClick={onClose}
                className="px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest rounded-sm bg-titanium/10 text-ivory hover:bg-titanium/20 transition-colors"
              >
                Close
              </button>
            </footer>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
