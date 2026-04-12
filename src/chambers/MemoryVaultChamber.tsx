import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useAtlasStore } from '../store/useAtlasStore';
import { nowISO } from '../lib/persistence';
import type { MemoryEntry } from '@/types';
import { atlasApiUrl } from '../lib/atlasApi';
import { atlasTraceUserId } from '../lib/atlasTraceContext';

// ─── Design Tokens ────────────────────────────────────────────────────────────
const TOKEN = {
  bg:          '#050505',
  panel:       'rgba(15,10,30,0.55)',
  inset:       'rgba(5,5,8,0.72)',
  border:      'rgba(88,28,135,0.14)',
  borderSubtle:'rgba(88,28,135,0.10)',
  text:        'rgba(226,232,240,0.92)',
  muted:       'rgba(226,232,240,0.55)',
  dim:         'rgba(226,232,240,0.30)',
  gold:        'rgba(201,162,39,0.9)',
  violet:      'rgba(167,139,250,0.85)',
  danger:      'rgba(239,68,68,0.75)',
  dangerHover: 'rgba(239,68,68,0.95)',
  font:        "'Inter', sans-serif",
  fadeIn:      'atlas-fade-in 300ms ease both',
} as const;

const LAYER_META: Record<MemoryEntry['layer'], {
  label: string;
  color: string;
  colorFaint: string;
  description: string;
}> = {
  transient: {
    label:       'Transient',
    color:       'rgba(234,179,8,0.7)',
    colorFaint:  'rgba(234,179,8,0.12)',
    description: 'Short-term, ephemeral. Decays naturally.',
  },
  working: {
    label:       'Working',
    color:       'rgba(99,102,241,0.7)',
    colorFaint:  'rgba(99,102,241,0.12)',
    description: 'Active context. Project-specific knowledge.',
  },
  sovereign: {
    label:       'Sovereign',
    color:       'rgba(34,197,94,0.7)',
    colorFaint:  'rgba(34,197,94,0.12)',
    description: 'Core identity. Long-term beliefs and truths.',
  },
};

const LAYER_ORDER: MemoryEntry['layer'][] = ['transient', 'working', 'sovereign'];

type SqliteVaultRow = {
  id: string;
  content: string;
  type?: string;
  confidence?: number;
  createdAt?: string;
  origin?: string | null;
  sourceTraceId?: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
}

function parseTags(raw: string): string[] {
  return raw.split(',').map(t => t.trim()).filter(Boolean);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ImportanceBarProps {
  value: number;  // 0–1
  color: string;
}
const ImportanceBar: React.FC<ImportanceBarProps> = ({ value, color }) => (
  <div
    style={{
      height: 3,
      borderRadius: 2,
      background: TOKEN.inset,
      overflow: 'hidden',
      marginTop: 6,
    }}
  >
    <div
      style={{
        height: '100%',
        width: `${Math.min(Math.max(value, 0), 1) * 100}%`,
        background: `linear-gradient(90deg, ${color}, ${color.replace('0.7)', '0.95)')})`,
        borderRadius: 2,
        transition: 'width 0.3s ease',
      }}
    />
  </div>
);

interface TagBadgeProps {
  tag: string;
  color: string;
}
const TagBadge: React.FC<TagBadgeProps> = ({ tag, color }) => (
  <span
    style={{
      display: 'inline-block',
      padding: '1px 7px',
      borderRadius: 4,
      background: color,
      border: `1px solid ${color.replace(/[\d.]+\)$/, '0.4)')}`,
      color: TOKEN.text,
      fontSize: '0.62rem',
      fontWeight: 500,
      letterSpacing: '0.04em',
      lineHeight: 1.7,
    }}
  >
    {tag}
  </span>
);

interface MemoryCardProps {
  entry: MemoryEntry;
  onPromote: (id: string, to: MemoryEntry['layer']) => void;
  onRemove: (id: string) => void;
}
const MemoryCard: React.FC<MemoryCardProps> = ({ entry, onPromote, onRemove }) => {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const meta = LAYER_META[entry.layer];
  const layerIdx = LAYER_ORDER.indexOf(entry.layer);

  const canPromote = layerIdx < LAYER_ORDER.length - 1;
  const canDemote  = layerIdx > 0;

  const contentPreview = entry.content.length > 160 && !expanded
    ? entry.content.slice(0, 160) + '…'
    : entry.content;

  return (
    <div
      style={{
        background: TOKEN.inset,
        border: `1px solid ${TOKEN.border}`,
        borderRadius: 10,
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        animation: TOKEN.fadeIn,
        transition: 'border-color 0.2s',
        fontFamily: TOKEN.font,
      }}
      onMouseEnter={e => ((e.currentTarget as HTMLDivElement).style.borderColor = meta.color.replace('0.7)', '0.35)'))}
      onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.borderColor = TOKEN.border)}
    >
      {/* Top row: content + delete */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <p
          style={{
            flex: 1,
            margin: 0,
            fontSize: '0.82rem',
            lineHeight: 1.55,
            color: TOKEN.text,
            cursor: entry.content.length > 160 ? 'pointer' : 'default',
            wordBreak: 'break-word',
          }}
          onClick={() => entry.content.length > 160 && setExpanded(e => !e)}
        >
          {contentPreview}
          {entry.content.length > 160 && (
            <span style={{ color: TOKEN.violet, fontSize: '0.75rem', marginLeft: 4 }}>
              {expanded ? 'less' : 'more'}
            </span>
          )}
        </p>
        <button
          title="Remove entry"
          onClick={() => {
            if (confirmDelete) {
              onRemove(entry.id);
            } else {
              setConfirmDelete(true);
              setTimeout(() => setConfirmDelete(false), 2500);
            }
          }}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: confirmDelete ? TOKEN.dangerHover : TOKEN.dim,
            fontSize: confirmDelete ? '0.7rem' : '0.9rem',
            fontWeight: 600,
            padding: '2px 4px',
            lineHeight: 1,
            borderRadius: 4,
            transition: 'color 0.2s',
            flexShrink: 0,
            letterSpacing: confirmDelete ? '0.02em' : undefined,
          }}
        >
          {confirmDelete ? 'confirm?' : '×'}
        </button>
      </div>

      {/* Importance bar */}
      <ImportanceBar value={entry.importance} color={meta.color} />

      {/* Meta row */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '4px 8px',
          marginTop: 8,
          alignItems: 'center',
        }}
      >
        {entry.tags.map(tag => (
          <TagBadge key={tag} tag={tag} color={meta.colorFaint} />
        ))}
      </div>

      {/* Footer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 8,
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: '0.65rem', color: TOKEN.dim }}>
            {relativeTime(entry.timestamp)}
            {entry.lastAccessed && entry.lastAccessed !== entry.timestamp && (
              <span style={{ marginLeft: 6 }}>· accessed {relativeTime(entry.lastAccessed)}</span>
            )}
          </span>
          {entry.source && (
            <span style={{ fontSize: '0.63rem', color: TOKEN.muted }}>
              ↳ {entry.source}
            </span>
          )}
        </div>

        {/* Promote/Demote arrows */}
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {canDemote && (
            <button
              title={`Demote to ${LAYER_META[LAYER_ORDER[layerIdx - 1]].label}`}
              onClick={() => onPromote(entry.id, LAYER_ORDER[layerIdx - 1])}
              style={{
                background: 'none',
                border: `1px solid ${TOKEN.borderSubtle}`,
                cursor: 'pointer',
                color: TOKEN.muted,
                fontSize: '0.7rem',
                padding: '2px 7px',
                borderRadius: 5,
                lineHeight: 1.4,
                transition: 'color 0.15s, border-color 0.15s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.color = TOKEN.text;
                (e.currentTarget as HTMLButtonElement).style.borderColor = TOKEN.border;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.color = TOKEN.muted;
                (e.currentTarget as HTMLButtonElement).style.borderColor = TOKEN.borderSubtle;
              }}
            >
              ↓
            </button>
          )}
          {canPromote && (
            <button
              title={`Promote to ${LAYER_META[LAYER_ORDER[layerIdx + 1]].label}`}
              onClick={() => onPromote(entry.id, LAYER_ORDER[layerIdx + 1])}
              style={{
                background: 'none',
                border: `1px solid ${TOKEN.borderSubtle}`,
                cursor: 'pointer',
                color: meta.color,
                fontSize: '0.7rem',
                padding: '2px 7px',
                borderRadius: 5,
                lineHeight: 1.4,
                transition: 'color 0.15s, border-color 0.15s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.color = TOKEN.text;
                (e.currentTarget as HTMLButtonElement).style.borderColor = meta.color;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.color = meta.color;
                (e.currentTarget as HTMLButtonElement).style.borderColor = TOKEN.borderSubtle;
              }}
            >
              ↑
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

interface LayerColumnProps {
  layer: MemoryEntry['layer'];
  entries: MemoryEntry[];
  onPromote: (id: string, to: MemoryEntry['layer']) => void;
  onRemove: (id: string) => void;
}
const LayerColumn: React.FC<LayerColumnProps> = ({ layer, entries, onPromote, onRemove }) => {
  const meta = LAYER_META[layer];

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        background: TOKEN.panel,
        border: `1px solid ${TOKEN.border}`,
        borderRadius: 14,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: TOKEN.fadeIn,
      }}
    >
      {/* Column Header */}
      <div
        style={{
          padding: '14px 16px 12px',
          borderBottom: `1px solid ${TOKEN.borderSubtle}`,
          background: `linear-gradient(180deg, ${meta.colorFaint} 0%, transparent 100%)`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <span
            style={{
              fontSize: '0.62rem',
              fontWeight: 600,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: meta.color,
              fontFamily: TOKEN.font,
            }}
          >
            {meta.label}
          </span>
          <span
            style={{
              fontSize: '0.7rem',
              fontWeight: 600,
              color: meta.color,
              background: meta.colorFaint,
              padding: '1px 8px',
              borderRadius: 20,
              fontFamily: TOKEN.font,
            }}
          >
            {entries.length}
          </span>
        </div>
        <p
          style={{
            margin: 0,
            fontSize: '0.72rem',
            color: TOKEN.muted,
            lineHeight: 1.45,
            fontFamily: TOKEN.font,
          }}
        >
          {meta.description}
        </p>
      </div>

      {/* Entry List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          scrollbarWidth: 'thin',
          scrollbarColor: `${TOKEN.border} transparent`,
        }}
      >
        {entries.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '32px 16px',
              gap: 8,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                border: `1px dashed ${meta.color}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: meta.color,
                fontSize: '1rem',
                opacity: 0.5,
              }}
            >
              ∅
            </div>
            <span style={{ fontSize: '0.73rem', color: TOKEN.dim, fontFamily: TOKEN.font }}>
              No {meta.label.toLowerCase()} memories
            </span>
          </div>
        ) : (
          entries.map(entry => (
            <MemoryCard
              key={entry.id}
              entry={entry}
              onPromote={onPromote}
              onRemove={onRemove}
            />
          ))
        )}
      </div>
    </div>
  );
};

// ─── Add Memory Form ──────────────────────────────────────────────────────────
interface AddMemoryFormProps {
  onAdd: (entry: Omit<MemoryEntry, 'id'>) => void;
  onClose: () => void;
}
const AddMemoryForm: React.FC<AddMemoryFormProps> = ({ onAdd, onClose }) => {
  const [content, setContent]       = useState('');
  const [layer, setLayer]           = useState<MemoryEntry['layer']>('working');
  const [importance, setImportance] = useState(0.5);
  const [tagsRaw, setTagsRaw]       = useState('');
  const [source, setSource]         = useState('');
  const [error, setError]           = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      setError('Content is required.');
      return;
    }
    onAdd({
      content:     content.trim(),
      layer,
      importance,
      tags:        parseTags(tagsRaw),
      source:      source.trim() || undefined,
      timestamp:   nowISO(),
      lastAccessed: nowISO(),
    });
    onClose();
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '0.62rem',
    fontWeight: 600,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: TOKEN.muted,
    fontFamily: TOKEN.font,
    display: 'block',
    marginBottom: 5,
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: TOKEN.inset,
    border: `1px solid ${TOKEN.border}`,
    borderRadius: 7,
    color: TOKEN.text,
    fontSize: '0.82rem',
    fontFamily: TOKEN.font,
    padding: '8px 10px',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: TOKEN.panel,
        border: `1px solid ${TOKEN.border}`,
        borderRadius: 14,
        padding: '20px 20px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        animation: TOKEN.fadeIn,
        fontFamily: TOKEN.font,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{
            fontSize: '0.62rem',
            fontWeight: 600,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: TOKEN.gold,
          }}
        >
          Add Memory Entry
        </span>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: TOKEN.dim,
            fontSize: '1rem',
            cursor: 'pointer',
            padding: 2,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>

      {/* Content */}
      <div>
        <label style={labelStyle}>Content</label>
        <textarea
          value={content}
          onChange={e => { setContent(e.target.value); setError(''); }}
          placeholder="Describe the memory…"
          rows={4}
          style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
          onFocus={e => (e.target.style.borderColor = TOKEN.violet)}
          onBlur={e => (e.target.style.borderColor = TOKEN.border)}
        />
        {error && (
          <span style={{ fontSize: '0.72rem', color: TOKEN.danger, marginTop: 4, display: 'block' }}>
            {error}
          </span>
        )}
      </div>

      {/* Layer + Importance row */}
      <div style={{ display: 'flex', gap: 14 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Layer</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {LAYER_ORDER.map(l => {
              const m = LAYER_META[l];
              const selected = layer === l;
              return (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLayer(l)}
                  style={{
                    flex: 1,
                    padding: '6px 4px',
                    borderRadius: 7,
                    border: `1px solid ${selected ? m.color : TOKEN.borderSubtle}`,
                    background: selected ? m.colorFaint : 'transparent',
                    color: selected ? m.color : TOKEN.muted,
                    fontSize: '0.67rem',
                    fontWeight: 600,
                    letterSpacing: '0.05em',
                    cursor: 'pointer',
                    fontFamily: TOKEN.font,
                    transition: 'all 0.15s',
                  }}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Importance */}
      <div>
        <label style={labelStyle}>
          Importance —{' '}
          <span style={{ color: LAYER_META[layer].color }}>
            {importance.toFixed(2)}
          </span>
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '0.65rem', color: TOKEN.dim }}>0</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={importance}
            onChange={e => setImportance(parseFloat(e.target.value))}
            style={{ flex: 1, accentColor: LAYER_META[layer].color, cursor: 'pointer' }}
          />
          <span style={{ fontSize: '0.65rem', color: TOKEN.dim }}>1</span>
        </div>
        <ImportanceBar value={importance} color={LAYER_META[layer].color} />
      </div>

      {/* Tags + Source row */}
      <div style={{ display: 'flex', gap: 14 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Tags (comma-separated)</label>
          <input
            type="text"
            value={tagsRaw}
            onChange={e => setTagsRaw(e.target.value)}
            placeholder="identity, belief, project…"
            style={inputStyle}
            onFocus={e => (e.target.style.borderColor = TOKEN.violet)}
            onBlur={e => (e.target.style.borderColor = TOKEN.border)}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Source (optional)</label>
          <input
            type="text"
            value={source}
            onChange={e => setSource(e.target.value)}
            placeholder="conversation, inference…"
            style={inputStyle}
            onFocus={e => (e.target.style.borderColor = TOKEN.violet)}
            onBlur={e => (e.target.style.borderColor = TOKEN.border)}
          />
        </div>
      </div>

      {/* Submit */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'none',
            border: `1px solid ${TOKEN.borderSubtle}`,
            borderRadius: 7,
            color: TOKEN.muted,
            fontSize: '0.78rem',
            padding: '7px 16px',
            cursor: 'pointer',
            fontFamily: TOKEN.font,
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = TOKEN.border)}
          onMouseLeave={e => (e.currentTarget.style.borderColor = TOKEN.borderSubtle)}
        >
          Cancel
        </button>
        <button
          type="submit"
          style={{
            background: TOKEN.gold,
            border: 'none',
            borderRadius: 7,
            color: '#0a0805',
            fontSize: '0.78rem',
            fontWeight: 700,
            padding: '7px 20px',
            cursor: 'pointer',
            fontFamily: TOKEN.font,
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          Add Memory
        </button>
      </div>
    </form>
  );
};

// ─── Stats Bar ────────────────────────────────────────────────────────────────
interface StatsBarProps {
  transientCount: number;
  workingCount:   number;
  sovereignCount: number;
  totalCount:     number;
  onAddClick:     () => void;
  showForm:       boolean;
}
const StatsBar: React.FC<StatsBarProps> = ({
  transientCount, workingCount, sovereignCount, totalCount,
  onAddClick, showForm,
}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 10,
      background: TOKEN.panel,
      border: `1px solid ${TOKEN.border}`,
      borderRadius: 12,
      padding: '12px 18px',
      animation: TOKEN.fadeIn,
      fontFamily: TOKEN.font,
    }}
  >
    {/* Layer stats */}
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={{ fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: TOKEN.dim }}>
          Total
        </span>
        <span style={{ fontSize: '1.15rem', fontWeight: 700, color: TOKEN.gold, lineHeight: 1.1 }}>
          {totalCount}
        </span>
      </div>
      <div style={{ width: 1, height: 28, background: TOKEN.borderSubtle }} />
      {LAYER_ORDER.map(layer => {
        const meta = LAYER_META[layer];
        const count = layer === 'transient' ? transientCount
                    : layer === 'working'   ? workingCount
                    : sovereignCount;
        return (
          <div key={layer} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span
              style={{
                fontSize: '0.62rem',
                fontWeight: 600,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: meta.color,
              }}
            >
              {meta.label}
            </span>
            <span style={{ fontSize: '1.05rem', fontWeight: 600, color: TOKEN.text, lineHeight: 1.1 }}>
              {count}
            </span>
          </div>
        );
      })}
    </div>

    {/* Add button */}
    <button
      onClick={onAddClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: showForm ? TOKEN.inset : TOKEN.gold,
        border: showForm ? `1px solid ${TOKEN.border}` : 'none',
        borderRadius: 8,
        color: showForm ? TOKEN.muted : '#0a0805',
        fontSize: '0.78rem',
        fontWeight: 700,
        padding: '8px 16px',
        cursor: 'pointer',
        fontFamily: TOKEN.font,
        transition: 'opacity 0.15s',
        letterSpacing: '0.03em',
      }}
      onMouseEnter={e => (e.currentTarget.style.opacity = '0.82')}
      onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
    >
      <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>{showForm ? '−' : '+'}</span>
      {showForm ? 'Cancel' : 'Add Memory'}
    </button>
  </div>
);

// ─── Search Bar ───────────────────────────────────────────────────────────────
interface SearchBarProps {
  query:    string;
  onChange: (q: string) => void;
}
const SearchBar: React.FC<SearchBarProps> = ({ query, onChange }) => (
  <div
    style={{
      position: 'relative',
      animation: TOKEN.fadeIn,
    }}
  >
    <span
      style={{
        position: 'absolute',
        left: 12,
        top: '50%',
        transform: 'translateY(-50%)',
        color: TOKEN.dim,
        fontSize: '0.85rem',
        pointerEvents: 'none',
        lineHeight: 1,
      }}
    >
      ⌕
    </span>
    <input
      type="text"
      value={query}
      onChange={e => onChange(e.target.value)}
      placeholder="Search memories…"
      style={{
        width: '100%',
        background: TOKEN.inset,
        border: `1px solid ${TOKEN.border}`,
        borderRadius: 9,
        color: TOKEN.text,
        fontSize: '0.82rem',
        fontFamily: TOKEN.font,
        padding: '9px 12px 9px 32px',
        outline: 'none',
        boxSizing: 'border-box',
        transition: 'border-color 0.2s',
      }}
      onFocus={e => (e.target.style.borderColor = TOKEN.violet)}
      onBlur={e => (e.target.style.borderColor = TOKEN.border)}
    />
    {query && (
      <button
        onClick={() => onChange('')}
        style={{
          position: 'absolute',
          right: 10,
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'none',
          border: 'none',
          color: TOKEN.dim,
          fontSize: '0.85rem',
          cursor: 'pointer',
          padding: 0,
          lineHeight: 1,
        }}
      >
        ×
      </button>
    )}
  </div>
);

// ─── Active Layer Tab (mobile / small view) ───────────────────────────────────
interface LayerTabsProps {
  active:   MemoryEntry['layer'];
  onChange: (l: MemoryEntry['layer']) => void;
  counts:   Record<MemoryEntry['layer'], number>;
}
const LayerTabs: React.FC<LayerTabsProps> = ({ active, onChange, counts }) => (
  <div
    style={{
      display: 'flex',
      gap: 4,
      background: TOKEN.inset,
      border: `1px solid ${TOKEN.border}`,
      borderRadius: 10,
      padding: 4,
      animation: TOKEN.fadeIn,
    }}
  >
    {LAYER_ORDER.map(layer => {
      const meta   = LAYER_META[layer];
      const isActive = layer === active;
      return (
        <button
          key={layer}
          onClick={() => onChange(layer)}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '7px 10px',
            borderRadius: 7,
            border: 'none',
            background: isActive ? meta.colorFaint : 'transparent',
            color: isActive ? meta.color : TOKEN.muted,
            fontSize: '0.72rem',
            fontWeight: 600,
            letterSpacing: '0.06em',
            cursor: 'pointer',
            fontFamily: TOKEN.font,
            transition: 'all 0.15s',
            outline: isActive ? `1px solid ${meta.color.replace('0.7)', '0.3)')}` : 'none',
          }}
        >
          <span>{meta.label}</span>
          <span
            style={{
              background: isActive ? meta.color : TOKEN.borderSubtle,
              color: isActive ? '#050505' : TOKEN.dim,
              borderRadius: 20,
              padding: '0 5px',
              fontSize: '0.62rem',
              fontWeight: 700,
              minWidth: 18,
              textAlign: 'center',
            }}
          >
            {counts[layer]}
          </span>
        </button>
      );
    })}
  </div>
);

// ─── Main Component ────────────────────────────────────────────────────────────
const MemoryVaultChamber: React.FC = () => {
  const memoryArchitecture = useAtlasStore(s => s.memoryArchitecture);
  const addMemoryEntry     = useAtlasStore(s => s.addMemoryEntry);
  const promoteMemoryEntry = useAtlasStore(s => s.promoteMemoryEntry);
  const removeMemoryEntry  = useAtlasStore(s => s.removeMemoryEntry);
  const traceUserId        = useAtlasStore(atlasTraceUserId);

  const [searchQuery, setSearchQuery]     = useState('');
  const [showForm, setShowForm]           = useState(false);
  const [activeTab, setActiveTab]         = useState<MemoryEntry['layer']>('working');
  const [useTabLayout, setUseTabLayout]   = useState(false);
  const [sqliteRows, setSqliteRows]       = useState<SqliteVaultRow[]>([]);
  const [sqliteStatus, setSqliteStatus]   = useState<'idle' | 'loading' | 'ok' | 'err'>('idle');

  const loadSqliteVault = useCallback(async () => {
    setSqliteStatus('loading');
    try {
      const res = await fetch(
        `${atlasApiUrl('/v1/governance/memory-vault')}?userId=${encodeURIComponent(traceUserId)}&limit=200`,
        { credentials: 'include' }
      );
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { entries?: SqliteVaultRow[] };
      setSqliteRows(Array.isArray(data.entries) ? data.entries : []);
      setSqliteStatus('ok');
    } catch {
      setSqliteRows([]);
      setSqliteStatus('err');
    }
  }, [traceUserId]);

  useEffect(() => {
    void loadSqliteVault();
  }, [loadSqliteVault]);

  // Detect viewport width for responsive tabbed layout
  React.useEffect(() => {
    const mq = window.matchMedia('(max-width: 800px)');
    const handler = (e: MediaQueryListEvent) => setUseTabLayout(e.matches);
    setUseTabLayout(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Filtered entries per layer
  const q = searchQuery.trim().toLowerCase();
  const filter = (entries: MemoryEntry[]): MemoryEntry[] => {
    if (!q) return entries;
    return entries.filter(e =>
      e.content.toLowerCase().includes(q) ||
      e.tags.some(t => t.toLowerCase().includes(q)) ||
      (e.source ?? '').toLowerCase().includes(q)
    );
  };

  const filtered = useMemo(() => ({
    transient: filter(memoryArchitecture.transient),
    working:   filter(memoryArchitecture.working),
    sovereign: filter(memoryArchitecture.sovereign),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [memoryArchitecture, q]);

  const counts: Record<MemoryEntry['layer'], number> = {
    transient: memoryArchitecture.transient.length,
    working:   memoryArchitecture.working.length,
    sovereign: memoryArchitecture.sovereign.length,
  };
  const totalCount = counts.transient + counts.working + counts.sovereign;

  const sqliteDupGroups = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of sqliteRows) {
      const k = r.content.trim().toLowerCase().slice(0, 140);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [sqliteRows]);

  return (
    <div
      style={{
        minHeight: '100%',
        background: TOKEN.bg,
        color: TOKEN.text,
        fontFamily: TOKEN.font,
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        boxSizing: 'border-box',
      }}
    >
      {/* Chamber Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, animation: TOKEN.fadeIn }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'rgba(167,139,250,0.08)',
            border: `1px solid rgba(167,139,250,0.25)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.95rem',
          }}
        >
          ⬡
        </div>
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: '1rem',
              fontWeight: 700,
              color: TOKEN.violet,
              lineHeight: 1.15,
              letterSpacing: '0.02em',
            }}
          >
            Memory Vault
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: '0.72rem',
              color: TOKEN.muted,
            }}
          >
            Browser-side layers below; SQLite semantic vault (embedding recall + evolution ingest) is listed separately.
          </p>
        </div>
      </div>

      <section
        style={{
          background: TOKEN.inset,
          border: `1px solid ${TOKEN.border}`,
          borderRadius: 10,
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          maxHeight: 280,
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '0.72rem', fontWeight: 700, color: TOKEN.violet, letterSpacing: '0.06em' }}>
              SQLite semantic vault
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.62rem', color: TOKEN.muted, lineHeight: 1.45 }}>
              Provenance for server-stored rows: origin (pipeline) and optional trace id. Duplicate badge = same normalized
              text appears more than once (manual dedup still TBD).
            </p>
          </div>
          <button
            type="button"
            className="atlas-touch-min"
            onClick={() => void loadSqliteVault()}
            style={{
              fontSize: '0.62rem',
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              padding: '8px 12px',
              borderRadius: 6,
              border: `1px solid ${TOKEN.border}`,
              background: 'transparent',
              color: TOKEN.muted,
              cursor: 'pointer',
              fontFamily: TOKEN.font,
            }}
          >
            Refresh
          </button>
        </div>
        {sqliteStatus === 'loading' && (
          <p style={{ margin: 0, fontSize: '0.65rem', color: TOKEN.dim }}>Loading…</p>
        )}
        {sqliteStatus === 'err' && (
          <p style={{ margin: 0, fontSize: '0.65rem', color: TOKEN.danger }}>
            Could not load (sign in for governance API or check backend).
          </p>
        )}
        {sqliteStatus === 'ok' && sqliteRows.length === 0 && (
          <p style={{ margin: 0, fontSize: '0.65rem', color: TOKEN.dim }}>No rows in memory_vault for this user.</p>
        )}
        {sqliteRows.length > 0 && (
          <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 2 }}>
            {sqliteRows.map((r) => {
              const norm = r.content.trim().toLowerCase().slice(0, 140);
              const dup = (sqliteDupGroups.get(norm) ?? 0) > 1;
              return (
                <div
                  key={r.id}
                  style={{
                    fontSize: '0.65rem',
                    lineHeight: 1.45,
                    color: TOKEN.text,
                    borderBottom: `1px solid ${TOKEN.borderSubtle}`,
                    paddingBottom: 6,
                  }}
                >
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'baseline', marginBottom: 4 }}>
                    {dup && (
                      <span
                        style={{
                          fontSize: '0.55rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          color: TOKEN.danger,
                          letterSpacing: '0.04em',
                        }}
                      >
                        duplicate text
                      </span>
                    )}
                    {r.type != null && r.type !== '' && (
                      <span style={{ color: TOKEN.violet, fontWeight: 600 }}>[{r.type}]</span>
                    )}
                    {r.confidence != null && (
                      <span style={{ color: TOKEN.dim }}>conf {Number(r.confidence).toFixed(2)}</span>
                    )}
                  </div>
                  <p style={{ margin: 0, wordBreak: 'break-word' }}>{r.content}</p>
                  <p style={{ margin: '4px 0 0', color: TOKEN.dim, fontSize: '0.6rem' }}>
                    origin: {r.origin ?? '—'}
                    {r.sourceTraceId ? ` · trace: ${r.sourceTraceId}` : ''}
                    {r.createdAt ? ` · ${r.createdAt}` : ''}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Stats Bar */}
      <StatsBar
        transientCount={counts.transient}
        workingCount={counts.working}
        sovereignCount={counts.sovereign}
        totalCount={totalCount}
        onAddClick={() => setShowForm(f => !f)}
        showForm={showForm}
      />

      {/* Add Memory Form */}
      {showForm && (
        <AddMemoryForm
          onAdd={entry => {
            addMemoryEntry(entry);
            setShowForm(false);
          }}
          onClose={() => setShowForm(false)}
        />
      )}

      {/* Search */}
      <SearchBar query={searchQuery} onChange={setSearchQuery} />

      {/* Search result notice */}
      {q && (
        <div
          style={{
            fontSize: '0.72rem',
            color: TOKEN.muted,
            animation: TOKEN.fadeIn,
          }}
        >
          Showing results for{' '}
          <span style={{ color: TOKEN.violet }}>"{searchQuery}"</span>{' '}
          — {filtered.transient.length + filtered.working.length + filtered.sovereign.length} entries found
        </div>
      )}

      {/* Responsive: Tabs (narrow) or Three-Column (wide) */}
      {useTabLayout ? (
        <>
          <LayerTabs
            active={activeTab}
            onChange={setActiveTab}
            counts={{
              transient: filtered.transient.length,
              working:   filtered.working.length,
              sovereign: filtered.sovereign.length,
            }}
          />
          <div style={{ flex: 1, minHeight: 0 }}>
            <LayerColumn
              key={activeTab}
              layer={activeTab}
              entries={filtered[activeTab]}
              onPromote={promoteMemoryEntry}
              onRemove={removeMemoryEntry}
            />
          </div>
        </>
      ) : (
        <div
          style={{
            display: 'flex',
            gap: 12,
            flex: 1,
            minHeight: 0,
            alignItems: 'stretch',
          }}
        >
          {LAYER_ORDER.map(layer => (
            <LayerColumn
              key={layer}
              layer={layer}
              entries={filtered[layer]}
              onPromote={promoteMemoryEntry}
              onRemove={removeMemoryEntry}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default MemoryVaultChamber;
