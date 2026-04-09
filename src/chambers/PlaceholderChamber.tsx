import React from 'react';
import { useAtlasStore } from '../store/useAtlasStore';

interface PlaceholderChamberProps {
  mode: string;
}

// Chamber descriptions — shown as context about what's coming
const CHAMBER_DESCRIPTIONS: Record<string, { summary: string; when: string }> = {
  'Crucible': {
    summary: 'Adversarial testing of your beliefs, plans, and assumptions. Applies pressure-testing, contradiction scans, blind-spot detection, and reality checks.',
    when: 'Phase 2',
  },
  'Decisions': {
    summary: 'Structured decision architecture with options, tradeoffs, second-order consequences, reversibility scoring, and post-decision review loops.',
    when: 'Phase 2',
  },
  'Scenarios': {
    summary: 'Multi-branch future mapping with probability estimates, leverage points, failure paths, and strategic pivots.',
    when: 'Phase 2',
  },
  'Forge': {
    summary: 'Build intellectual artifacts: strategy briefs, doctrine books, essays, research memos, teaching modules, playbooks.',
    when: 'Phase 2',
  },
  'Constitution': {
    summary: 'Your personal operating principles — values, standards, goals, motives, tensions, reasoning style, aesthetic model.',
    when: 'Phase 2',
  },
  'Continuity': {
    summary: 'Long-term identity tracking: evolution timeline, growth milestones, identity diffs, recurring loops.',
    when: 'Phase 2',
  },
  'Relationships': {
    summary: 'Deep modeling of the people in your orbit — trust, resonance, drivers, mental models, unresolved tensions.',
    when: 'Phase 2',
  },
  'Signals': {
    summary: 'Pattern recognition across your intellectual and life landscape. Hard and soft signals, insight extraction, trend mapping.',
    when: 'Phase 2',
  },
  'Canon': {
    summary: 'Your intellectual canon — thinkers, frameworks, ideas, texts you consider foundational or anti-canon.',
    when: 'Phase 3',
  },
  'Council': {
    summary: 'Synthetic advisory council — different reasoning lenses applied to your questions simultaneously.',
    when: 'Phase 3',
  },
  'Topology': {
    summary: 'Cartographic mapping of your knowledge terrain, blind spots, and conceptual relationships.',
    when: 'Phase 3',
  },
  'Mirror': {
    summary: 'Deep introspective mode — Atlas reflects your thinking patterns back to you with pattern ledger and current read.',
    when: 'Phase 2',
  },
  'MirrorForge': {
    summary: 'Advanced self-modeling: active modes, current psychological read, decision divergence analysis.',
    when: 'Phase 3',
  },
  'Reality Engine': {
    summary: 'Systemic mapping of your current life situation — nodes, connections, leverage points, consequence inspector.',
    when: 'Phase 3',
  },
  'Vault': {
    summary: 'Encrypted private materials — sensitive context that Atlas can use but that has maximum access restriction.',
    when: 'Phase 2',
  },
  'Directive Center': {
    summary: 'Manage persistent instructions to Atlas — tone, depth, challenge level, structure preferences, behavioral constraints.',
    when: 'Phase 2',
  },
  'Memory Vault': {
    summary: 'Direct access to Atlas\'s memory layers — sovereign, working, transient. Inspect, edit, promote, and purge.',
    when: 'Phase 2',
  },
  'Chrysalis': {
    summary: 'Atlas\'s self-improvement engine — implemented upgrades, running experiments, weakness ledger, model comparisons.',
    when: 'Phase 3',
  },
  'Drift Center': {
    summary: 'Value drift and alignment monitoring — alerts, calibration rituals, overall alignment score.',
    when: 'Phase 3',
  },
  'Creator Console': {
    summary: 'Sovereign creator operations — system governance, gap ledger, change control, audit logs, emergency containment.',
    when: 'Active',
  },
};

export default function PlaceholderChamber({ mode }: PlaceholderChamberProps) {
  const setActiveMode = useAtlasStore((s) => s.setActiveMode);
  const info = CHAMBER_DESCRIPTIONS[mode];

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 40px',
        gap: 24,
        animation: 'atlas-fade-in 300ms ease both',
      }}
    >
      {/* Chamber identity */}
      <div style={{ textAlign: 'center', maxWidth: 480 }}>
        <div
          style={{
            fontSize: '0.625rem',
            fontWeight: 600,
            letterSpacing: '0.14em',
            color: 'rgba(201,162,39,0.5)',
            textTransform: 'uppercase',
            marginBottom: 12,
          }}
        >
          {info?.when ?? 'Planned'} · Under Construction
        </div>

        <h2
          style={{
            fontSize: '1.5rem',
            fontWeight: 400,
            letterSpacing: '-0.03em',
            color: 'rgba(226,232,240,0.85)',
            margin: '0 0 12px',
          }}
        >
          {mode}
        </h2>

        {info?.summary && (
          <p
            style={{
              fontSize: '0.875rem',
              color: 'rgba(226,232,240,0.38)',
              lineHeight: 1.75,
              margin: 0,
            }}
          >
            {info.summary}
          </p>
        )}
      </div>

      {/* Visual indicator */}
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          border: '1px dashed rgba(88,28,135,0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="rgba(88,28,135,0.4)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
      </div>

      {/* Back to Atlas */}
      <button
        onClick={() => setActiveMode('atlas')}
        style={{
          background: 'transparent',
          border: '1px solid rgba(88,28,135,0.2)',
          borderRadius: 6,
          padding: '8px 16px',
          color: 'rgba(226,232,240,0.4)',
          fontSize: '0.75rem',
          cursor: 'pointer',
          fontFamily: 'inherit',
          transition: 'all 140ms ease',
          letterSpacing: '0.04em',
        }}
        onMouseEnter={(e) => {
          (e.target as HTMLButtonElement).style.borderColor = 'rgba(201,162,39,0.3)';
          (e.target as HTMLButtonElement).style.color = 'rgba(226,232,240,0.7)';
          (e.target as HTMLButtonElement).style.background = 'rgba(88,28,135,0.08)';
        }}
        onMouseLeave={(e) => {
          (e.target as HTMLButtonElement).style.borderColor = 'rgba(88,28,135,0.2)';
          (e.target as HTMLButtonElement).style.color = 'rgba(226,232,240,0.4)';
          (e.target as HTMLButtonElement).style.background = 'transparent';
        }}
      >
        Return to Atlas
      </button>
    </div>
  );
}
