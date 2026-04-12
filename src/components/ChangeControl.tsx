import React, { useState, useEffect, useCallback } from 'react';
import { AppState, ChangeProposal } from '../types';
import { motion } from 'motion/react';
import { GitBranch, ShieldCheck, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';
import { useChangeControlStore } from '../services/state/changeControlStore';
import { atlasApiUrl } from '../lib/atlasApi';
import { atlasTraceUserId } from '../lib/atlasTraceContext';

interface ChangeControlProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

export function ChangeControl({ state }: ChangeControlProps) {
  const [proposals, setProposals] = useState<ChangeProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'proposed' | 'approved' | 'executing' | 'deployed' | 'rolled_back'>('all');
  const changeControlStore = useChangeControlStore();

  const userId = atlasTraceUserId(state);

  const loadProposals = useCallback(async () => {
    try {
      const res = await fetch(
        `${atlasApiUrl('/v1/governance/changes')}?userId=${encodeURIComponent(userId)}`,
        { credentials: 'include' }
      );
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as {
        changes: Array<Record<string, unknown>>;
      };
      const mapped: ChangeProposal[] = data.changes.map((c) => ({
        id: String(c.id),
        title: String(c.title),
        description: String(c.description),
        class: Math.min(4, Math.max(0, Number(c.class) || 2)) as ChangeProposal['class'],
        status: c.status as ChangeProposal['status'],
        proposedBy: String(c.proposedBy ?? 'system'),
        approvedBy: c.approvedBy ? String(c.approvedBy) : undefined,
        createdAt: String(c.createdAt ?? new Date().toISOString()),
        deployedAt: undefined,
        rollbackSafe: true,
      }));
      setProposals(mapped);
    } catch {
      setProposals([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadProposals();
    const id = setInterval(() => void loadProposals(), 20_000);
    return () => clearInterval(id);
  }, [loadProposals]);

  const handleApprove = async (proposal: ChangeProposal) => {
    if (state.currentUser?.email) {
      await changeControlStore.executeRepair(proposal, state.currentUser.email, userId);
      await loadProposals();
    }
  };

  const filteredProposals =
    filter === 'all' ? proposals : proposals.filter((p) => p.status === filter);

  const getClassColor = (cls: number) => {
    switch (cls) {
      case 4:
        return 'text-crimson-900 border-crimson-900/20 bg-crimson-900/5';
      case 3:
        return 'text-gold-500 border-gold-500/20 bg-gold-500/5';
      case 2:
        return 'text-ivory border-stone-800/20 bg-stone-800/5';
      default:
        return 'text-stone border-stone-800/10 bg-stone-800/5';
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-serif text-ivory tracking-tight">Change Control System</h2>
          <p className="text-[10px] font-mono uppercase tracking-widest text-stone">Governance & Deployment Management · Atlas backend</p>
        </div>
        <div className="flex bg-stone-900/40 border border-stone-800 p-1 rounded-sm">
          {['all', 'proposed', 'approved', 'deployed', 'rolled_back'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f as typeof filter)}
              className={cn(
                'px-3 py-1.5 text-[8px] uppercase tracking-widest transition-all duration-300',
                filter === f ? 'bg-gold-500/10 text-gold-500' : 'text-stone hover:text-ivory'
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {loading ? (
          <div className="py-20 text-center text-stone uppercase tracking-widest pulse-shimmer rounded-sm">
            Scanning Change Queue...
          </div>
        ) : filteredProposals.length === 0 ? (
          <div className="py-20 text-center text-stone uppercase tracking-widest opacity-30">No Proposals in this State</div>
        ) : (
          filteredProposals.map((proposal) => (
            <motion.div
              key={proposal.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className={cn(
                'p-8 border rounded-sm flex flex-col gap-6 group transition-all relative overflow-hidden',
                getClassColor(proposal.class),
                changeControlStore.activeMutationId === proposal.id && 'scanline-mutation'
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <div className="p-3 bg-obsidian/40 border border-stone-800 rounded-sm">
                    <GitBranch size={20} className={cn(proposal.class >= 3 ? 'text-gold-500' : 'text-stone')} />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-sm font-bold text-ivory uppercase tracking-widest">{proposal.title}</h3>
                      <span className="text-[8px] font-mono uppercase tracking-widest px-2 py-0.5 bg-stone-800/10 text-stone border border-stone-800/20 rounded-full">
                        Class {proposal.class}
                      </span>
                    </div>
                    <p className="text-xs text-stone leading-relaxed max-w-2xl">{proposal.description}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span
                    className={cn(
                      'text-[10px] font-bold uppercase tracking-widest px-3 py-1 border rounded-full',
                      proposal.status === 'proposed'
                        ? 'text-gold-500 border-gold-500/20 bg-gold-500/5'
                        : proposal.status === 'approved'
                          ? 'text-teal border-teal/20 bg-teal/5'
                          : 'text-stone border-stone-800/20 bg-stone-800/5'
                    )}
                  >
                    {proposal.status}
                  </span>
                  <span className="text-[8px] font-mono text-stone uppercase tracking-widest">
                    Created: {new Date(proposal.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div className="pt-6 border-t border-stone-800/50 flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <div className="flex flex-col">
                    <span className="text-[8px] uppercase tracking-widest text-stone">Proposed By</span>
                    <span className="text-[10px] font-mono text-ivory">{proposal.proposedBy.substring(0, 8)}...</span>
                  </div>
                  {proposal.approvedBy && (
                    <div className="flex flex-col">
                      <span className="text-[8px] uppercase tracking-widest text-stone">Approved By</span>
                      <span className="text-[10px] font-mono text-gold-500">{proposal.approvedBy.substring(0, 8)}...</span>
                    </div>
                  )}
                  <div className="flex flex-col">
                    <span className="text-[8px] uppercase tracking-widest text-stone">Rollback Safe</span>
                    <span
                      className={cn(
                        'text-[10px] font-mono',
                        proposal.rollbackSafe ? 'text-teal' : 'text-crimson-900'
                      )}
                    >
                      {proposal.rollbackSafe ? 'YES' : 'NO'}
                    </span>
                  </div>
                </div>

                {proposal.status === 'proposed' && proposal.class >= 3 && (
                  <button
                    onClick={() => handleApprove(proposal)}
                    disabled={changeControlStore.isMutating}
                    className="px-6 py-2 bg-gold-500 text-obsidian font-bold uppercase tracking-widest text-[10px] hover:bg-ivory transition-all duration-300 flex items-center gap-2 disabled:opacity-50"
                  >
                    {changeControlStore.activeMutationId === proposal.id ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" /> EXECUTING REPAIR...
                      </>
                    ) : (
                      <>
                        <ShieldCheck size={14} /> Approve Structural Change
                      </>
                    )}
                  </button>
                )}
              </div>

              {changeControlStore.activeMutationId === proposal.id && changeControlStore.mutationLogs.length > 0 && (
                <div className="mt-4 p-4 bg-obsidian border border-stone-800 rounded-sm font-mono text-[10px] text-stone space-y-1">
                  {changeControlStore.mutationLogs.map((log, idx) => (
                    <div key={idx} className="animate-pulse-subtle">
                      {log}
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
