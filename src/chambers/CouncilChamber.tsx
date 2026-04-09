import React, { useState } from 'react';
import { useAtlasStore } from '../store/useAtlasStore';
import { generateId, nowISO } from '../lib/persistence';

interface CouncilLens {
  id: string;
  name: string;
  description: string;
  icon: string;
  perspective: string;
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

const COMMON_EMOJIS = ['🧠', '🔬', '⚗️', '🎭', '📐', '🌊', '🔥', '⚡', '🌀', '🪬', '🦅', '🧩', '🔭', '💎', '🌿', '⚖️', '🛡️', '🎯'];

// ─── Sub-components ──────────────────────────────────────────────

function EmojiPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          style={{
            fontSize: '1.4rem',
            padding: '4px 10px',
            background: T.inset,
            border: `1px solid ${T.border}`,
            borderRadius: 6,
            cursor: 'pointer',
            lineHeight: 1,
          }}
        >
          {value || '?'}
        </button>
        <input
          style={{
            flex: 1,
            background: T.inset,
            border: `1px solid ${T.border}`,
            borderRadius: 6,
            color: T.body,
            fontSize: '0.85rem',
            padding: '6px 10px',
            outline: 'none',
          }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type emoji or click to pick..."
          maxLength={2}
        />
      </div>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '110%',
            left: 0,
            zIndex: 50,
            background: 'rgba(15,10,30,0.98)',
            border: `1px solid ${T.border}`,
            borderRadius: 8,
            padding: 8,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 4,
            width: 220,
            boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
          }}
        >
          {COMMON_EMOJIS.map((em) => (
            <button
              key={em}
              type="button"
              onClick={() => {
                onChange(em);
                setOpen(false);
              }}
              style={{
                fontSize: '1.2rem',
                padding: '4px 6px',
                background: 'transparent',
                border: `1px solid transparent`,
                borderRadius: 4,
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => ((e.target as HTMLElement).style.background = 'rgba(88,28,135,0.2)')}
              onMouseLeave={(e) => ((e.target as HTMLElement).style.background = 'transparent')}
            >
              {em}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CouncilMemberCard({
  lens,
  question,
  onRemove,
}: {
  lens: CouncilLens;
  question: string;
  onRemove: () => void;
}) {
  return (
    <div
      style={{
        background: T.panel,
        border: `1px solid ${T.border}`,
        borderRadius: 10,
        padding: '16px',
        animation: 'atlas-fade-in 300ms ease both',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        position: 'relative',
      }}
    >
      {/* Remove button */}
      <button
        onClick={onRemove}
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          background: 'transparent',
          border: 'none',
          color: T.dim,
          cursor: 'pointer',
          fontSize: '0.75rem',
          padding: '2px 5px',
          borderRadius: 4,
          lineHeight: 1,
          transition: 'color 0.15s',
        }}
        onMouseEnter={(e) => ((e.target as HTMLElement).style.color = T.danger)}
        onMouseLeave={(e) => ((e.target as HTMLElement).style.color = T.dim)}
        title="Remove member"
      >
        ✕
      </button>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            fontSize: '1.8rem',
            width: 48,
            height: 48,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(88,28,135,0.12)',
            border: `1px solid rgba(88,28,135,0.2)`,
            borderRadius: 10,
            flexShrink: 0,
          }}
        >
          {lens.icon || '🧠'}
        </div>
        <div>
          <div style={{ color: T.body, fontWeight: 700, fontSize: '0.92rem', paddingRight: 24 }}>
            {lens.name}
          </div>
          <div style={{ color: T.muted, fontSize: '0.77rem', marginTop: 2 }}>{lens.description}</div>
        </div>
      </div>

      {/* Perspective */}
      <div>
        <div style={{ ...labelStyle, color: T.dim, marginBottom: 4 }}>Perspective lens</div>
        <p
          style={{
            margin: 0,
            color: T.muted,
            fontSize: '0.8rem',
            lineHeight: 1.55,
            background: T.inset,
            border: `1px solid ${T.borderSubtle}`,
            borderRadius: 6,
            padding: '8px 10px',
          }}
        >
          {lens.perspective}
        </p>
      </div>

      {/* Response area */}
      <div>
        <div
          style={{
            ...labelStyle,
            color: T.violet,
            marginBottom: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>Response from {lens.name}</span>
          <span
            style={{
              ...labelStyle,
              color: T.amber,
              background: 'rgba(234,179,8,0.08)',
              border: '1px solid rgba(234,179,8,0.2)',
              borderRadius: 4,
              padding: '2px 6px',
            }}
          >
            Requires Ollama
          </span>
        </div>
        <div
          style={{
            background: T.inset,
            border: `1px dashed ${T.border}`,
            borderRadius: 6,
            padding: '14px',
            minHeight: 72,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {question.trim() ? (
            <p style={{ color: T.dim, fontSize: '0.78rem', textAlign: 'center', margin: 0, lineHeight: 1.6 }}>
              "{question}"
              <br />
              <span style={{ color: 'rgba(226,232,240,0.2)', fontSize: '0.72rem', marginTop: 4, display: 'block' }}>
                Connect Ollama to generate a {lens.name} perspective on this question.
              </span>
            </p>
          ) : (
            <p style={{ color: T.dim, fontSize: '0.78rem', textAlign: 'center', margin: 0 }}>
              Pose a question above to activate council responses.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function AddMemberForm({
  onAdd,
  onCancel,
}: {
  onAdd: (lens: CouncilLens) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('🧠');
  const [perspective, setPerspective] = useState('');

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
    if (!name.trim() || !perspective.trim()) return;
    onAdd({
      id: generateId(),
      name: name.trim(),
      description: description.trim(),
      icon: icon || '🧠',
      perspective: perspective.trim(),
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: T.panel,
        border: `1px solid rgba(167,139,250,0.2)`,
        borderRadius: 10,
        padding: 18,
        animation: 'atlas-fade-in 300ms ease both',
      }}
    >
      <div style={{ ...labelStyle, color: T.violet, marginBottom: 14, fontSize: '0.7rem' }}>
        Add Advisory Lens
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={labelBlock}>Name</label>
          <input
            style={inputStyle}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="The Skeptic, Systems Thinker..."
            required
          />
        </div>
        <div>
          <label style={labelBlock}>Description</label>
          <input
            style={inputStyle}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief role description..."
          />
        </div>
      </div>

      <label style={labelBlock}>Icon (emoji)</label>
      <EmojiPicker value={icon} onChange={setIcon} />

      <label style={labelBlock}>Perspective / Reasoning Lens</label>
      <textarea
        style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
        value={perspective}
        onChange={(e) => setPerspective(e.target.value)}
        placeholder="How this lens approaches problems — its priors, methods, biases..."
        required
      />

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button
          type="submit"
          style={{
            flex: 1,
            padding: '8px 0',
            borderRadius: 5,
            border: '1px solid rgba(167,139,250,0.35)',
            background: 'rgba(167,139,250,0.12)',
            color: T.violet,
            ...labelStyle,
            cursor: 'pointer',
          }}
        >
          Add to Council
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
export default function CouncilChamber() {
  const councilStore = useAtlasStore((s) => (s as any).council) as CouncilLens[] | undefined;
  const [members, setMembers] = useState<CouncilLens[]>(councilStore ?? []);
  const [question, setQuestion] = useState('');
  const [submittedQuestion, setSubmittedQuestion] = useState('');
  const [showForm, setShowForm] = useState(false);

  function handlePose(e: React.FormEvent) {
    e.preventDefault();
    if (question.trim()) {
      setSubmittedQuestion(question.trim());
    }
  }

  function handleAdd(lens: CouncilLens) {
    setMembers((prev) => [...prev, lens]);
    setShowForm(false);
  }

  function handleRemove(id: string) {
    setMembers((prev) => prev.filter((m) => m.id !== id));
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
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h2 style={{ color: T.violet, fontWeight: 700, fontSize: '1.15rem', margin: 0 }}>
              Council Chamber
            </h2>
            <p style={{ color: T.muted, fontSize: '0.8rem', margin: '3px 0 0' }}>
              Synthetic advisory council — pose questions to be examined through multiple reasoning lenses simultaneously.
            </p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            style={{
              padding: '7px 16px',
              borderRadius: 6,
              border: '1px solid rgba(167,139,250,0.35)',
              background: showForm ? 'rgba(167,139,250,0.18)' : 'rgba(167,139,250,0.08)',
              color: T.violet,
              ...labelStyle,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            {showForm ? '✕ Cancel' : '+ Add Lens'}
          </button>
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <div style={{ marginBottom: 20 }}>
          <AddMemberForm onAdd={handleAdd} onCancel={() => setShowForm(false)} />
        </div>
      )}

      {/* Ask the Council */}
      <div
        style={{
          background: T.panel,
          border: `1px solid rgba(167,139,250,0.18)`,
          borderRadius: 10,
          padding: '16px 18px',
          marginBottom: 24,
        }}
      >
        <div style={{ ...labelStyle, color: T.violet, marginBottom: 10 }}>Ask the Council</div>
        <form onSubmit={handlePose} style={{ display: 'flex', gap: 10 }}>
          <input
            style={{
              flex: 1,
              background: T.inset,
              border: `1px solid ${T.border}`,
              borderRadius: 6,
              color: T.body,
              fontSize: '0.88rem',
              padding: '10px 14px',
              outline: 'none',
              minWidth: 0,
            }}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Pose a question to the council... e.g. 'How should I approach epistemic uncertainty?'"
          />
          <button
            type="submit"
            disabled={!question.trim() || members.length === 0}
            style={{
              padding: '9px 18px',
              borderRadius: 6,
              border: '1px solid rgba(167,139,250,0.35)',
              background:
                !question.trim() || members.length === 0
                  ? 'rgba(88,28,135,0.05)'
                  : 'rgba(167,139,250,0.15)',
              color: !question.trim() || members.length === 0 ? T.dim : T.violet,
              ...labelStyle,
              cursor: !question.trim() || members.length === 0 ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s',
              flexShrink: 0,
            }}
          >
            Convene
          </button>
        </form>

        {submittedQuestion && (
          <div
            style={{
              marginTop: 10,
              padding: '8px 12px',
              background: 'rgba(167,139,250,0.06)',
              border: `1px solid rgba(167,139,250,0.14)`,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
            }}
          >
            <span style={{ color: T.muted, fontSize: '0.82rem', fontStyle: 'italic' }}>
              "{submittedQuestion}"
            </span>
            <button
              onClick={() => { setSubmittedQuestion(''); setQuestion(''); }}
              style={{
                background: 'transparent',
                border: 'none',
                color: T.dim,
                cursor: 'pointer',
                fontSize: '0.72rem',
                padding: '2px 4px',
                flexShrink: 0,
              }}
            >
              ✕ Clear
            </button>
          </div>
        )}

        {members.length === 0 && (
          <p style={{ color: T.dim, fontSize: '0.78rem', marginTop: 8, marginBottom: 0 }}>
            Add advisory lenses below to enable council responses.
          </p>
        )}
      </div>

      {/* Council grid */}
      {members.length === 0 ? (
        <div
          style={{
            background: T.panel,
            border: `1px dashed ${T.border}`,
            borderRadius: 10,
            padding: '48px 24px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🪬</div>
          <div style={{ color: T.muted, fontSize: '0.9rem', fontWeight: 600, marginBottom: 6 }}>
            Your council is empty
          </div>
          <p style={{ color: T.dim, fontSize: '0.8rem', maxWidth: 380, margin: '0 auto', lineHeight: 1.6 }}>
            Add advisory lenses representing different ways of thinking — a skeptic, a systems thinker,
            an empiricist, a pragmatist. Each lens will respond to your questions from its own perspective.
          </p>
          <button
            onClick={() => setShowForm(true)}
            style={{
              marginTop: 16,
              padding: '8px 20px',
              borderRadius: 6,
              border: '1px solid rgba(167,139,250,0.3)',
              background: 'rgba(167,139,250,0.1)',
              color: T.violet,
              ...labelStyle,
              cursor: 'pointer',
            }}
          >
            + Add First Lens
          </button>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 14,
          }}
        >
          {members.map((lens) => (
            <CouncilMemberCard
              key={lens.id}
              lens={lens}
              question={submittedQuestion}
              onRemove={() => handleRemove(lens.id)}
            />
          ))}
        </div>
      )}

      {/* Council count / footer */}
      {members.length > 0 && (
        <div
          style={{
            marginTop: 20,
            padding: '10px 16px',
            background: T.panel,
            border: `1px solid ${T.border}`,
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', gap: 20 }}>
            <div>
              <div style={{ ...labelStyle, color: T.dim }}>Council Size</div>
              <div style={{ color: T.violet, fontWeight: 700, fontSize: '1.1rem', marginTop: 2 }}>
                {members.length}
              </div>
            </div>
            <div>
              <div style={{ ...labelStyle, color: T.dim }}>Active Question</div>
              <div style={{ color: T.body, fontSize: '0.82rem', marginTop: 2 }}>
                {submittedQuestion ? (
                  <span style={{ color: T.muted, fontStyle: 'italic' }}>
                    "{submittedQuestion.slice(0, 50)}{submittedQuestion.length > 50 ? '…' : ''}"
                  </span>
                ) : (
                  <span style={{ color: T.dim }}>None</span>
                )}
              </div>
            </div>
          </div>
          <div
            style={{
              ...labelStyle,
              color: T.amber,
              background: 'rgba(234,179,8,0.07)',
              border: '1px solid rgba(234,179,8,0.15)',
              borderRadius: 5,
              padding: '4px 10px',
            }}
          >
            Ollama required for responses
          </div>
        </div>
      )}
    </div>
  );
}
