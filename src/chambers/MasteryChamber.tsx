import React, { useState } from 'react';
import { useAtlasStore } from '../store/useAtlasStore';
import { generateId, nowISO } from '../lib/persistence';

interface KnowledgeLayer {
  level: 'literacy' | 'competence' | 'fluency' | 'rigor' | 'nuance' | 'synthesis' | 'ambiguity';
  description: string;
  masteryIndicators: string[];
}

interface CuratedExpertLayer {
  expertChambers: string[];
  canonicalSources: string[];
  readingLadders: { title: string; steps: string[] }[];
  frameworks: string[];
}

// ─── Design tokens ───────────────────────────────────────────────
const T = {
  body: 'rgba(226,232,240,0.92)',
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
  panel: 'rgba(15,10,30,0.55)',
  inset: 'rgba(5,5,8,0.72)',
  border: 'rgba(88,28,135,0.14)',
  borderSubtle: 'rgba(88,28,135,0.1)',
};

const labelStyle: React.CSSProperties = {
  fontSize: '0.62rem',
  fontWeight: 600,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
};

// Level color progression: dim → bright gold
const LEVEL_COLORS: Record<KnowledgeLayer['level'], string> = {
  literacy:    'rgba(226,232,240,0.25)',
  competence:  'rgba(226,232,240,0.38)',
  fluency:     'rgba(234,179,8,0.45)',
  rigor:       'rgba(234,179,8,0.6)',
  nuance:      'rgba(201,162,39,0.7)',
  synthesis:   'rgba(201,162,39,0.82)',
  ambiguity:   'rgba(201,162,39,0.9)',
};

const LEVEL_INDEX: Record<KnowledgeLayer['level'], number> = {
  literacy: 0, competence: 1, fluency: 2, rigor: 3, nuance: 4, synthesis: 5, ambiguity: 6,
};

const LEVEL_LABELS: KnowledgeLayer['level'][] = [
  'literacy', 'competence', 'fluency', 'rigor', 'nuance', 'synthesis', 'ambiguity',
];

const DEFAULT_LAYERS: KnowledgeLayer[] = [
  {
    level: 'literacy',
    description: 'You can read and comprehend material in this domain without confusion.',
    masteryIndicators: [
      'Can define core terms accurately',
      'Can follow expert discussion without getting lost',
      'Understands the basic problem space',
    ],
  },
  {
    level: 'competence',
    description: 'You can apply foundational concepts correctly in standard situations.',
    masteryIndicators: [
      'Can solve well-defined problems in this domain',
      'Knows which tools apply to which contexts',
      'Can identify obvious errors in reasoning',
    ],
  },
  {
    level: 'fluency',
    description: 'You move through the domain efficiently, without friction or lookup.',
    masteryIndicators: [
      'Can reason in the domain under time pressure',
      'Has internalized core frameworks as reflexes',
      'Can explain concepts clearly to others',
    ],
  },
  {
    level: 'rigor',
    description: 'You engage with edge cases, failure modes, and methodological standards.',
    masteryIndicators: [
      'Understands the epistemological limits of the domain',
      'Can evaluate evidence quality critically',
      'Knows the strong objections to main positions',
    ],
  },
  {
    level: 'nuance',
    description: 'You hold competing views simultaneously and understand why disagreement persists.',
    masteryIndicators: [
      'Understands why smart people disagree',
      'Can steelman opposing positions convincingly',
      'Recognizes when context changes answers',
    ],
  },
  {
    level: 'synthesis',
    description: 'You connect this domain to adjacent fields and generate novel framings.',
    masteryIndicators: [
      'Can produce original insights in the domain',
      'Makes productive cross-domain analogies',
      'Can design new frameworks for novel problems',
    ],
  },
  {
    level: 'ambiguity',
    description: 'You operate at the frontier — comfortable where knowledge breaks down.',
    masteryIndicators: [
      'Can work productively with irreducible uncertainty',
      'Knows what the field does not yet know',
      'Can identify productive research directions',
    ],
  },
];

const EMPTY_EXPERT: CuratedExpertLayer = {
  expertChambers: [],
  canonicalSources: [],
  readingLadders: [],
  frameworks: [],
};

// ─── Sub-components ──────────────────────────────────────────────

function TagPill({ label, onRemove, color }: { label: string; onRemove?: () => void; color: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        background: `${color.replace('0.7', '0.08').replace('0.9', '0.08').replace('0.85', '0.08')}`,
        border: `1px solid ${color.replace('0.7', '0.18').replace('0.9', '0.18').replace('0.85', '0.18')}`,
        borderRadius: 4,
        padding: '3px 8px',
        ...labelStyle,
        color: color,
        fontWeight: 500,
        fontSize: '0.72rem',
      }}
    >
      {label}
      {onRemove && (
        <button
          onClick={onRemove}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'inherit',
            cursor: 'pointer',
            padding: 0,
            lineHeight: 1,
            opacity: 0.6,
            fontSize: '0.7rem',
          }}
        >
          ✕
        </button>
      )}
    </span>
  );
}

function MasteryLevelCard({
  layer,
  index,
}: {
  layer: KnowledgeLayer;
  index: number;
}) {
  const color = LEVEL_COLORS[layer.level];
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  const checkedCount = Object.values(checked).filter(Boolean).length;
  const total = layer.masteryIndicators.length;

  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        animation: 'atlas-fade-in 300ms ease both',
        animationDelay: `${index * 40}ms`,
      }}
    >
      {/* Level spine */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 32 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            border: `2px solid ${color}`,
            background: checkedCount === total ? color.replace('0.9', '0.15').replace('0.25', '0.08') : T.inset,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.65rem',
            fontWeight: 700,
            color: color,
            flexShrink: 0,
          }}
        >
          {index + 1}
        </div>
        {index < LEVEL_LABELS.length - 1 && (
          <div
            style={{
              width: 1,
              flex: 1,
              minHeight: 20,
              background: `linear-gradient(${color}, ${LEVEL_COLORS[LEVEL_LABELS[index + 1]]})`,
              opacity: 0.4,
              margin: '3px 0',
            }}
          />
        )}
      </div>

      {/* Card */}
      <div
        style={{
          flex: 1,
          background: T.panel,
          border: `1px solid ${color.replace('0.9', '0.12').replace('0.25', '0.08').replace('0.38', '0.08').replace('0.45', '0.1').replace('0.6', '0.12').replace('0.7', '0.12').replace('0.82', '0.14')}`,
          borderRadius: 8,
          padding: '12px 14px',
          marginBottom: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: color, fontWeight: 700, fontSize: '0.9rem', textTransform: 'capitalize' }}>
              {layer.level}
            </span>
            {/* Progress pill */}
            <span
              style={{
                ...labelStyle,
                color: checkedCount === total ? T.success : T.dim,
                background: checkedCount === total ? 'rgba(34,197,94,0.08)' : T.inset,
                border: `1px solid ${checkedCount === total ? 'rgba(34,197,94,0.2)' : T.borderSubtle}`,
                borderRadius: 10,
                padding: '1px 7px',
                fontSize: '0.6rem',
              }}
            >
              {checkedCount}/{total}
            </span>
          </div>
        </div>

        <p style={{ color: T.muted, fontSize: '0.8rem', lineHeight: 1.55, margin: '0 0 10px' }}>
          {layer.description}
        </p>

        {/* Progress bar */}
        <div
          style={{
            height: 3,
            background: T.inset,
            borderRadius: 2,
            overflow: 'hidden',
            marginBottom: 10,
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${(checkedCount / total) * 100}%`,
              background: `linear-gradient(90deg, ${color.replace('0.9', '0.4')}, ${color})`,
              borderRadius: 2,
              transition: 'width 0.3s ease',
            }}
          />
        </div>

        {/* Indicators */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {layer.masteryIndicators.map((indicator, i) => (
            <label
              key={i}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={!!checked[i]}
                onChange={(e) => setChecked((prev) => ({ ...prev, [i]: e.target.checked }))}
                style={{
                  accentColor: color,
                  marginTop: 2,
                  flexShrink: 0,
                  cursor: 'pointer',
                }}
              />
              <span
                style={{
                  color: checked[i] ? T.dim : T.muted,
                  fontSize: '0.8rem',
                  lineHeight: 1.45,
                  textDecoration: checked[i] ? 'line-through' : 'none',
                  transition: 'color 0.15s',
                }}
              >
                {indicator}
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReadingLadderCard({
  ladder,
  onRemove,
}: {
  ladder: { title: string; steps: string[] };
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      style={{
        background: T.panel,
        border: `1px solid ${T.border}`,
        borderRadius: 8,
        marginBottom: 8,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          cursor: 'pointer',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <span style={{ color: T.body, fontWeight: 600, fontSize: '0.85rem' }}>{ladder.title}</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ ...labelStyle, color: T.dim }}>{ladder.steps.length} steps</span>
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            style={{
              background: 'transparent',
              border: 'none',
              color: T.dim,
              cursor: 'pointer',
              padding: '1px 4px',
              fontSize: '0.72rem',
            }}
            onMouseEnter={(e) => ((e.target as HTMLElement).style.color = T.danger)}
            onMouseLeave={(e) => ((e.target as HTMLElement).style.color = T.dim)}
          >
            ✕
          </button>
          <span style={{ color: T.dim, fontSize: '0.7rem' }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>
      {expanded && (
        <div style={{ padding: '0 14px 12px', borderTop: `1px solid ${T.borderSubtle}` }}>
          <ol style={{ margin: '10px 0 0', paddingLeft: 20 }}>
            {ladder.steps.map((step, i) => (
              <li
                key={i}
                style={{
                  color: T.muted,
                  fontSize: '0.8rem',
                  lineHeight: 1.55,
                  marginBottom: 4,
                }}
              >
                {step}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────
export default function MasteryChamber() {
  const expertLayerStore = useAtlasStore((s) => (s as any).expertLayer) as CuratedExpertLayer | undefined;
  const [expertLayer, setExpertLayer] = useState<CuratedExpertLayer>(expertLayerStore ?? EMPTY_EXPERT);

  // Add inputs
  const [newChamber, setNewChamber] = useState('');
  const [newSource, setNewSource] = useState('');
  const [newFramework, setNewFramework] = useState('');
  const [newLadderTitle, setNewLadderTitle] = useState('');
  const [newLadderSteps, setNewLadderSteps] = useState('');
  const [showLadderForm, setShowLadderForm] = useState(false);

  const inputStyle: React.CSSProperties = {
    background: T.inset,
    border: `1px solid ${T.border}`,
    borderRadius: 6,
    color: T.body,
    fontSize: '0.83rem',
    padding: '7px 10px',
    outline: 'none',
  };

  function addChamber() {
    const v = newChamber.trim();
    if (!v) return;
    setExpertLayer((prev) => ({ ...prev, expertChambers: [...prev.expertChambers, v] }));
    setNewChamber('');
  }

  function removeChamber(i: number) {
    setExpertLayer((prev) => ({ ...prev, expertChambers: prev.expertChambers.filter((_, idx) => idx !== i) }));
  }

  function addSource() {
    const v = newSource.trim();
    if (!v) return;
    setExpertLayer((prev) => ({ ...prev, canonicalSources: [...prev.canonicalSources, v] }));
    setNewSource('');
  }

  function removeSource(i: number) {
    setExpertLayer((prev) => ({ ...prev, canonicalSources: prev.canonicalSources.filter((_, idx) => idx !== i) }));
  }

  function addFramework() {
    const v = newFramework.trim();
    if (!v) return;
    setExpertLayer((prev) => ({ ...prev, frameworks: [...prev.frameworks, v] }));
    setNewFramework('');
  }

  function removeFramework(i: number) {
    setExpertLayer((prev) => ({ ...prev, frameworks: prev.frameworks.filter((_, idx) => idx !== i) }));
  }

  function addLadder(e: React.FormEvent) {
    e.preventDefault();
    if (!newLadderTitle.trim()) return;
    const steps = newLadderSteps.split('\n').map((s) => s.trim()).filter(Boolean);
    setExpertLayer((prev) => ({
      ...prev,
      readingLadders: [...prev.readingLadders, { title: newLadderTitle.trim(), steps }],
    }));
    setNewLadderTitle('');
    setNewLadderSteps('');
    setShowLadderForm(false);
  }

  function removeLadder(i: number) {
    setExpertLayer((prev) => ({ ...prev, readingLadders: prev.readingLadders.filter((_, idx) => idx !== i) }));
  }

  return (
    <div
      style={{
        minHeight: '100%',
        background: '#050505',
        padding: 24,
        fontFamily: 'inherit',
        animation: 'atlas-fade-in 300ms ease both',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ color: T.gold, fontWeight: 700, fontSize: '1.15rem', margin: '0 0 4px' }}>
          Mastery Chamber
        </h2>
        <p style={{ color: T.muted, fontSize: '0.8rem', margin: 0 }}>
          Map your knowledge depth across disciplines and curate expert resources for deliberate growth.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

        {/* ── Left: Knowledge Depth Ladder ── */}
        <div>
          <div
            style={{
              ...labelStyle,
              color: T.gold,
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span>Knowledge Depth</span>
            <span
              style={{
                background: 'rgba(201,162,39,0.08)',
                border: '1px solid rgba(201,162,39,0.18)',
                borderRadius: 10,
                padding: '1px 8px',
                color: T.gold,
              }}
            >
              7 levels
            </span>
          </div>

          <div>
            {DEFAULT_LAYERS.map((layer, i) => (
              <MasteryLevelCard key={layer.level} layer={layer} index={i} />
            ))}
          </div>
        </div>

        {/* ── Right: Expert Resources ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Expert Chambers */}
          <div>
            <div style={{ ...labelStyle, color: T.violet, marginBottom: 10 }}>Expert Chambers</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8, minHeight: 28 }}>
              {expertLayer.expertChambers.length === 0 && (
                <span style={{ color: T.dim, fontSize: '0.78rem' }}>No chambers added yet.</span>
              )}
              {expertLayer.expertChambers.map((c, i) => (
                <TagPill key={i} label={c} color={T.violet} onRemove={() => removeChamber(i)} />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                style={{ ...inputStyle, flex: 1 }}
                value={newChamber}
                onChange={(e) => setNewChamber(e.target.value)}
                placeholder="Add chamber..."
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addChamber())}
              />
              <button
                onClick={addChamber}
                style={{
                  padding: '7px 12px',
                  borderRadius: 5,
                  border: '1px solid rgba(167,139,250,0.3)',
                  background: 'rgba(167,139,250,0.1)',
                  color: T.violet,
                  ...labelStyle,
                  cursor: 'pointer',
                }}
              >
                Add
              </button>
            </div>
          </div>

          {/* Canonical Sources */}
          <div>
            <div style={{ ...labelStyle, color: T.teal, marginBottom: 10 }}>Canonical Sources</div>
            {expertLayer.canonicalSources.length === 0 ? (
              <p style={{ color: T.dim, fontSize: '0.78rem', marginBottom: 8 }}>No sources added yet.</p>
            ) : (
              <ul style={{ margin: '0 0 8px', padding: 0, listStyle: 'none' }}>
                {expertLayer.canonicalSources.map((src, i) => (
                  <li
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '7px 10px',
                      background: T.panel,
                      border: `1px solid ${T.border}`,
                      borderRadius: 6,
                      marginBottom: 5,
                    }}
                  >
                    <span style={{ color: T.muted, fontSize: '0.82rem' }}>{src}</span>
                    <button
                      onClick={() => removeSource(i)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: T.dim,
                        cursor: 'pointer',
                        padding: '0 3px',
                        fontSize: '0.7rem',
                      }}
                      onMouseEnter={(e) => ((e.target as HTMLElement).style.color = T.danger)}
                      onMouseLeave={(e) => ((e.target as HTMLElement).style.color = T.dim)}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                style={{ ...inputStyle, flex: 1 }}
                value={newSource}
                onChange={(e) => setNewSource(e.target.value)}
                placeholder="Add canonical source..."
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSource())}
              />
              <button
                onClick={addSource}
                style={{
                  padding: '7px 12px',
                  borderRadius: 5,
                  border: '1px solid rgba(6,182,212,0.3)',
                  background: 'rgba(6,182,212,0.08)',
                  color: T.teal,
                  ...labelStyle,
                  cursor: 'pointer',
                }}
              >
                Add
              </button>
            </div>
          </div>

          {/* Reading Ladders */}
          <div>
            <div
              style={{
                ...labelStyle,
                color: T.amber,
                marginBottom: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>Reading Ladders</span>
              <button
                onClick={() => setShowLadderForm(!showLadderForm)}
                style={{
                  ...labelStyle,
                  padding: '3px 8px',
                  borderRadius: 4,
                  border: '1px solid rgba(234,179,8,0.25)',
                  background: showLadderForm ? 'rgba(234,179,8,0.12)' : 'transparent',
                  color: T.amber,
                  cursor: 'pointer',
                }}
              >
                {showLadderForm ? '✕ Cancel' : '+ Add'}
              </button>
            </div>

            {showLadderForm && (
              <form
                onSubmit={addLadder}
                style={{
                  background: T.panel,
                  border: `1px solid rgba(234,179,8,0.15)`,
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 10,
                  animation: 'atlas-fade-in 300ms ease both',
                }}
              >
                <input
                  style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', marginBottom: 8 }}
                  value={newLadderTitle}
                  onChange={(e) => setNewLadderTitle(e.target.value)}
                  placeholder="Ladder title..."
                  required
                />
                <textarea
                  style={{
                    ...inputStyle,
                    width: '100%',
                    boxSizing: 'border-box',
                    minHeight: 80,
                    resize: 'vertical',
                    marginBottom: 8,
                  }}
                  value={newLadderSteps}
                  onChange={(e) => setNewLadderSteps(e.target.value)}
                  placeholder="Steps, one per line..."
                />
                <button
                  type="submit"
                  style={{
                    width: '100%',
                    padding: '7px 0',
                    borderRadius: 5,
                    border: '1px solid rgba(234,179,8,0.3)',
                    background: 'rgba(234,179,8,0.1)',
                    color: T.amber,
                    ...labelStyle,
                    cursor: 'pointer',
                  }}
                >
                  Create Ladder
                </button>
              </form>
            )}

            {expertLayer.readingLadders.length === 0 && !showLadderForm && (
              <p style={{ color: T.dim, fontSize: '0.78rem', marginBottom: 0 }}>No reading ladders yet.</p>
            )}
            {expertLayer.readingLadders.map((ladder, i) => (
              <ReadingLadderCard key={i} ladder={ladder} onRemove={() => removeLadder(i)} />
            ))}
          </div>

          {/* Frameworks */}
          <div>
            <div style={{ ...labelStyle, color: T.indigo, marginBottom: 10 }}>Frameworks</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8, minHeight: 28 }}>
              {expertLayer.frameworks.length === 0 && (
                <span style={{ color: T.dim, fontSize: '0.78rem' }}>No frameworks added yet.</span>
              )}
              {expertLayer.frameworks.map((f, i) => (
                <TagPill key={i} label={f} color={T.indigo} onRemove={() => removeFramework(i)} />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                style={{ ...inputStyle, flex: 1 }}
                value={newFramework}
                onChange={(e) => setNewFramework(e.target.value)}
                placeholder="Add framework..."
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addFramework())}
              />
              <button
                onClick={addFramework}
                style={{
                  padding: '7px 12px',
                  borderRadius: 5,
                  border: '1px solid rgba(99,102,241,0.3)',
                  background: 'rgba(99,102,241,0.08)',
                  color: T.indigo,
                  ...labelStyle,
                  cursor: 'pointer',
                }}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
