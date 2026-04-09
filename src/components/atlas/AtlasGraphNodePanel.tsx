import React, { useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Link2, X } from 'lucide-react';
import { MOCK_ENTITIES } from '../../constants';
import type { Entity } from '../../types';

function resolveTitle(targetId: string): string {
  return MOCK_ENTITIES.find((e) => e.id === targetId)?.title ?? targetId;
}

function confidenceScore(entity: Entity): number {
  const m = entity.metadata?.confidence;
  if (typeof m === 'number' && Number.isFinite(m)) {
    return Math.min(1, Math.max(0, m));
  }
  return Number(
    (entity.tension.truth * 0.45 + entity.tension.weight * 0.35 + (1 - entity.tension.tension) * 0.2).toFixed(3)
  );
}

interface AtlasGraphNodePanelProps {
  entity: Entity | null;
  onClose: () => void;
}

const panelTransition = { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const };

export function AtlasGraphNodePanel({ entity, onClose }: AtlasGraphNodePanelProps) {
  const score = entity ? confidenceScore(entity) : 0;
  const relations = useMemo(() => entity?.relationships ?? [], [entity]);

  return (
    <AnimatePresence>
      {entity && (
        <React.Fragment key={entity.id}>
          <motion.button
            type="button"
            aria-label="Dismiss node detail"
            className="absolute inset-0 z-40 bg-[#030303]/75 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={panelTransition}
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="graph-node-title"
            className="absolute top-0 right-0 z-50 h-full w-full max-w-md border-l border-signal-amber/15 bg-graphite/95 backdrop-blur-xl shadow-2xl flex flex-col"
            initial={{ x: '100%', opacity: 0.92 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0.85 }}
            transition={panelTransition}
          >
            <div className="flex items-start justify-between gap-4 p-6 border-b border-titanium/25">
              <div className="space-y-1 min-w-0">
                <p className="instrument-label text-signal-amber/90">{entity.type}</p>
                <h2 id="graph-node-title" className="text-xl font-serif text-ivory tracking-tight truncate">
                  {entity.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 p-2 rounded-sm text-stone hover:text-ivory hover:bg-titanium/30 transition-colors"
              >
                <X size={18} strokeWidth={1.5} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
              <p className="editorial-body text-ivory/75">{entity.description}</p>

              <div className="rounded-sm border border-titanium/30 bg-obsidian/40 p-4 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="instrument-label text-stone">Confidence</span>
                  <span className="font-mono text-xs text-extract-green tabular-nums">
                    {(score * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="h-1 bg-titanium/40 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-extract-green/80 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${score * 100}%` }}
                    transition={panelTransition}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Link2 size={14} className="text-signal-amber/80" strokeWidth={1.5} />
                  <h3 className="instrument-label text-stone">Relationships</h3>
                </div>
                <ul className="space-y-2">
                  {relations.length === 0 ? (
                    <li className="text-xs font-mono text-stone/60">No linked nodes</li>
                  ) : (
                    relations.map((rel) => (
                      <li
                        key={`${entity.id}-${rel.targetId}-${rel.type}`}
                        className="flex flex-col gap-0.5 rounded-sm border border-titanium/20 bg-titanium/10 px-3 py-2"
                      >
                        <span className="text-[11px] font-serif text-ivory/90">{resolveTitle(rel.targetId)}</span>
                        <span className="font-mono text-[9px] uppercase tracking-widest text-stone">
                          {rel.type} · strength {(rel.strength * 100).toFixed(0)}%
                        </span>
                      </li>
                    ))
                  )}
                </ul>
              </div>

              {entity.epistemic && (
                <div className="rounded-sm border border-drift-crimson/20 bg-drift-crimson/5 p-3 space-y-1">
                  <span className="instrument-label text-drift-crimson/90">Epistemic layer</span>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-stone">{entity.epistemic.layer}</p>
                </div>
              )}
            </div>
          </motion.aside>
        </React.Fragment>
      )}
    </AnimatePresence>
  );
}
