import React, { useState } from 'react';
import { useAtlasStore } from '../store/useAtlasStore';
import { generateId, nowISO } from '../lib/persistence';
import { useIsMobile } from '../hooks/useIsMobile';
import MobileBackButton from '../components/shell/MobileBackButton';

// TODO: Add store actions: addArtifact, removeArtifact, updateArtifact to useAtlasStore

type ArtifactType =
  | 'strategy-brief'
  | 'doctrine-book'
  | 'deck'
  | 'essay'
  | 'research-memo'
  | 'teaching-module'
  | 'issue-map'
  | 'playbook'
  | 'manual'
  | 'manuscript';

interface BuildArtifact {
  id: string;
  type: ArtifactType;
  title: string;
  content: string;
  status: 'draft' | 'finished';
}

interface BuildWithAtlas {
  artifacts: BuildArtifact[];
}

const C = {
  body: '#050505',
  panel: 'rgba(15,10,30,0.55)',
  inset: 'rgba(5,5,8,0.72)',
  border: 'rgba(88,28,135,0.14)',
  borderSubtle: 'rgba(88,28,135,0.1)',
  text: 'rgba(226,232,240,0.92)',
  muted: 'rgba(226,232,240,0.55)',
  dim: 'rgba(226,232,240,0.3)',
  gold: 'rgba(201,162,39,0.9)',
  violet: 'rgba(167,139,250,0.85)',
  danger: 'rgba(239,68,68,0.75)',
  success: 'rgba(34,197,94,0.7)',
  indigo: 'rgba(99,102,241,0.7)',
  amber: 'rgba(234,179,8,0.7)',
  teal: 'rgba(6,182,212,0.7)',
  rose: 'rgba(244,114,182,0.7)',
};

const label: React.CSSProperties = {
  fontSize: '0.62rem',
  fontWeight: 600,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: C.dim,
};

const ARTIFACT_TYPES: { type: ArtifactType; icon: string; desc: string; color: string }[] = [
  { type: 'strategy-brief', icon: '⚡', desc: 'Concise strategic framing', color: C.gold },
  { type: 'doctrine-book', icon: '📜', desc: 'Core beliefs & principles', color: C.violet },
  { type: 'deck', icon: '🎴', desc: 'Presentation storyline', color: C.indigo },
  { type: 'essay', icon: '✍️', desc: 'Longform argument', color: C.teal },
  { type: 'research-memo', icon: '🔬', desc: 'Structured research output', color: C.success },
  { type: 'teaching-module', icon: '🎓', desc: 'Educational content unit', color: C.amber },
  { type: 'issue-map', icon: '🗺️', desc: 'Problem & stakeholder landscape', color: C.rose },
  { type: 'playbook', icon: '📋', desc: 'Repeatable process guide', color: C.indigo },
  { type: 'manual', icon: '🔧', desc: 'Reference & how-to', color: C.muted },
  { type: 'manuscript', icon: '📖', desc: 'Full-length written work', color: C.gold },
];

const SEED_ARTIFACTS: BuildArtifact[] = [
  {
    id: 'art-1',
    type: 'strategy-brief',
    title: 'Q3 Strategic Reset',
    content: 'This brief outlines the three priority shifts required entering Q3...',
    status: 'draft',
  },
  {
    id: 'art-2',
    type: 'essay',
    title: 'On Compounding Leverage',
    content: 'Leverage compounds in ways that linear thinking fails to model...',
    status: 'finished',
  },
];

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export default function ForgeChamber() {
  const storeData = useAtlasStore((s) => s.buildWithAtlas) as BuildWithAtlas | undefined;
  // TODO: Replace local state with store actions once artifact CRUD is implemented
  const [artifacts, setArtifacts] = useState<BuildArtifact[]>(
    storeData?.artifacts?.length ? storeData.artifacts : SEED_ARTIFACTS
  );
  const isMobile = useIsMobile();
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    typeof window !== 'undefined' && window.innerWidth < 640 ? null : (artifacts[0]?.id ?? null),
  );
  const [view, setView] = useState<'grid' | 'list'>('list');
  const [showTypeGrid, setShowTypeGrid] = useState(false);
  const [newType, setNewType] = useState<ArtifactType>('essay');
  const [newTitle, setNewTitle] = useState('');

  const selected = artifacts.find((a) => a.id === selectedId) ?? null;

  const createArtifact = (type: ArtifactType) => {
    const a: BuildArtifact = {
      id: generateId(),
      type,
      title: 'Untitled ' + type.replace(/-/g, ' '),
      content: '',
      status: 'draft',
    };
    setArtifacts((prev) => [...prev, a]);
    setSelectedId(a.id);
    setShowTypeGrid(false);
  };

  const updateSelected = (patch: Partial<BuildArtifact>) => {
    if (!selected) return;
    setArtifacts((prev) => prev.map((a) => a.id === selected.id ? { ...a, ...patch } : a));
  };

  const removeArtifact = (id: string) => {
    setArtifacts((prev) => prev.filter((a) => a.id !== id));
    if (selectedId === id) setSelectedId(artifacts.find((a) => a.id !== id)?.id ?? null);
  };

  const typeInfo = (t: ArtifactType) => ARTIFACT_TYPES.find((x) => x.type === t);

  const isDetailActive = !!selected;
  const showListPane = !isMobile || !isDetailActive;
  const showDetailPane = !isMobile || isDetailActive;
  const goBackToList = () => {
    setSelectedId(null);
    setShowTypeGrid(false);
  };

  return (
    <div style={{ display: 'flex', height: '100%', background: C.body, color: C.text, fontFamily: 'inherit', animation: 'atlas-fade-in 300ms ease both', minHeight: 0, minWidth: 0 }}>
      {/* Left panel */}
      {showListPane && (
      <div style={{ width: isMobile ? '100%' : 260, flexShrink: 0, background: C.panel, borderRight: isMobile ? 'none' : `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '16px 14px 12px', borderBottom: `1px solid ${C.borderSubtle}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={label}>Forge</span>
            <button
              onClick={() => setShowTypeGrid((v) => !v)}
              style={{ background: 'rgba(201,162,39,0.15)', border: `1px solid rgba(201,162,39,0.25)`, color: C.gold, borderRadius: 4, padding: '2px 8px', fontSize: '0.72rem', cursor: 'pointer' }}
            >
              {showTypeGrid ? '← Back' : '+ New'}
            </button>
          </div>
        </div>

        {/* Type picker grid */}
        {showTypeGrid && (
          <div style={{ padding: 12, borderBottom: `1px solid ${C.borderSubtle}`, background: C.inset }}>
            <div style={{ ...label, marginBottom: 8 }}>Choose Type</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {ARTIFACT_TYPES.map((t) => (
                <button
                  key={t.type}
                  onClick={() => createArtifact(t.type)}
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: `1px solid ${C.border}`,
                    borderRadius: 6,
                    padding: '8px 6px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    color: C.text,
                    transition: 'background 150ms',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(88,28,135,0.12)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                >
                  <div style={{ fontSize: '1rem', marginBottom: 2 }}>{t.icon}</div>
                  <div style={{ fontSize: '0.68rem', fontWeight: 600, color: t.color, textTransform: 'capitalize' }}>{t.type.replace(/-/g, ' ')}</div>
                  <div style={{ fontSize: '0.65rem', color: C.dim, marginTop: 1, lineHeight: 1.3 }}>{t.desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Artifact list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {artifacts.length === 0 && (
            <div style={{ padding: 16, color: C.dim, fontSize: '0.8rem', textAlign: 'center' }}>No artifacts yet</div>
          )}
          {artifacts.map((a) => {
            const ti = typeInfo(a.type);
            return (
              <div
                key={a.id}
                onClick={() => setSelectedId(a.id)}
                style={{
                  padding: '10px 14px',
                  borderBottom: `1px solid ${C.borderSubtle}`,
                  cursor: 'pointer',
                  background: selectedId === a.id ? 'rgba(88,28,135,0.18)' : 'transparent',
                  borderLeft: selectedId === a.id ? `2px solid ${C.gold}` : '2px solid transparent',
                  transition: 'background 150ms',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: '0.85rem' }}>{ti?.icon}</span>
                  <span style={{ fontSize: '0.82rem', color: C.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ ...label, color: ti?.color ?? C.dim }}>{a.type.replace(/-/g, ' ')}</span>
                  <span style={{
                    marginLeft: 'auto',
                    fontSize: '0.62rem',
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    padding: '1px 6px',
                    borderRadius: 3,
                    background: a.status === 'finished' ? 'rgba(34,197,94,0.12)' : 'rgba(234,179,8,0.12)',
                    color: a.status === 'finished' ? C.success : C.amber,
                    border: `1px solid ${a.status === 'finished' ? 'rgba(34,197,94,0.2)' : 'rgba(234,179,8,0.2)'}`,
                  }}>
                    {a.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      )}

      {/* Editor panel */}
      {showDetailPane && (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {isMobile && (
          <div style={{ padding: '10px 14px 0' }}>
            <MobileBackButton onClick={goBackToList} label="Artifacts" />
          </div>
        )}
        {!selected ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: '0.9rem', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: '2rem', opacity: 0.4 }}>📝</div>
            <div>Select an artifact or create a new one</div>
            <button
              onClick={() => setShowTypeGrid(true)}
              style={{ background: 'rgba(201,162,39,0.12)', border: `1px solid rgba(201,162,39,0.25)`, color: C.gold, borderRadius: 6, padding: '8px 20px', fontSize: '0.8rem', cursor: 'pointer' }}
            >
              + New Artifact
            </button>
          </div>
        ) : (
          <>
            {/* Toolbar */}
            <div style={{ padding: isMobile ? '10px 14px' : '12px 20px', borderBottom: `1px solid ${C.border}`, background: C.panel, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
              {/* Type badge */}
              <span style={{ fontSize: '1.1rem' }}>{typeInfo(selected.type)?.icon}</span>

              {/* Title input */}
              <input
                value={selected.title}
                onChange={(e) => updateSelected({ title: e.target.value })}
                style={{ flex: 1, background: 'transparent', border: 'none', borderBottom: `1px solid ${C.border}`, color: C.text, fontSize: '1rem', fontWeight: 600, padding: '2px 0', outline: 'none' }}
              />

              {/* Type selector */}
              <select
                value={selected.type}
                onChange={(e) => updateSelected({ type: e.target.value as ArtifactType })}
                style={{ background: C.inset, border: `1px solid ${C.border}`, color: C.muted, borderRadius: 4, padding: '4px 6px', fontSize: '0.75rem', cursor: 'pointer' }}
              >
                {ARTIFACT_TYPES.map((t) => (
                  <option key={t.type} value={t.type}>{t.icon} {t.type.replace(/-/g, ' ')}</option>
                ))}
              </select>

              {/* Status toggle */}
              <button
                onClick={() => updateSelected({ status: selected.status === 'draft' ? 'finished' : 'draft' })}
                style={{
                  background: selected.status === 'finished' ? 'rgba(34,197,94,0.12)' : 'rgba(234,179,8,0.12)',
                  border: `1px solid ${selected.status === 'finished' ? 'rgba(34,197,94,0.25)' : 'rgba(234,179,8,0.25)'}`,
                  color: selected.status === 'finished' ? C.success : C.amber,
                  borderRadius: 4,
                  padding: '4px 10px',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                {selected.status}
              </button>

              <button
                onClick={() => removeArtifact(selected.id)}
                style={{ background: 'rgba(239,68,68,0.08)', border: `1px solid rgba(239,68,68,0.2)`, color: C.danger, borderRadius: 4, padding: '4px 8px', fontSize: '0.72rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* Editor area */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: isMobile ? 14 : 20, overflow: 'hidden', minWidth: 0 }}>
              <textarea
                value={selected.content}
                onChange={(e) => updateSelected({ content: e.target.value })}
                placeholder="Begin writing…"
                style={{
                  flex: 1,
                  background: C.inset,
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  color: C.text,
                  fontSize: '0.88rem',
                  lineHeight: 1.75,
                  padding: '16px 20px',
                  resize: 'none',
                  outline: 'none',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
              {/* Footer: word count + type desc */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                <span style={{ ...label, color: C.dim }}>
                  {typeInfo(selected.type)?.desc}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <span style={{ ...label }}>
                    <span style={{ color: C.violet, fontVariantNumeric: 'tabular-nums' }}>{wordCount(selected.content)}</span>
                    <span style={{ marginLeft: 4 }}>words</span>
                  </span>
                  <span style={{ ...label }}>
                    <span style={{ color: C.dim, fontVariantNumeric: 'tabular-nums' }}>{selected.content.length}</span>
                    <span style={{ marginLeft: 4 }}>chars</span>
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      )}
    </div>
  );
}
