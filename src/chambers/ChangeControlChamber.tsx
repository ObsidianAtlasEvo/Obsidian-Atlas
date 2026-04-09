import React, { useState } from 'react';
import { useAtlasStore } from '../store/useAtlasStore';
import { generateId, nowISO } from '../lib/persistence';

// ─── Types ────────────────────────────────────────────────────────────────────

type ProposalClass = 0 | 1 | 2 | 3 | 4;

type ProposalStatus =
  | 'draft'
  | 'proposed'
  | 'testing'
  | 'approved'
  | 'deployed'
  | 'rolled_back'
  | 'rejected';

interface ChangeProposal {
  id: string;
  title: string;
  description: string;
  class: ProposalClass;
  status: ProposalStatus;
  proposedBy: string;
  approvedBy?: string;
  createdAt: string;
  deployedAt?: string;
  rollbackSafe: boolean;
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  body:    '#050505',
  panel:   'rgba(15,10,30,0.55)',
  inset:   'rgba(5,5,8,0.72)',
  border:  'rgba(88,28,135,0.14)',
  borderS: 'rgba(88,28,135,0.1)',
  text:    'rgba(226,232,240,0.92)',
  muted:   'rgba(226,232,240,0.55)',
  dim:     'rgba(226,232,240,0.3)',
  gold:    'rgba(201,162,39,0.9)',
  violet:  'rgba(167,139,250,0.85)',
  danger:  'rgba(239,68,68,0.75)',
  success: 'rgba(34,197,94,0.7)',
  indigo:  'rgba(99,102,241,0.7)',
  amber:   'rgba(234,179,8,0.7)',
  teal:    'rgba(6,182,212,0.7)',
  gray:    'rgba(148,163,184,0.45)',
};

const LABEL: React.CSSProperties = {
  fontSize: '0.62rem',
  fontWeight: 600,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: C.muted,
};

const PANEL: React.CSSProperties = {
  background: C.panel,
  border: `1px solid ${C.border}`,
  borderRadius: 12,
  padding: '20px 24px',
};

const INSET: React.CSSProperties = {
  background: C.inset,
  border: `1px solid ${C.borderS}`,
  borderRadius: 8,
};

const FADE: React.CSSProperties = { animation: 'atlas-fade-in 300ms ease both' };

// ─── Config maps ──────────────────────────────────────────────────────────────

const CLASS_CONFIG: Record<ProposalClass, { label: string; color: string; desc: string }> = {
  0: { label: 'Class 0', color: C.gray,   desc: 'Cosmetic' },
  1: { label: 'Class 1', color: C.teal,   desc: 'Minor behavioral' },
  2: { label: 'Class 2', color: C.amber,  desc: 'Moderate structural' },
  3: { label: 'Class 3', color: C.indigo, desc: 'Major architectural' },
  4: { label: 'Class 4', color: C.danger, desc: 'Critical / irreversible' },
};

const STATUS_CONFIG: Record<ProposalStatus, { label: string; color: string; order: number }> = {
  draft:       { label: 'Draft',       color: C.gray,    order: 0 },
  proposed:    { label: 'Proposed',    color: C.violet,  order: 1 },
  testing:     { label: 'Testing',     color: C.amber,   order: 2 },
  approved:    { label: 'Approved',    color: C.teal,    order: 3 },
  deployed:    { label: 'Deployed',    color: C.success, order: 4 },
  rolled_back: { label: 'Rolled Back', color: C.amber,   order: 5 },
  rejected:    { label: 'Rejected',    color: C.danger,  order: 6 },
};

// Main pipeline — shown as columns
const PIPELINE_STATUSES: ProposalStatus[] = ['draft', 'proposed', 'testing', 'approved', 'deployed'];
// Terminal statuses — shown separately
const TERMINAL_STATUSES: ProposalStatus[] = ['rejected', 'rolled_back'];

// Allowed transitions per status
const NEXT_STATUSES: Record<ProposalStatus, ProposalStatus[]> = {
  draft:       ['proposed', 'rejected'],
  proposed:    ['testing', 'rejected'],
  testing:     ['approved', 'rejected', 'rolled_back'],
  approved:    ['deployed', 'rejected', 'rolled_back'],
  deployed:    ['rolled_back'],
  rolled_back: [],
  rejected:    [],
};

// ─── Seed data ────────────────────────────────────────────────────────────────

const SEED: ChangeProposal[] = [
  {
    id: 'chg-001',
    title: 'Update primary font weight across dashboard',
    description: 'Change all h2 headings from font-weight 700 to 800 for improved hierarchy and visual consistency.',
    class: 0,
    status: 'deployed',
    proposedBy: 'designer_01',
    approvedBy: 'sovereign_creator_01',
    createdAt: new Date(Date.now() - 86400000 * 10).toISOString(),
    deployedAt: new Date(Date.now() - 86400000 * 8).toISOString(),
    rollbackSafe: true,
  },
  {
    id: 'chg-002',
    title: 'Memory consolidation cadence — 6h → 12h',
    description: 'Reduce consolidation frequency to lower I/O load during peak hours. Impact: minor recall latency increase of ~200ms expected.',
    class: 1,
    status: 'testing',
    proposedBy: 'arch_team',
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    rollbackSafe: true,
  },
  {
    id: 'chg-003',
    title: 'Replace in-memory store with IndexedDB persistence layer',
    description: 'Migrate all ephemeral state to persistent IndexedDB storage. Eliminates data loss on page reload. Requires migration script and schema versioning.',
    class: 3,
    status: 'proposed',
    proposedBy: 'eng_lead',
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    rollbackSafe: false,
  },
  {
    id: 'chg-004',
    title: 'Remove legacy API v1 compatibility shim',
    description: 'Drop the v1 adapter entirely. Any client still using v1 endpoints will break. Requires coordinated migration.',
    class: 4,
    status: 'draft',
    proposedBy: 'sovereign_creator_01',
    createdAt: nowISO(),
    rollbackSafe: false,
  },
  {
    id: 'chg-005',
    title: 'Increase doctrine rule evaluation timeout',
    description: 'Raise the per-rule evaluation timeout from 500ms to 2000ms to support complex LLM-backed rules.',
    class: 2,
    status: 'approved',
    proposedBy: 'ai_team',
    approvedBy: 'sovereign_creator_01',
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    rollbackSafe: true,
  },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function ClassBadge({ cls }: { cls: ProposalClass }) {
  const cfg = CLASS_CONFIG[cls];
  return (
    <span style={{
      background: `${cfg.color}18`,
      border: `1px solid ${cfg.color}44`,
      borderRadius: 5,
      color: cfg.color,
      fontSize: '0.63rem',
      fontWeight: 700,
      letterSpacing: '0.08em',
      padding: '2px 8px',
      whiteSpace: 'nowrap',
    }}>
      C{cls} · {cfg.desc}
    </span>
  );
}

function RollbackIndicator({ safe }: { safe: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: '0.68rem',
      color: safe ? C.success : C.danger,
      fontWeight: 600,
    }}>
      {safe ? '✓' : '✗'} Rollback {safe ? 'Safe' : 'Unsafe'}
    </span>
  );
}

// ─── Proposal card ────────────────────────────────────────────────────────────

function ProposalCard({
  proposal,
  onMove,
}: {
  proposal: ChangeProposal;
  onMove: (id: string, status: ProposalStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const nextStatuses = NEXT_STATUSES[proposal.status] ?? [];
  const clsCfg = CLASS_CONFIG[proposal.class];

  return (
    <div
      style={{
        ...INSET,
        padding: '14px 15px',
        cursor: 'pointer',
        borderColor: open ? `${clsCfg.color}44` : C.borderS,
        transition: 'border-color 200ms',
        marginBottom: 6,
      }}
      onClick={() => setOpen(o => !o)}
    >
      {/* Title */}
      <div style={{ color: C.text, fontWeight: 600, fontSize: '0.83rem', marginBottom: 8, lineHeight: 1.4 }}>
        {proposal.title}
      </div>

      {/* Badges */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
        <ClassBadge cls={proposal.class} />
        <RollbackIndicator safe={proposal.rollbackSafe} />
      </div>

      {/* Proposed by */}
      <div style={{ color: C.dim, fontSize: '0.72rem' }}>
        by <span style={{ color: C.muted }}>{proposal.proposedBy}</span>
      </div>

      {/* Truncated description */}
      {!open && (
        <div style={{
          color: C.dim,
          fontSize: '0.76rem',
          marginTop: 7,
          lineHeight: 1.5,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}>
          {proposal.description}
        </div>
      )}

      {/* Expanded detail */}
      {open && (
        <div style={{ marginTop: 12, ...FADE }} onClick={e => e.stopPropagation()}>
          <div style={{ color: C.muted, fontSize: '0.8rem', lineHeight: 1.65, marginBottom: 12 }}>
            {proposal.description}
          </div>

          {/* Dates */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            <div>
              <div style={LABEL}>Created</div>
              <div style={{ color: C.muted, fontSize: '0.75rem', marginTop: 3 }}>
                {new Date(proposal.createdAt).toLocaleDateString()}
              </div>
            </div>
            {proposal.deployedAt && (
              <div>
                <div style={LABEL}>Deployed</div>
                <div style={{ color: C.success, fontSize: '0.75rem', marginTop: 3 }}>
                  {new Date(proposal.deployedAt).toLocaleDateString()}
                </div>
              </div>
            )}
            {proposal.approvedBy && (
              <div>
                <div style={LABEL}>Approved By</div>
                <div style={{ color: C.gold, fontSize: '0.75rem', marginTop: 3 }}>
                  {proposal.approvedBy}
                </div>
              </div>
            )}
          </div>

          {/* Transition buttons */}
          {nextStatuses.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {nextStatuses.map(ns => {
                const cfg = STATUS_CONFIG[ns];
                return (
                  <button
                    key={ns}
                    onClick={() => onMove(proposal.id, ns)}
                    style={{
                      background: `${cfg.color}14`,
                      border: `1px solid ${cfg.color}44`,
                      borderRadius: 6,
                      color: cfg.color,
                      cursor: 'pointer',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      padding: '6px 13px',
                      transition: 'background 150ms',
                      letterSpacing: '0.03em',
                    }}
                  >
                    → {cfg.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Kanban column ────────────────────────────────────────────────────────────

function KanbanColumn({
  status,
  proposals,
  onMove,
}: {
  status: ProposalStatus;
  proposals: ChangeProposal[];
  onMove: (id: string, status: ProposalStatus) => void;
}) {
  const cfg = STATUS_CONFIG[status];
  return (
    <div style={{
      flex: '0 0 auto',
      width: 230,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Column header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px',
        background: `${cfg.color}0E`,
        border: `1px solid ${cfg.color}33`,
        borderRadius: '8px 8px 0 0',
        marginBottom: 1,
      }}>
        <div style={{
          ...LABEL,
          color: cfg.color,
          fontSize: '0.63rem',
          letterSpacing: '0.1em',
        }}>
          {cfg.label}
        </div>
        <div style={{
          background: `${cfg.color}22`,
          border: `1px solid ${cfg.color}44`,
          borderRadius: 20,
          color: cfg.color,
          fontSize: '0.68rem',
          fontWeight: 700,
          padding: '1px 8px',
        }}>
          {proposals.length}
        </div>
      </div>

      {/* Cards container */}
      <div style={{
        flex: 1,
        background: 'rgba(5,5,8,0.35)',
        border: `1px solid ${C.borderS}`,
        borderTop: 'none',
        borderRadius: '0 0 8px 8px',
        padding: '10px',
        minHeight: 180,
      }}>
        {proposals.length === 0 ? (
          <div style={{ color: C.dim, fontSize: '0.72rem', textAlign: 'center', paddingTop: 24 }}>
            —
          </div>
        ) : (
          proposals.map(p => (
            <ProposalCard key={p.id} proposal={p} onMove={onMove} />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Terminal status section ──────────────────────────────────────────────────

function TerminalSection({
  proposals,
  onMove,
}: {
  proposals: ChangeProposal[];
  onMove: (id: string, status: ProposalStatus) => void;
}) {
  if (proposals.length === 0) return null;

  return (
    <div style={{ ...PANEL, marginTop: 28 }}>
      <div style={{ ...LABEL, marginBottom: 14 }}>Terminal States — Rejected & Rolled Back</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {proposals.map(p => {
          const cfg = STATUS_CONFIG[p.status];
          return (
            <div key={p.id} style={{
              ...INSET,
              padding: '13px 15px',
              flex: '0 0 auto',
              width: 240,
              borderColor: `${cfg.color}30`,
            }}>
              <div style={{ color: C.muted, fontSize: '0.83rem', fontWeight: 600, marginBottom: 6, lineHeight: 1.35 }}>
                {p.title}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
                <ClassBadge cls={p.class} />
                <span style={{
                  background: `${cfg.color}18`,
                  border: `1px solid ${cfg.color}44`,
                  borderRadius: 5,
                  color: cfg.color,
                  fontSize: '0.63rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                }}>
                  {cfg.label}
                </span>
              </div>
              <div style={{ color: C.dim, fontSize: '0.7rem' }}>by {p.proposedBy}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Add Proposal Form ────────────────────────────────────────────────────────

const CLASS_DESCS: { cls: ProposalClass; label: string }[] = [
  { cls: 0, label: '0 — Cosmetic' },
  { cls: 1, label: '1 — Minor behavioral' },
  { cls: 2, label: '2 — Moderate structural' },
  { cls: 3, label: '3 — Major architectural' },
  { cls: 4, label: '4 — Critical / irreversible' },
];

function AddProposalForm({ onAdd }: { onAdd: (p: ChangeProposal) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [cls, setCls] = useState<ProposalClass>(1);
  const [rollbackSafe, setRollbackSafe] = useState(true);

  const submit = () => {
    if (!title.trim()) return;
    onAdd({
      id: generateId(),
      title: title.trim(),
      description: desc.trim(),
      class: cls,
      status: 'draft',
      proposedBy: 'sovereign_creator',
      createdAt: nowISO(),
      rollbackSafe,
    });
    setTitle(''); setDesc(''); setCls(1); setRollbackSafe(true);
    setOpen(false);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: C.inset,
    border: `1px solid ${C.border}`,
    borderRadius: 7,
    color: C.text,
    fontSize: '0.84rem',
    padding: '10px 12px',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          background: 'rgba(88,28,135,0.12)',
          border: `1px dashed rgba(88,28,135,0.35)`,
          borderRadius: 10,
          color: C.violet,
          cursor: 'pointer',
          fontSize: '0.82rem',
          fontWeight: 600,
          padding: '13px',
          width: '100%',
          letterSpacing: '0.04em',
          marginTop: 20,
        }}
      >
        + Propose New Change
      </button>
    );
  }

  return (
    <div style={{ ...PANEL, marginTop: 20, ...FADE }}>
      <div style={{ ...LABEL, marginBottom: 16 }}>New Change Proposal</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div style={{ ...LABEL, marginBottom: 6 }}>Title</div>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Brief descriptive title..." style={inputStyle} />
        </div>
        <div>
          <div style={{ ...LABEL, marginBottom: 6 }}>Description</div>
          <textarea
            value={desc}
            onChange={e => setDesc(e.target.value)}
            placeholder="Full description, rationale, and expected impact..."
            style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div style={{ ...LABEL, marginBottom: 6 }}>Change Class</div>
            <select
              value={cls}
              onChange={e => setCls(Number(e.target.value) as ProposalClass)}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              {CLASS_DESCS.map(d => (
                <option key={d.cls} value={d.cls}>{d.label}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={{ ...LABEL, marginBottom: 6 }}>Rollback Safety</div>
            <div
              onClick={() => setRollbackSafe(s => !s)}
              style={{
                ...inputStyle,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                cursor: 'pointer',
                userSelect: 'none',
                padding: '10px 14px',
              }}
            >
              <div style={{
                width: 34, height: 18, borderRadius: 9,
                background: rollbackSafe ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.25)',
                border: `1px solid ${rollbackSafe ? C.success : C.danger}`,
                position: 'relative',
                transition: 'background 200ms',
                flexShrink: 0,
              }}>
                <div style={{
                  position: 'absolute',
                  top: 2, left: rollbackSafe ? 16 : 2,
                  width: 12, height: 12, borderRadius: '50%',
                  background: rollbackSafe ? C.success : C.danger,
                  transition: 'left 200ms',
                }} />
              </div>
              <span style={{ color: rollbackSafe ? C.success : C.danger, fontSize: '0.8rem', fontWeight: 600 }}>
                {rollbackSafe ? 'Rollback Safe' : 'Rollback Unsafe'}
              </span>
            </div>
          </div>
        </div>

        {/* Class preview */}
        <div style={{ ...INSET, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <ClassBadge cls={cls} />
          <span style={{ color: C.muted, fontSize: '0.78rem' }}>
            {CLASS_CONFIG[cls].desc} change — {
              cls === 0 ? 'safe to deploy without review' :
              cls === 1 ? 'minimal testing required' :
              cls === 2 ? 'staging validation required' :
              cls === 3 ? 'architectural review required' :
              'requires unanimous creator approval'
            }
          </span>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={() => setOpen(false)} style={{
            background: 'transparent',
            border: `1px solid ${C.borderS}`,
            borderRadius: 7,
            color: C.muted,
            cursor: 'pointer',
            fontSize: '0.78rem',
            padding: '8px 16px',
          }}>
            Cancel
          </button>
          <button onClick={submit} style={{
            background: 'rgba(88,28,135,0.22)',
            border: `1px solid rgba(88,28,135,0.45)`,
            borderRadius: 7,
            color: C.violet,
            cursor: 'pointer',
            fontSize: '0.78rem',
            fontWeight: 600,
            padding: '8px 20px',
            opacity: title.trim() ? 1 : 0.4,
          }}>
            Create Draft
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ChangeControlChamber() {
  const [proposals, setProposals] = useState<ChangeProposal[]>(SEED);

  const addProposal = (p: ChangeProposal) => setProposals(prev => [p, ...prev]);

  const moveProposal = (id: string, newStatus: ProposalStatus) => {
    setProposals(prev => prev.map(p => {
      if (p.id !== id) return p;
      const updates: Partial<ChangeProposal> = { status: newStatus };
      if (newStatus === 'deployed') updates.deployedAt = nowISO();
      if (newStatus === 'approved') updates.approvedBy = 'sovereign_creator';
      return { ...p, ...updates };
    }));
  };

  const pipelineProposals = PIPELINE_STATUSES.map(s => ({
    status: s,
    items: proposals.filter(p => p.status === s),
  }));

  const terminalProposals = proposals.filter(p => TERMINAL_STATUSES.includes(p.status));

  // Summary stats
  const totalActive = proposals.filter(p => !TERMINAL_STATUSES.includes(p.status) && p.status !== 'deployed').length;
  const totalDeployed = proposals.filter(p => p.status === 'deployed').length;
  const totalRejected = proposals.filter(p => p.status === 'rejected').length;
  const totalRolledBack = proposals.filter(p => p.status === 'rolled_back').length;

  return (
    <div style={{
      minHeight: '100vh',
      background: C.body,
      color: C.text,
      fontFamily: "'Inter', system-ui, sans-serif",
      padding: '32px 28px',
      boxSizing: 'border-box',
    }}>
      <style>{`
        @keyframes atlas-fade-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 24, ...FADE }}>
        <div style={{ ...LABEL, color: C.gold, marginBottom: 4 }}>Sovereign Creator</div>
        <h1 style={{ margin: 0, fontSize: '1.55rem', fontWeight: 800, color: C.text, letterSpacing: '-0.01em' }}>
          Change Control
        </h1>
        <div style={{ color: C.muted, fontSize: '0.8rem', marginTop: 4 }}>
          Govern system changes from proposal through deployment and rollback
        </div>
      </div>

      {/* Stats bar */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24, ...FADE }}>
        {[
          { label: 'Active', value: totalActive, color: C.violet },
          { label: 'Deployed', value: totalDeployed, color: C.success },
          { label: 'Rejected', value: totalRejected, color: C.danger },
          { label: 'Rolled Back', value: totalRolledBack, color: C.amber },
          { label: 'Total', value: proposals.length, color: C.gold },
        ].map(s => (
          <div key={s.label} style={{
            ...INSET,
            padding: '12px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}>
            <div style={{ ...LABEL, color: s.color }}>{s.label}</div>
            <div style={{ color: s.color, fontWeight: 700, fontSize: '1.3rem' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Kanban board */}
      <div style={{
        display: 'flex',
        gap: 10,
        overflowX: 'auto',
        paddingBottom: 12,
        ...FADE,
      }}>
        {pipelineProposals.map(col => (
          <KanbanColumn
            key={col.status}
            status={col.status}
            proposals={col.items}
            onMove={moveProposal}
          />
        ))}
      </div>

      {/* Terminal states */}
      <TerminalSection proposals={terminalProposals} onMove={moveProposal} />

      {/* Add form */}
      <AddProposalForm onAdd={addProposal} />
    </div>
  );
}
