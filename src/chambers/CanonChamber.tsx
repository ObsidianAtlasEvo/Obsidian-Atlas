import React, { useState } from 'react';
import { useAtlasStore } from '../store/useAtlasStore';
import { generateId, nowISO } from '../lib/persistence';

interface CanonItem {
  id: string;
  title: string;
  author: string;
  type: 'text' | 'framework' | 'thinker' | 'idea';
  status: 'canon' | 'anti-canon';
  significance: string;
  flaws?: string[];
  resonanceScore: number;
  tags: string[];
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

const TYPE_COLORS: Record<CanonItem['type'], string> = {
  text: T.indigo,
  framework: T.teal,
  thinker: T.violet,
  idea: T.amber,
};

const TYPE_LABELS: Record<CanonItem['type'], string> = {
  text: 'Text',
  framework: 'Framework',
  thinker: 'Thinker',
  idea: 'Idea',
};

const EMPTY_FORM = {
  title: '',
  author: '',
  type: 'text' as CanonItem['type'],
  status: 'canon' as CanonItem['status'],
  significance: '',
  resonanceScore: 0.5,
  tagsRaw: '',
  flawsRaw: '',
};

// ─── Sub-components ──────────────────────────────────────────────

function TypeBadge({ type }: { type: CanonItem['type'] }) {
  return (
    <span
      style={{
        ...labelStyle,
        color: TYPE_COLORS[type],
        background: `${TYPE_COLORS[type].replace('0.7', '0.08').replace('0.85', '0.08')}`,
        border: `1px solid ${TYPE_COLORS[type].replace('0.7', '0.2').replace('0.85', '0.2')}`,
        borderRadius: 4,
        padding: '2px 7px',
        display: 'inline-block',
      }}
    >
      {TYPE_LABELS[type]}
    </span>
  );
}

function ResonanceBar({ score, accent }: { score: number; accent: string }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ ...labelStyle, color: T.dim }}>Resonance</span>
        <span style={{ ...labelStyle, color: accent }}>{Math.round(score * 100)}%</span>
      </div>
      <div
        style={{
          height: 4,
          borderRadius: 2,
          background: T.inset,
          overflow: 'hidden',
          border: `1px solid ${T.borderSubtle}`,
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${score * 100}%`,
            background: `linear-gradient(90deg, ${accent.replace('0.9', '0.5')}, ${accent})`,
            borderRadius: 2,
            transition: 'width 0.3s ease',
          }}
        />
      </div>
    </div>
  );
}

function CanonItemCard({
  item,
  accent,
}: {
  item: CanonItem;
  accent: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={{
        background: T.panel,
        border: `1px solid ${item.status === 'canon' ? 'rgba(201,162,39,0.18)' : 'rgba(239,68,68,0.18)'}`,
        borderRadius: 8,
        padding: '14px 16px',
        marginBottom: 10,
        animation: 'atlas-fade-in 300ms ease both',
        cursor: 'pointer',
      }}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ color: T.body, fontWeight: 700, fontSize: '0.92rem' }}>{item.title}</span>
            <TypeBadge type={item.type} />
          </div>
          <div style={{ color: T.muted, fontSize: '0.78rem', marginTop: 2 }}>{item.author}</div>
        </div>
        <span style={{ color: T.dim, fontSize: '0.72rem', marginTop: 2, flexShrink: 0 }}>
          {expanded ? '▲' : '▼'}
        </span>
      </div>

      {/* Tags */}
      {item.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
          {item.tags.map((tag) => (
            <span
              key={tag}
              style={{
                ...labelStyle,
                color: T.dim,
                background: T.inset,
                border: `1px solid ${T.border}`,
                borderRadius: 4,
                padding: '2px 6px',
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Resonance bar always visible */}
      <ResonanceBar score={item.resonanceScore} accent={accent} />

      {/* Expanded content */}
      {expanded && (
        <div style={{ marginTop: 12, borderTop: `1px solid ${T.borderSubtle}`, paddingTop: 12 }}>
          <div style={{ ...labelStyle, color: T.dim, marginBottom: 4 }}>Significance</div>
          <p style={{ color: T.muted, fontSize: '0.82rem', lineHeight: 1.55, margin: 0 }}>{item.significance}</p>

          {item.status === 'anti-canon' && item.flaws && item.flaws.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ ...labelStyle, color: T.danger, marginBottom: 6 }}>Flaws</div>
              <ul style={{ margin: 0, paddingLeft: 16, listStyle: 'none' }}>
                {item.flaws.map((flaw, i) => (
                  <li
                    key={i}
                    style={{
                      color: T.danger,
                      fontSize: '0.8rem',
                      lineHeight: 1.5,
                      marginBottom: 4,
                      paddingLeft: 12,
                      position: 'relative',
                    }}
                  >
                    <span style={{ position: 'absolute', left: 0, top: 0 }}>–</span>
                    {flaw}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AddItemForm({
  onAdd,
  onCancel,
}: {
  onAdd: (item: CanonItem) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: T.inset,
    border: `1px solid ${T.border}`,
    borderRadius: 6,
    color: T.body,
    fontSize: '0.85rem',
    padding: '8px 10px',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelBlock: React.CSSProperties = {
    ...labelStyle,
    color: T.muted,
    display: 'block',
    marginBottom: 4,
    marginTop: 12,
  };

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.author.trim()) return;
    const tags = form.tagsRaw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const flaws = form.flawsRaw
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean);
    onAdd({
      id: generateId(),
      title: form.title.trim(),
      author: form.author.trim(),
      type: form.type,
      status: form.status,
      significance: form.significance.trim(),
      resonanceScore: form.resonanceScore,
      tags,
      flaws: flaws.length > 0 ? flaws : undefined,
    });
    setForm(EMPTY_FORM);
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: T.panel,
        border: `1px solid ${T.border}`,
        borderRadius: 8,
        padding: 16,
        marginBottom: 16,
        animation: 'atlas-fade-in 300ms ease both',
      }}
    >
      <div style={{ ...labelStyle, color: T.gold, marginBottom: 12, fontSize: '0.7rem' }}>
        Add Canon Item
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={labelBlock}>Title</label>
          <input
            style={inputStyle}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Title..."
            required
          />
        </div>
        <div>
          <label style={labelBlock}>Author</label>
          <input
            style={inputStyle}
            value={form.author}
            onChange={(e) => setForm({ ...form, author: e.target.value })}
            placeholder="Author..."
            required
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={labelBlock}>Type</label>
          <select
            style={{ ...inputStyle, cursor: 'pointer' }}
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value as CanonItem['type'] })}
          >
            <option value="text">Text</option>
            <option value="framework">Framework</option>
            <option value="thinker">Thinker</option>
            <option value="idea">Idea</option>
          </select>
        </div>
        <div>
          <label style={labelBlock}>Status</label>
          <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
            {(['canon', 'anti-canon'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setForm({ ...form, status: s })}
                style={{
                  flex: 1,
                  padding: '7px 0',
                  borderRadius: 5,
                  border: `1px solid ${
                    form.status === s
                      ? s === 'canon'
                        ? 'rgba(201,162,39,0.4)'
                        : 'rgba(239,68,68,0.4)'
                      : T.border
                  }`,
                  background:
                    form.status === s
                      ? s === 'canon'
                        ? 'rgba(201,162,39,0.12)'
                        : 'rgba(239,68,68,0.12)'
                      : T.inset,
                  color:
                    form.status === s
                      ? s === 'canon'
                        ? T.gold
                        : T.danger
                      : T.muted,
                  ...labelStyle,
                  cursor: 'pointer',
                }}
              >
                {s === 'canon' ? 'Canon' : 'Anti-Canon'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <label style={labelBlock}>Significance</label>
      <textarea
        style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }}
        value={form.significance}
        onChange={(e) => setForm({ ...form, significance: e.target.value })}
        placeholder="Why this matters..."
      />

      <label style={labelBlock}>
        Resonance Score: {Math.round(form.resonanceScore * 100)}%
      </label>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={form.resonanceScore}
        onChange={(e) => setForm({ ...form, resonanceScore: parseFloat(e.target.value) })}
        style={{ width: '100%', accentColor: T.gold }}
      />

      <label style={labelBlock}>Tags (comma-separated)</label>
      <input
        style={inputStyle}
        value={form.tagsRaw}
        onChange={(e) => setForm({ ...form, tagsRaw: e.target.value })}
        placeholder="epistemology, systems, philosophy..."
      />

      {form.status === 'anti-canon' && (
        <>
          <label style={labelBlock}>Flaws (one per line)</label>
          <textarea
            style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
            value={form.flawsRaw}
            onChange={(e) => setForm({ ...form, flawsRaw: e.target.value })}
            placeholder="List critical flaws..."
          />
        </>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button
          type="submit"
          style={{
            flex: 1,
            padding: '8px 0',
            borderRadius: 5,
            border: '1px solid rgba(201,162,39,0.35)',
            background: 'rgba(201,162,39,0.12)',
            color: T.gold,
            ...labelStyle,
            cursor: 'pointer',
          }}
        >
          Add Item
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: '8px 16px',
            borderRadius: 5,
            border: `1px solid ${T.border}`,
            background: T.inset,
            color: T.muted,
            ...labelStyle,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Main component ───────────────────────────────────────────────
export default function CanonChamber() {
  const canonStore = useAtlasStore((s) => (s as any).canon) as { items: CanonItem[] } | undefined;
  const [localItems, setLocalItems] = useState<CanonItem[]>(canonStore?.items ?? []);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<CanonItem['type'] | 'all'>('all');
  const [showForm, setShowForm] = useState(false);

  const types: Array<CanonItem['type'] | 'all'> = ['all', 'text', 'framework', 'thinker', 'idea'];

  function filterItems(status: CanonItem['status']) {
    return localItems.filter((item) => {
      if (item.status !== status) return false;
      if (typeFilter !== 'all' && item.type !== typeFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          item.title.toLowerCase().includes(q) ||
          item.author.toLowerCase().includes(q) ||
          item.significance.toLowerCase().includes(q) ||
          item.tags.some((t) => t.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }

  const canonItems = filterItems('canon');
  const antiCanonItems = filterItems('anti-canon');

  function handleAdd(item: CanonItem) {
    setLocalItems((prev) => [item, ...prev]);
    setShowForm(false);
  }

  const inputStyle: React.CSSProperties = {
    background: 'rgba(5,5,8,0.72)',
    border: '1px solid rgba(88,28,135,0.14)',
    borderRadius: 6,
    color: T.body,
    fontSize: '0.85rem',
    padding: '8px 12px',
    outline: 'none',
  };

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
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ color: T.gold, fontWeight: 700, fontSize: '1.15rem', margin: 0 }}>
              Canon Chamber
            </h2>
            <p style={{ color: T.muted, fontSize: '0.8rem', margin: '3px 0 0' }}>
              Curate the intellectual canon — texts, frameworks, thinkers, ideas worth internalizing or critiquing.
            </p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            style={{
              padding: '7px 16px',
              borderRadius: 6,
              border: '1px solid rgba(201,162,39,0.35)',
              background: showForm ? 'rgba(201,162,39,0.18)' : 'rgba(201,162,39,0.08)',
              color: T.gold,
              ...labelStyle,
              cursor: 'pointer',
            }}
          >
            {showForm ? '✕ Cancel' : '+ Add Item'}
          </button>
        </div>

        {/* Search & filter bar */}
        <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            style={{ ...inputStyle, flex: '1 1 200px', minWidth: 0 }}
            placeholder="Search items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 4 }}>
            {types.map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                style={{
                  ...labelStyle,
                  padding: '5px 10px',
                  borderRadius: 4,
                  border: `1px solid ${typeFilter === t ? 'rgba(88,28,135,0.4)' : T.border}`,
                  background: typeFilter === t ? 'rgba(88,28,135,0.15)' : T.inset,
                  color: typeFilter === t ? T.violet : T.muted,
                  cursor: 'pointer',
                }}
              >
                {t === 'all' ? 'All' : TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <AddItemForm onAdd={handleAdd} onCancel={() => setShowForm(false)} />
      )}

      {/* Split view */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Canon side */}
        <div>
          <div
            style={{
              ...labelStyle,
              color: T.gold,
              marginBottom: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: T.gold,
              }}
            />
            Canon
            <span
              style={{
                marginLeft: 'auto',
                background: 'rgba(201,162,39,0.1)',
                border: '1px solid rgba(201,162,39,0.2)',
                borderRadius: 10,
                padding: '1px 8px',
                color: T.gold,
              }}
            >
              {canonItems.length}
            </span>
          </div>

          {canonItems.length === 0 ? (
            <div
              style={{
                background: T.panel,
                border: `1px dashed ${T.border}`,
                borderRadius: 8,
                padding: 24,
                textAlign: 'center',
                color: T.dim,
                fontSize: '0.82rem',
              }}
            >
              No canon items yet. Add foundational texts, thinkers, and ideas.
            </div>
          ) : (
            canonItems.map((item) => (
              <CanonItemCard key={item.id} item={item} accent={T.gold} />
            ))
          )}
        </div>

        {/* Anti-Canon side */}
        <div>
          <div
            style={{
              ...labelStyle,
              color: T.danger,
              marginBottom: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: T.danger,
              }}
            />
            Anti-Canon
            <span
              style={{
                marginLeft: 'auto',
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 10,
                padding: '1px 8px',
                color: T.danger,
              }}
            >
              {antiCanonItems.length}
            </span>
          </div>

          {antiCanonItems.length === 0 ? (
            <div
              style={{
                background: T.panel,
                border: `1px dashed ${T.border}`,
                borderRadius: 8,
                padding: 24,
                textAlign: 'center',
                color: T.dim,
                fontSize: '0.82rem',
              }}
            >
              No anti-canon items. Track ideas worth understanding but critiquing.
            </div>
          ) : (
            antiCanonItems.map((item) => (
              <CanonItemCard key={item.id} item={item} accent={T.danger} />
            ))
          )}
        </div>
      </div>

      {/* Summary stats */}
      <div
        style={{
          marginTop: 24,
          padding: '12px 16px',
          background: T.panel,
          border: `1px solid ${T.border}`,
          borderRadius: 8,
          display: 'flex',
          gap: 24,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ ...labelStyle, color: T.dim }}>Total Items</div>
          <div style={{ color: T.body, fontWeight: 700, fontSize: '1.1rem', marginTop: 2 }}>
            {localItems.length}
          </div>
        </div>
        {(['text', 'framework', 'thinker', 'idea'] as const).map((type) => (
          <div key={type}>
            <div style={{ ...labelStyle, color: T.dim }}>{TYPE_LABELS[type]}s</div>
            <div style={{ color: TYPE_COLORS[type], fontWeight: 700, fontSize: '1.1rem', marginTop: 2 }}>
              {localItems.filter((i) => i.type === type).length}
            </div>
          </div>
        ))}
        <div>
          <div style={{ ...labelStyle, color: T.dim }}>Avg Resonance</div>
          <div style={{ color: T.gold, fontWeight: 700, fontSize: '1.1rem', marginTop: 2 }}>
            {localItems.length > 0
              ? Math.round((localItems.reduce((sum, i) => sum + i.resonanceScore, 0) / localItems.length) * 100) + '%'
              : '—'}
          </div>
        </div>
      </div>
    </div>
  );
}
