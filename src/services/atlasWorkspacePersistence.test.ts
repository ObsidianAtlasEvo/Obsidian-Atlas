// Atlas-Audit: [QA-P1] Verified — Vitest locks atlasWorkspace merge/build including pulse-only hydrates, invalid pulse rejection, and snapshot round-trip (Home / Resonance continuity).
import { describe, expect, it } from 'vitest';
import type { AppState, JournalEntry, PersonalDoctrine } from '../types';
import {
  buildAtlasWorkspaceSnapshot,
  mergeAtlasWorkspaceFromFirestore,
} from './atlasWorkspacePersistence';

const sampleJournal: JournalEntry = {
  id: 'j1',
  title: 'Note',
  content: 'Body',
  timestamp: '2026-01-01T00:00:00.000Z',
  tags: [],
  assistanceEnabled: false,
  assistanceMode: 'reflective-mirror',
};

const sampleDoctrine: PersonalDoctrine = {
  id: 'doc1',
  title: 'Test doctrine',
  category: 'principle',
  content: 'Hold the line.',
  version: 1,
  connections: { decisions: [], patterns: [], contradictions: [] },
};

function workspaceSliceState(over: Partial<AppState> = {}): AppState {
  const base = {
    journal: [sampleJournal],
    decisions: [],
    directives: [],
    pulse: {
      lastUpdate: '2026-01-02T00:00:00.000Z',
      items: [
        {
          id: 'pi1',
          type: 'attention' as const,
          content: 'Pulse line',
          priority: 2,
          timestamp: '2026-01-02T00:00:00.000Z',
        },
      ],
    },
    activePosture: {
      tone: 'standard',
      depth: 3,
      challenge: 0.5,
      uiDensity: 'spacious' as const,
      languageLevel: 'expert' as const,
      directness: 0.5,
      continuityIntensity: 0.5,
      activeDirectives: [] as string[],
    },
    userModel: {
      doctrine: [sampleDoctrine],
    },
  };
  return { ...base, ...over } as unknown as AppState;
}

describe('mergeAtlasWorkspaceFromFirestore', () => {
  it('returns empty patch for non-records and wrong schema version', () => {
    expect(mergeAtlasWorkspaceFromFirestore(workspaceSliceState(), null)).toEqual({});
    expect(mergeAtlasWorkspaceFromFirestore(workspaceSliceState(), [])).toEqual({});
    expect(mergeAtlasWorkspaceFromFirestore(workspaceSliceState(), { version: 2 })).toEqual({});
  });

  it('merges arrays and nested pulse when version is 1', () => {
    const prev = workspaceSliceState();
    const raw = {
      version: 1,
      journal: [{ ...sampleJournal, id: 'j-remote' }],
      decisions: [{ id: 'dec1', title: 'D', context: '', dossier: '', options: [], stakeholders: [], principlesChecked: [], emotionalContamination: [], status: 'pending' as const }],
      directives: [],
      pulse: {
        lastUpdate: '2026-03-01T00:00:00.000Z',
        items: [{ id: 'p2', type: 'pattern', content: 'New', priority: 1, timestamp: '2026-03-01T00:00:00.000Z' }],
      },
      activePosture: { ...prev.activePosture, depth: 4 },
      personalDoctrine: [{ ...sampleDoctrine, id: 'doc-remote', title: 'Remote' }],
    };
    const patch = mergeAtlasWorkspaceFromFirestore(prev, raw);
    expect(patch.journal).toHaveLength(1);
    expect(patch.journal?.[0]?.id).toBe('j-remote');
    expect(patch.decisions).toHaveLength(1);
    expect(patch.pulse?.items).toHaveLength(1);
    expect(patch.pulse?.lastUpdate).toBe('2026-03-01T00:00:00.000Z');
    expect(patch.activePosture?.depth).toBe(4);
    expect(patch.userModel?.doctrine?.[0]?.id).toBe('doc-remote');
    expect(patch.userModel?.doctrine).toEqual(raw.personalDoctrine);
  });

  it('retains previous pulse.lastUpdate when remote lastUpdate is not a string', () => {
    const prev = workspaceSliceState();
    const raw = {
      version: 1,
      pulse: {
        lastUpdate: 123,
        items: [{ id: 'p2', type: 'relevant', content: 'X', priority: 1, timestamp: 't' }],
      },
    };
    const patch = mergeAtlasWorkspaceFromFirestore(prev, raw);
    expect(patch.pulse?.lastUpdate).toBe(prev.pulse.lastUpdate);
    expect(patch.pulse?.items).toHaveLength(1);
  });

  it('does not set userModel when personalDoctrine is absent', () => {
    const prev = workspaceSliceState();
    const patch = mergeAtlasWorkspaceFromFirestore(prev, { version: 1, journal: [] });
    expect(patch.userModel).toBeUndefined();
  });

  it('merges pulse-only remote snapshot (partial Firestore document)', () => {
    const prev = workspaceSliceState();
    const remoteItems = [
      {
        id: 'pulse-inquiry-uq-1',
        type: 'pattern' as const,
        content: 'Inquiry completed — “hello”. Omni: direct_qa · posture 2/5.',
        priority: 2,
        timestamp: '2026-04-07T12:00:00.000Z',
      },
      {
        id: 'pulse-resonance-res-9',
        type: 'relevant' as const,
        content: 'Resonance lab completed — “tone check”. Omni: decision_support · posture 4/5 · inquiry resonance-chamber.',
        priority: 2,
        timestamp: '2026-04-07T12:05:00.000Z',
      },
    ];
    const patch = mergeAtlasWorkspaceFromFirestore(prev, {
      version: 1,
      pulse: {
        lastUpdate: '2026-04-07T12:05:00.000Z',
        items: remoteItems,
      },
    });
    expect(Object.keys(patch).sort()).toEqual(['pulse']);
    expect(patch.pulse?.items).toEqual(remoteItems);
    expect(patch.pulse?.lastUpdate).toBe('2026-04-07T12:05:00.000Z');
  });

  it('ignores remote pulse object when items is not an array', () => {
    const prev = workspaceSliceState();
    const patch = mergeAtlasWorkspaceFromFirestore(prev, {
      version: 1,
      pulse: { lastUpdate: '2026-04-07T00:00:00.000Z', items: 'not-array' as unknown as [] },
    });
    expect(patch.pulse).toBeUndefined();
  });
});

describe('buildAtlasWorkspaceSnapshot', () => {
  it('embeds workspace slice with version 1 and doctrine from userModel', () => {
    const state = workspaceSliceState();
    const snap = buildAtlasWorkspaceSnapshot(state);
    expect(snap.version).toBe(1);
    expect(snap.journal).toEqual(state.journal);
    expect(snap.personalDoctrine).toEqual(state.userModel.doctrine);
    expect(snap.activePosture).toEqual(state.activePosture);
    expect(snap.pulse).toEqual(state.pulse);
    expect(snap.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
