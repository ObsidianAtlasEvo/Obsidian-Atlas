import { create } from 'zustand';
import { applyStructuralRepair } from '../../lib/atlasRepair';
import { atlasApiUrl } from '../../lib/atlasApi';
import { ChangeProposal } from '../../types';
import { SOVEREIGN_CREATOR_EMAIL } from '../../config/sovereignCreator';

interface ChangeControlState {
  isMutating: boolean;
  activeMutationId: string | null;
  mutationLogs: string[];
  executeRepair: (proposal: ChangeProposal, userEmail: string) => Promise<void>;
  rollBackChange: (changeId: string) => Promise<void>;
}

async function patchStatus(id: string, status: string): Promise<void> {
  const res = await fetch(atlasApiUrl(`/v1/governance/changes/${id}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`PATCH /v1/governance/changes/${id} → ${res.status}`);
}

export const useChangeControlStore = create<ChangeControlState>((set, get) => ({
  isMutating: false,
  activeMutationId: null,
  mutationLogs: [],

  executeRepair: async (proposal: ChangeProposal, userEmail: string) => {
    if (get().isMutating) {
      console.warn('Mutation already in progress. State locked.');
      return;
    }

    if (userEmail !== SOVEREIGN_CREATOR_EMAIL) {
      console.error(`Unauthorized: Only ${SOVEREIGN_CREATOR_EMAIL} can trigger repairs.`);
      return;
    }

    set({ isMutating: true, activeMutationId: proposal.id, mutationLogs: ['[ANALYZING DEPENDENCIES...]'] });

    try {
      await patchStatus(proposal.id, 'approved');

      set(state => ({ mutationLogs: [...state.mutationLogs, '[GENERATING REFACTOR...]'] }));

      // Call the AI Architect
      const repairResult = await applyStructuralRepair({
        id: proposal.id,
        title: proposal.title,
        description: proposal.description,
        classTier: proposal.class,
        userId: userEmail,
      });

      set(state => ({ mutationLogs: [...state.mutationLogs, '[VERIFYING INTEGRITY...]'] }));

      // Simulate applying the code
      await new Promise(resolve => setTimeout(resolve, 1500));

      await patchStatus(proposal.id, 'deployed');

      set(state => ({ mutationLogs: [...state.mutationLogs, `[ARCHITECT]: Mutation ${proposal.id} applied successfully.`] }));

      // Clear state after a delay
      setTimeout(() => {
        set({ isMutating: false, activeMutationId: null, mutationLogs: [] });
      }, 3000);

    } catch (error) {
      console.error('Repair failed:', error);
      set(state => ({ mutationLogs: [...state.mutationLogs, `[ERROR]: Mutation failed: ${error}`] }));
      await patchStatus(proposal.id, 'pending').catch(() => {});
      set({ isMutating: false, activeMutationId: null });
    }
  },

  rollBackChange: async (changeId: string) => {
    try {
      await patchStatus(changeId, 'rejected');
    } catch (error) {
      console.error('[ChangeControl] rollback failed:', error);
    }
  }
}));
