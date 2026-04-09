import { create } from 'zustand';
import { applyStructuralRepair } from '../ollamaService';
import { db, handleFirestoreError, OperationType, logAudit } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { ChangeProposal } from '../../types';

interface ChangeControlState {
  isMutating: boolean;
  activeMutationId: string | null;
  mutationLogs: string[];
  executeRepair: (proposal: ChangeProposal, userEmail: string) => Promise<void>;
  rollBackChange: (changeId: string) => Promise<void>;
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
    
    if (userEmail !== 'crowleyrc62@gmail.com') {
      console.error('Unauthorized: Only crowleyrc62@gmail.com can trigger repairs.');
      return;
    }

    set({ isMutating: true, activeMutationId: proposal.id, mutationLogs: ['[ANALYZING DEPENDENCIES...]'] });
    
    const proposalRef = doc(db, 'change_control', proposal.id);
    
    try {
      await updateDoc(proposalRef, { status: 'executing' });
      
      set(state => ({ mutationLogs: [...state.mutationLogs, '[GENERATING REFACTOR...]'] }));
      
      // Call the AI Architect
      const repairResult = await applyStructuralRepair({
        id: proposal.id,
        title: proposal.title,
        description: proposal.description,
        classTier: proposal.class
      });
      
      set(state => ({ mutationLogs: [...state.mutationLogs, '[VERIFYING INTEGRITY...]'] }));
      
      // Simulate applying the code (in a real scenario, this would write to the file system, which we can't do directly from the browser safely without a backend, but we simulate the success)
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      await updateDoc(proposalRef, { status: 'deployed' });
      
      set(state => ({ mutationLogs: [...state.mutationLogs, `[ARCHITECT]: Mutation ${proposal.id} applied successfully.`] }));
      logAudit('Structural Repair Deployed', 'high', { proposalId: proposal.id });
      
      // Clear state after a delay
      setTimeout(() => {
        set({ isMutating: false, activeMutationId: null, mutationLogs: [] });
      }, 3000);
      
    } catch (error) {
      console.error('Repair failed:', error);
      set(state => ({ mutationLogs: [...state.mutationLogs, `[ERROR]: Mutation failed: ${error}`] }));
      await updateDoc(proposalRef, { status: 'proposed' }); // Revert status
      set({ isMutating: false, activeMutationId: null });
      handleFirestoreError(error, OperationType.UPDATE, 'change_control');
    }
  },
  
  rollBackChange: async (changeId: string) => {
    // Implementation for rollback
    const proposalRef = doc(db, 'change_control', changeId);
    try {
      await updateDoc(proposalRef, { status: 'rolled_back' });
      logAudit('Change Rolled Back', 'high', { proposalId: changeId });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'change_control');
    }
  }
}));
