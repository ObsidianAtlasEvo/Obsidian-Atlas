import { create } from 'zustand';
import { applyStructuralRepair } from '../ollamaService';
import { ChangeProposal } from '../../types';
import { atlasApiUrl } from '../../lib/atlasApi';

async function patchChange(id: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(atlasApiUrl(`/v1/governance/changes/${encodeURIComponent(id)}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(t || `HTTP ${res.status}`);
  }
}

async function postAudit(userId: string, action: string, actor: string, details: object, severity: string): Promise<void> {
  await fetch(atlasApiUrl('/v1/governance/audit-logs'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ userId, action, actor, details, severity }),
  });
}

interface ChangeControlState {
  isMutating: boolean;
  activeMutationId: string | null;
  mutationLogs: string[];
  executeRepair: (proposal: ChangeProposal, userEmail: string, traceUserId: string) => Promise<void>;
  rollBackChange: (changeId: string, traceUserId: string) => Promise<void>;
}

export const useChangeControlStore = create<ChangeControlState>((set, get) => ({
  isMutating: false,
  activeMutationId: null,
  mutationLogs: [],

  executeRepair: async (proposal, userEmail, traceUserId) => {
    if (get().isMutating) {
      console.warn('Mutation already in progress. State locked.');
      return;
    }

    if (userEmail !== 'crowleyrc62@gmail.com') {
      console.error('Unauthorized: Only crowleyrc62@gmail.com can trigger repairs.');
      return;
    }

    set({ isMutating: true, activeMutationId: proposal.id, mutationLogs: ['[ANALYZING DEPENDENCIES...]' ] });

    try {
      await patchChange(proposal.id, { status: 'testing', approvedBy: userEmail });
      set((state) => ({ mutationLogs: [...state.mutationLogs, '[GENERATING REFACTOR...]'] }));

      await applyStructuralRepair({
        id: proposal.id,
        title: proposal.title,
        description: proposal.description,
        classTier: proposal.class,
      });

      set((state) => ({ mutationLogs: [...state.mutationLogs, '[VERIFYING INTEGRITY...]'] }));
      await new Promise((resolve) => setTimeout(resolve, 1500));

      await patchChange(proposal.id, { status: 'deployed', approvedBy: userEmail });
      set((state) => ({
        mutationLogs: [...state.mutationLogs, `[ARCHITECT]: Mutation ${proposal.id} applied successfully.`],
      }));
      await postAudit(traceUserId, 'Structural Repair Deployed', userEmail, { proposalId: proposal.id }, 'high');

      setTimeout(() => {
        set({ isMutating: false, activeMutationId: null, mutationLogs: [] });
      }, 3000);
    } catch (error) {
      console.error('Repair failed:', error);
      set((state) => ({
        mutationLogs: [...state.mutationLogs, `[ERROR]: Mutation failed: ${error}`],
      }));
      try {
        await patchChange(proposal.id, { status: 'proposed' });
      } catch {
        /* ignore */
      }
      set({ isMutating: false, activeMutationId: null });
    }
  },

  rollBackChange: async (changeId, traceUserId) => {
    try {
      await patchChange(changeId, { status: 'rolled_back' });
      await postAudit(traceUserId, 'Change Rolled Back', 'console', { proposalId: changeId }, 'high');
    } catch (error) {
      console.error(error);
    }
  },
}));
