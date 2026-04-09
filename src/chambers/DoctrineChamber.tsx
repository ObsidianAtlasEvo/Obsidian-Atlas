import React, { useState } from 'react';
import { useAtlasStore } from '../store/useAtlasStore';
import { nowISO } from '../lib/persistence';
import type { PersonalDoctrine } from '@/types';

const CATEGORIES: PersonalDoctrine['category'][] = [
  'principle', 'value', 'decision-rule', 'standard', 'red-line', 'aesthetic', 'strategic',
];

const CATEGORY_COLORS: Record<PersonalDoctrine['category'], string> = {
  'principle':     'rgba(99,102,241,0.75)',
  'value':         'rgba(34,197,94,0.7)',
  'decision-rule': 'rgba(234,179,8,0.75)',
  'standard':      'rgba(167,139,250,0.75)',
  'red-line':      'rgba(239,68,68,0.75)',
  'aesthetic':     'rgba(244,114,182,0.7)',
  'strategic':     'rgba(201,162,39,0.75)',
};

const REFINEMENT_VECTORS: NonNullable<PersonalDoctrine['refinementVector']>[] = [
  'precision', 'elegance', 'authority', 'restraint', 'depth', 'structural-understanding',
];

interface NewItemForm {
  title: string;
  category: PersonalDoctrine['category'];
  content: string;
  refinementVector?: PersonalDoctrine['refinementVector'];
}

function DoctrineCard({
  item,
  onDelete,
}: {
  item: PersonalDoctrine;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const color = CATEGORY_COLORS[item.category];

  return (
    <div
      style={{
        background: 'rgba(15,10,30,0.45)',
        border: `1px solid ${expanded ? 'rgba(88,28,135,0.35)' : 'rgba(88,28,135,0.12)'}`,
        borderLeft: `2px solid ${color}`,
        borderRadius: 8,
        overflow: 'hidden',
        transition: 'border-color 140ms ease',
        marginBottom: 10,
      }}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          padding: '12px 14px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          gap: 10,
          fontFamily: 'inherit',
          textAlign: 'left',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span
              style={{
                fontSize: '0.58rem',
                fontWeight: 700,
                letterSpacing: '0.1em',
                color,
                textTransform: 'uppercase',
                flexShrink: 0,
              }}
            >
              {item.category}
            </span>
            {item.refinementVector && (
              <span style={{ fontSize: '0.58rem', color: 'rgba(226,232,240,0.22)', letterSpacing: '0.06em' }}>
                → {item.refinementVector}
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: '0.85rem',
              fontWeight: 500,
              color: 'rgba(226,232,240,0.88)',
              letterSpacing: '-0.01em',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: expanded ? 'normal' : 'nowrap',
            }}
          >
            {item.title}
          </div>
        </div>

        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="rgba(226,232,240,0.25)"
          strokeWidth="2"
          style={{
            flexShrink: 0,
            transform: expanded ? 'rotate(180deg)' : 'rotate(0)',
            transition: 'transform 200ms ease',
          }}
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {expanded && (
        <div
          style={{
            padding: '0 14px 14px',
            animation: 'atlas-fade-in 200ms ease both',
          }}
        >
          <p
            style={{
              margin: '0 0 14px',
              fontSize: '0.83rem',
              color: 'rgba(226,232,240,0.65)',
              lineHeight: 1.75,
              borderTop: '1px solid rgba(88,28,135,0.1)',
              paddingTop: 12,
            }}
          >
            {item.content}
          </p>

          {/* Connections */}
          {(item.connections.decisions.length > 0 || item.connections.patterns.length > 0 || item.connections.contradictions.length > 0) && (
            <div style={{ fontSize: '0.68rem', color: 'rgba(226,232,240,0.25)', marginBottom: 12 }}>
              {item.connections.decisions.length > 0 && (
                <span style={{ marginRight: 12 }}>Decisions: {item.connections.decisions.length}</span>
              )}
              {item.connections.contradictions.length > 0 && (
                <span style={{ color: 'rgba(239,68,68,0.4)' }}>Contradictions: {item.connections.contradictions.length}</span>
              )}
            </div>
          )}

          <button
            onClick={onDelete}
            style={{
              background: 'transparent',
              border: '1px solid rgba(239,68,68,0.15)',
              borderRadius: 4,
              padding: '4px 10px',
              color: 'rgba(239,68,68,0.4)',
              cursor: 'pointer',
              fontSize: '0.65rem',
              letterSpacing: '0.08em',
              fontFamily: 'inherit',
              transition: 'all 140ms ease',
            }}
          >
            REMOVE
          </button>
        </div>
      )}
    </div>
  );
}

export default function DoctrineChamber() {
  const doctrine = useAtlasStore((s) => s.userModel.doctrine);
  const addDoctrineItem = useAtlasStore((s) => s.addDoctrineItem);
  const removeDoctrineItem = useAtlasStore((s) => s.removeDoctrineItem);

  const [isAdding, setIsAdding] = useState(false);
  const [filter, setFilter] = useState<PersonalDoctrine['category'] | 'all'>('all');
  const [form, setForm] = useState<NewItemForm>({
    title: '',
    category: 'principle',
    content: '',
    refinementVector: undefined,
  });

  const filtered = filter === 'all' ? doctrine : doctrine.filter((d) => d.category === filter);

  const grouped = CATEGORIES.reduce<Record<string, PersonalDoctrine[]>>((acc, cat) => {
    acc[cat] = filtered.filter((d) => d.category === cat);
    return acc;
  }, {});

  async function handleAdd() {
    if (!form.title.trim() || !form.content.trim()) return;

    await addDoctrineItem({
      title: form.title.trim(),
      category: form.category,
      content: form.content.trim(),
      version: 1,
      refinementVector: form.refinementVector,
      connections: { decisions: [], patterns: [], contradictions: [] },
    });

    setForm({ title: '', category: 'principle', content: '', refinementVector: undefined });
    setIsAdding(false);
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div
        style={{
          padding: '20px 28px 16px',
          borderBottom: '1px solid var(--border-structural)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 500, color: 'rgba(226,232,240,0.88)', letterSpacing: '-0.02em' }}>
            Personal Doctrine
          </h2>
          <p style={{ margin: '3px 0 0', fontSize: '0.75rem', color: 'rgba(226,232,240,0.28)' }}>
            {doctrine.length} {doctrine.length === 1 ? 'principle' : 'principles'} · The rules you live and decide by
          </p>
        </div>

        <button
          onClick={() => setIsAdding(true)}
          style={{
            background: 'rgba(88,28,135,0.2)',
            border: '1px solid rgba(88,28,135,0.4)',
            borderRadius: 6,
            padding: '7px 14px',
            color: 'rgba(167,139,250,0.8)',
            cursor: 'pointer',
            fontSize: '0.75rem',
            fontFamily: 'inherit',
            fontWeight: 500,
            transition: 'all 140ms ease',
            flexShrink: 0,
          }}
        >
          + Add
        </button>
      </div>

      {/* Category filter */}
      <div
        style={{
          padding: '10px 28px',
          borderBottom: '1px solid var(--border-structural)',
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
          flexShrink: 0,
        }}
      >
        {(['all', ...CATEGORIES] as const).map((cat) => {
          const count = cat === 'all' ? doctrine.length : doctrine.filter((d) => d.category === cat).length;
          return (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              style={{
                background: filter === cat ? (cat === 'all' ? 'rgba(88,28,135,0.2)' : `${CATEGORY_COLORS[cat as PersonalDoctrine['category']].replace('0.75', '0.12').replace('0.7', '0.1')}`) : 'transparent',
                border: `1px solid ${filter === cat ? (cat === 'all' ? 'rgba(88,28,135,0.4)' : CATEGORY_COLORS[cat as PersonalDoctrine['category']]) : 'rgba(88,28,135,0.12)'}`,
                borderRadius: 20,
                padding: '4px 10px',
                color: filter === cat ? (cat === 'all' ? 'rgba(167,139,250,0.8)' : CATEGORY_COLORS[cat as PersonalDoctrine['category']]) : 'rgba(226,232,240,0.28)',
                cursor: 'pointer',
                fontSize: '0.68rem',
                fontFamily: 'inherit',
                fontWeight: filter === cat ? 600 : 400,
                letterSpacing: '0.04em',
                transition: 'all 140ms ease',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              {cat === 'all' ? 'All' : cat}
              {count > 0 && (
                <span style={{ opacity: 0.6, fontSize: '0.6rem' }}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
        {isAdding && (
          <div
            style={{
              background: 'rgba(15,10,30,0.6)',
              border: '1px solid rgba(88,28,135,0.3)',
              borderRadius: 10,
              padding: '18px 18px',
              marginBottom: 20,
              animation: 'atlas-fade-in 200ms ease both',
            }}
          >
            <div style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.1em', color: 'rgba(201,162,39,0.6)', textTransform: 'uppercase', marginBottom: 14 }}>
              New Doctrine Entry
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Title */}
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Principle title"
                autoFocus
                style={{
                  background: 'rgba(5,5,8,0.5)',
                  border: '1px solid rgba(88,28,135,0.2)',
                  borderRadius: 6,
                  padding: '10px 12px',
                  color: 'rgba(226,232,240,0.9)',
                  fontSize: '0.875rem',
                  fontFamily: 'inherit',
                  fontWeight: 500,
                  outline: 'none',
                }}
              />

              {/* Category + Refinement vector row */}
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.6rem', color: 'rgba(226,232,240,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>Category</div>
                  <select
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as PersonalDoctrine['category'] }))}
                    style={{
                      width: '100%',
                      background: 'rgba(5,5,8,0.5)',
                      border: '1px solid rgba(88,28,135,0.2)',
                      borderRadius: 6,
                      padding: '8px 10px',
                      color: 'rgba(226,232,240,0.8)',
                      fontSize: '0.8rem',
                      fontFamily: 'inherit',
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.6rem', color: 'rgba(226,232,240,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>Refinement Vector</div>
                  <select
                    value={form.refinementVector ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, refinementVector: (e.target.value as PersonalDoctrine['refinementVector']) || undefined }))}
                    style={{
                      width: '100%',
                      background: 'rgba(5,5,8,0.5)',
                      border: '1px solid rgba(88,28,135,0.2)',
                      borderRadius: 6,
                      padding: '8px 10px',
                      color: 'rgba(226,232,240,0.8)',
                      fontSize: '0.8rem',
                      fontFamily: 'inherit',
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="">None</option>
                    {REFINEMENT_VECTORS.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Content */}
              <textarea
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                placeholder="State the principle clearly. Be precise. This will guide Atlas's responses."
                rows={4}
                style={{
                  background: 'rgba(5,5,8,0.5)',
                  border: '1px solid rgba(88,28,135,0.2)',
                  borderRadius: 6,
                  padding: '10px 12px',
                  color: 'rgba(226,232,240,0.82)',
                  fontSize: '0.85rem',
                  lineHeight: 1.7,
                  fontFamily: 'inherit',
                  outline: 'none',
                  resize: 'vertical',
                }}
              />

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setIsAdding(false)}
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(88,28,135,0.2)',
                    borderRadius: 5,
                    padding: '7px 14px',
                    color: 'rgba(226,232,240,0.35)',
                    cursor: 'pointer',
                    fontSize: '0.78rem',
                    fontFamily: 'inherit',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleAdd()}
                  disabled={!form.title.trim() || !form.content.trim()}
                  style={{
                    background: 'rgba(88,28,135,0.25)',
                    border: '1px solid rgba(88,28,135,0.4)',
                    borderRadius: 5,
                    padding: '7px 16px',
                    color: 'rgba(167,139,250,0.85)',
                    cursor: 'pointer',
                    fontSize: '0.78rem',
                    fontFamily: 'inherit',
                    fontWeight: 500,
                  }}
                >
                  Save Principle
                </button>
              </div>
            </div>
          </div>
        )}

        {filtered.length === 0 && !isAdding ? (
          <div
            style={{
              textAlign: 'center',
              padding: '60px 20px',
              color: 'rgba(226,232,240,0.2)',
              animation: 'atlas-fade-in 300ms ease both',
            }}
          >
            <div style={{ fontSize: '0.875rem', marginBottom: 8 }}>
              {filter === 'all' ? 'No doctrine defined yet.' : `No ${filter} entries.`}
            </div>
            <div style={{ fontSize: '0.75rem', lineHeight: 1.7, maxWidth: 360, margin: '0 auto' }}>
              Doctrine is the set of principles Atlas uses to calibrate advice, challenge assumptions, and evaluate decisions. The more explicit your doctrine, the sharper Atlas becomes.
            </div>
          </div>
        ) : (
          <div>
            {filter === 'all'
              ? CATEGORIES.filter((cat) => grouped[cat].length > 0).map((cat) => (
                  <div key={cat} style={{ marginBottom: 24 }}>
                    <div
                      style={{
                        fontSize: '0.6rem',
                        fontWeight: 700,
                        letterSpacing: '0.12em',
                        color: CATEGORY_COLORS[cat],
                        textTransform: 'uppercase',
                        marginBottom: 10,
                        paddingBottom: 6,
                        borderBottom: `1px solid ${CATEGORY_COLORS[cat].replace('0.75', '0.1').replace('0.7', '0.08')}`,
                      }}
                    >
                      {cat} · {grouped[cat].length}
                    </div>
                    {grouped[cat].map((item) => (
                      <DoctrineCard key={item.id} item={item} onDelete={() => void removeDoctrineItem(item.id)} />
                    ))}
                  </div>
                ))
              : filtered.map((item) => (
                  <DoctrineCard key={item.id} item={item} onDelete={() => void removeDoctrineItem(item.id)} />
                ))}
          </div>
        )}
      </div>
    </div>
  );
}
