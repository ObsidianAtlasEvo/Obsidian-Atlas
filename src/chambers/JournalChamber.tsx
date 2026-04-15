import React, { useState, useRef, useEffect } from 'react';
import { useAtlasStore } from '../store/useAtlasStore';
import { backendComplete } from '../lib/backendInference';
import { buildAnalysisPrompt } from '../lib/atlasPrompt';
import { nowISO } from '../lib/persistence';
import type { JournalEntry, JournalAssistanceMode } from '@/types';

// ── Assistance mode labels ─────────────────────────────────────────────────

const ASSIST_MODES: { id: JournalAssistanceMode; label: string; description: string }[] = [
  { id: 'reflective-mirror', label: 'Mirror',     description: 'Reflect and deepen understanding' },
  { id: 'strategic-analyst', label: 'Analyst',    description: 'Strategic implications and leverage' },
  { id: 'doctrine-standards', label: 'Standards', description: 'Evaluate against your doctrine' },
  { id: 'adversarial-red-team', label: 'Red Team', description: 'Challenge and stress-test' },
  { id: 'growth-mastery', label: 'Growth',        description: 'Learning and mastery signals' },
];

// ── Journal Entry Card ────────────────────────────────────────────────────

function EntryCard({
  entry,
  onSelect,
  isSelected,
}: {
  entry: JournalEntry;
  onSelect: () => void;
  isSelected: boolean;
}) {
  const preview = entry.content.slice(0, 140);
  const date = new Date(entry.timestamp);
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  return (
    <button
      onClick={onSelect}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        background: isSelected ? 'rgba(88,28,135,0.15)' : 'transparent',
        border: `1px solid ${isSelected ? 'rgba(88,28,135,0.35)' : 'rgba(88,28,135,0.1)'}`,
        borderRadius: 8,
        padding: '12px 14px',
        cursor: 'pointer',
        transition: 'all 140ms ease',
        fontFamily: 'inherit',
        marginBottom: 8,
      }}
      onMouseEnter={(e) => {
        if (!isSelected) {
          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(88,28,135,0.08)';
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(88,28,135,0.2)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(88,28,135,0.1)';
        }
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6, gap: 8 }}>
        <span
          style={{
            fontSize: '0.8rem',
            fontWeight: 500,
            color: 'rgba(226,232,240,0.85)',
            lineHeight: 1.3,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {entry.title || 'Untitled'}
        </span>
        <div style={{ flexShrink: 0, textAlign: 'right' }}>
          <div style={{ fontSize: '0.62rem', color: 'rgba(226,232,240,0.3)', lineHeight: 1.4 }}>{dateStr}</div>
          <div style={{ fontSize: '0.6rem', color: 'rgba(226,232,240,0.2)' }}>{timeStr}</div>
        </div>
      </div>
      <p
        style={{
          margin: 0,
          fontSize: '0.77rem',
          color: 'rgba(226,232,240,0.38)',
          lineHeight: 1.6,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {preview}{entry.content.length > 140 ? '…' : ''}
      </p>
      {entry.isPinned && (
        <div style={{ marginTop: 6, fontSize: '0.6rem', color: 'rgba(201,162,39,0.5)', letterSpacing: '0.08em' }}>
          PINNED
        </div>
      )}
    </button>
  );
}

// ── Analysis Panel ────────────────────────────────────────────────────────

function AnalysisPanel({ entry }: { entry: JournalEntry }) {
  const a = entry.analysis;
  if (!a) return null;

  return (
    <div
      style={{
        marginTop: 20,
        padding: '14px 16px',
        background: 'rgba(5,5,8,0.5)',
        border: '1px solid rgba(88,28,135,0.15)',
        borderRadius: 8,
        animation: 'atlas-fade-in 300ms ease both',
      }}
    >
      <div style={{ fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.12em', color: 'rgba(201,162,39,0.6)', textTransform: 'uppercase', marginBottom: 12 }}>
        Atlas Analysis
      </div>

      {a.summary && (
        <p style={{ fontSize: '0.8rem', color: 'rgba(226,232,240,0.7)', lineHeight: 1.7, margin: '0 0 12px' }}>
          {a.summary}
        </p>
      )}

      {a.observation?.length > 0 && (
        <Section label="Observations" items={a.observation} color="rgba(99,102,241,0.7)" />
      )}
      {a.tensionPoints?.length > 0 && (
        <Section label="Tensions" items={a.tensionPoints} color="rgba(239,68,68,0.6)" />
      )}
      {a.doctrineImplications?.length > 0 && (
        <Section label="Doctrine Implications" items={a.doctrineImplications} color="rgba(201,162,39,0.7)" />
      )}
      {a.challengePrompts?.length > 0 && (
        <Section label="Challenge Questions" items={a.challengePrompts} color="rgba(167,139,250,0.7)" />
      )}
    </div>
  );
}

function Section({ label, items, color }: { label: string; items: string[]; color: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.1em', color, textTransform: 'uppercase', marginBottom: 6 }}>
        {label}
      </div>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
          <span style={{ color, flexShrink: 0, marginTop: 1 }}>—</span>
          <span style={{ fontSize: '0.78rem', color: 'rgba(226,232,240,0.6)', lineHeight: 1.6 }}>{item}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main Chamber ──────────────────────────────────────────────────────────

export default function JournalChamber() {
  const journal = useAtlasStore((s) => s.journal);
  const addJournalEntry = useAtlasStore((s) => s.addJournalEntry);
  const updateJournalEntry = useAtlasStore((s) => s.updateJournalEntry);
  const removeJournalEntry = useAtlasStore((s) => s.removeJournalEntry);
  const pinJournalEntry = useAtlasStore((s) => s.pinJournalEntry);

  const [selectedId, setSelectedId] = useState<string | null>(journal[0]?.id ?? null);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [assistMode, setAssistMode] = useState<JournalAssistanceMode>('reflective-mirror');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const selected = journal.find((e) => e.id === selectedId) ?? null;
  const pinned = journal.filter((e) => e.isPinned);
  const unpinned = journal.filter((e) => !e.isPinned);
  const sortedEntries = [...pinned, ...unpinned];

  function startNew() {
    setIsEditing(true);
    setEditContent('');
    setEditTitle('');
    setSelectedId(null);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  function startEdit() {
    if (!selected) return;
    setIsEditing(true);
    setEditContent(selected.content);
    setEditTitle(selected.title);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  async function saveEntry() {
    if (!editContent.trim()) {
      setIsEditing(false);
      return;
    }

    const title = editTitle.trim() || editContent.slice(0, 60).replace(/\n/g, ' ');

    if (selectedId && selected) {
      await updateJournalEntry(selectedId, { content: editContent, title });
    } else {
      const entry = await addJournalEntry({
        title,
        content: editContent,
        timestamp: nowISO(),
        tags: [],
        assistanceEnabled: true,
        assistanceMode: assistMode,
        isPinned: false,
      });
      setSelectedId(entry.id);
    }
    setIsEditing(false);
  }

  async function analyzeEntry() {
    if (!selected || isAnalyzing) return;
    setIsAnalyzing(true);

    const modeDescriptions: Record<JournalAssistanceMode, string> = {
      'reflective-mirror': 'Provide a reflective mirror response. Identify core themes, deepen the user\'s understanding, and surface what they might be circling around. Do not advise — only reflect.',
      'strategic-analyst': 'Analyze this journal entry strategically. Identify key leverage points, implications, opportunities, and second-order effects.',
      'doctrine-standards': 'Evaluate this journal entry against a person\'s standards. Identify where they are living their principles and where there are gaps.',
      'adversarial-red-team': 'Red-team this journal entry. Challenge the assumptions, expose weaknesses, identify self-deceptions and blind spots.',
      'growth-mastery': 'Identify growth and mastery signals in this journal entry. What is the person learning? What skills or beliefs are developing or stagnating?',
      'custom': 'Provide a thoughtful analysis of this journal entry.',
    };

    const prompt = buildAnalysisPrompt(`${modeDescriptions[selected.assistanceMode ?? 'reflective-mirror']}

Journal entry to analyze:
Title: ${selected.title}
Content: ${selected.content}

Respond with a JSON object with this exact structure:
{
  "summary": "2-3 sentence synthesis",
  "observation": ["observation 1", "observation 2"],
  "tensionPoints": ["tension 1"],
  "doctrineImplications": ["implication 1"],
  "challengePrompts": ["challenge question 1", "challenge question 2"]
}

Return ONLY valid JSON. No commentary.`);

    try {
      const currentUser = useAtlasStore.getState().currentUser;
      const userId = currentUser?.uid ?? currentUser?.email ?? 'anonymous';
      const raw = await backendComplete(prompt, { system: 'You are an analytical engine. Return only valid JSON.', userId });

      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');

      const parsed = JSON.parse(jsonMatch[0]) as {
        summary: string;
        observation: string[];
        tensionPoints: string[];
        doctrineImplications: string[];
        challengePrompts: string[];
      };

      await updateJournalEntry(selected.id, {
        analysis: {
          ...parsed,
          interpretation: [],
          inference: [],
          hypothesis: [],
          suggestedRefinements: [],
        },
      });
    } catch (err) {
      console.error('[Journal] Analysis failed:', err);
    } finally {
      setIsAnalyzing(false);
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Sidebar */}
      <div
        style={{
          width: 280,
          minWidth: 280,
          borderRight: '1px solid var(--border-structural)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: 'var(--atlas-surface-rail)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 16px 12px',
            borderBottom: '1px solid var(--border-structural)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 500, color: 'rgba(226,232,240,0.8)', letterSpacing: '-0.01em' }}>Journal</div>
            <div style={{ fontSize: '0.62rem', color: 'rgba(226,232,240,0.25)', marginTop: 1 }}>
              {journal.length} {journal.length === 1 ? 'entry' : 'entries'}
            </div>
          </div>
          <button
            onClick={startNew}
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: 'rgba(88,28,135,0.2)',
              border: '1px solid rgba(88,28,135,0.35)',
              color: 'rgba(167,139,250,0.8)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.1rem',
              lineHeight: 1,
              transition: 'all 140ms ease',
            }}
            title="New entry"
          >
            +
          </button>
        </div>

        {/* Entry list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 10px' }}>
          {sortedEntries.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 16px', color: 'rgba(226,232,240,0.2)', fontSize: '0.78rem', lineHeight: 1.7 }}>
              No entries yet.
              <br />
              Press + to begin.
            </div>
          ) : (
            sortedEntries.map((e) => (
              <EntryCard
                key={e.id}
                entry={e}
                isSelected={selectedId === e.id && !isEditing}
                onSelect={() => { setSelectedId(e.id); setIsEditing(false); }}
              />
            ))
          )}
        </div>
      </div>

      {/* Main view */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {isEditing ? (
          // Editor
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '24px 32px', overflow: 'hidden' }}>
            <div style={{ marginBottom: 12 }}>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Entry title (optional)"
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid rgba(88,28,135,0.2)',
                  padding: '8px 0',
                  color: 'rgba(226,232,240,0.85)',
                  fontSize: '1.1rem',
                  fontWeight: 400,
                  fontFamily: 'inherit',
                  outline: 'none',
                  letterSpacing: '-0.02em',
                }}
              />
            </div>

            <textarea
              ref={textareaRef}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder="Write freely. Atlas will help you see it more clearly."
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                resize: 'none',
                color: 'rgba(226,232,240,0.82)',
                fontSize: '0.9rem',
                lineHeight: 1.85,
                fontFamily: 'inherit',
                padding: '8px 0',
              }}
            />

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 12, borderTop: '1px solid var(--border-structural)' }}>
              <button
                onClick={() => setIsEditing(false)}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(88,28,135,0.2)',
                  borderRadius: 6,
                  padding: '7px 14px',
                  color: 'rgba(226,232,240,0.4)',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontFamily: 'inherit',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => void saveEntry()}
                style={{
                  background: 'rgba(88,28,135,0.25)',
                  border: '1px solid rgba(88,28,135,0.4)',
                  borderRadius: 6,
                  padding: '7px 16px',
                  color: 'rgba(226,232,240,0.85)',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontFamily: 'inherit',
                  fontWeight: 500,
                }}
              >
                Save
              </button>
            </div>
          </div>
        ) : selected ? (
          // Selected entry view
          <div style={{ flex: 1, overflowY: 'auto', padding: '28px 36px' }}>
            <div style={{ maxWidth: 680, margin: '0 auto' }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <div>
                  <h2 style={{ fontSize: '1.15rem', fontWeight: 500, letterSpacing: '-0.02em', color: 'rgba(226,232,240,0.92)', margin: '0 0 4px' }}>
                    {selected.title || 'Untitled'}
                  </h2>
                  <div style={{ fontSize: '0.65rem', color: 'rgba(226,232,240,0.28)', letterSpacing: '0.04em' }}>
                    {new Date(selected.timestamp).toLocaleString('en-US', {
                      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => void pinJournalEntry(selected.id, !selected.isPinned)}
                    title={selected.isPinned ? 'Unpin' : 'Pin'}
                    style={{
                      background: 'transparent',
                      border: `1px solid ${selected.isPinned ? 'rgba(201,162,39,0.3)' : 'rgba(88,28,135,0.15)'}`,
                      borderRadius: 5,
                      padding: '5px 10px',
                      color: selected.isPinned ? 'rgba(201,162,39,0.7)' : 'rgba(226,232,240,0.25)',
                      cursor: 'pointer',
                      fontSize: '0.65rem',
                      letterSpacing: '0.08em',
                      fontFamily: 'inherit',
                    }}
                  >
                    {selected.isPinned ? 'PINNED' : 'PIN'}
                  </button>
                  <button
                    onClick={startEdit}
                    style={{
                      background: 'transparent',
                      border: '1px solid rgba(88,28,135,0.15)',
                      borderRadius: 5,
                      padding: '5px 10px',
                      color: 'rgba(226,232,240,0.3)',
                      cursor: 'pointer',
                      fontSize: '0.65rem',
                      letterSpacing: '0.08em',
                      fontFamily: 'inherit',
                    }}
                  >
                    EDIT
                  </button>
                  <button
                    onClick={() => {
                      void removeJournalEntry(selected.id);
                      setSelectedId(journal.find((e) => e.id !== selected.id)?.id ?? null);
                    }}
                    style={{
                      background: 'transparent',
                      border: '1px solid rgba(239,68,68,0.15)',
                      borderRadius: 5,
                      padding: '5px 10px',
                      color: 'rgba(239,68,68,0.4)',
                      cursor: 'pointer',
                      fontSize: '0.65rem',
                      letterSpacing: '0.08em',
                      fontFamily: 'inherit',
                    }}
                  >
                    DELETE
                  </button>
                </div>
              </div>

              {/* Content */}
              <div
                style={{
                  fontSize: '0.9rem',
                  lineHeight: 1.85,
                  color: 'rgba(226,232,240,0.78)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {selected.content}
              </div>

              {/* Atlas analysis */}
              {selected.analysis ? (
                <AnalysisPanel entry={selected} />
              ) : (
                <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--border-structural)' }}>
                  <div style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.1em', color: 'rgba(226,232,240,0.25)', textTransform: 'uppercase', marginBottom: 12 }}>
                    Atlas Analysis
                  </div>

                  {/* Mode selector */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                    {ASSIST_MODES.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => {
                          setAssistMode(m.id);
                          void updateJournalEntry(selected.id, { assistanceMode: m.id });
                        }}
                        title={m.description}
                        style={{
                          background: assistMode === m.id ? 'rgba(88,28,135,0.2)' : 'transparent',
                          border: `1px solid ${assistMode === m.id ? 'rgba(88,28,135,0.4)' : 'rgba(88,28,135,0.12)'}`,
                          borderRadius: 5,
                          padding: '5px 10px',
                          color: assistMode === m.id ? 'rgba(167,139,250,0.8)' : 'rgba(226,232,240,0.3)',
                          cursor: 'pointer',
                          fontSize: '0.7rem',
                          fontFamily: 'inherit',
                          transition: 'all 140ms ease',
                        }}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => void analyzeEntry()}
                    disabled={isAnalyzing}
                    style={{
                      background: isAnalyzing ? 'rgba(88,28,135,0.1)' : 'rgba(88,28,135,0.2)',
                      border: '1px solid rgba(88,28,135,0.35)',
                      borderRadius: 6,
                      padding: '8px 16px',
                      color: isAnalyzing ? 'rgba(226,232,240,0.3)' : 'rgba(167,139,250,0.8)',
                      cursor: isAnalyzing ? 'wait' : 'pointer',
                      fontSize: '0.78rem',
                      fontFamily: 'inherit',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    {isAnalyzing && (
                      <div style={{ width: 12, height: 12, borderRadius: '50%', border: '1.5px solid rgba(167,139,250,0.2)', borderTopColor: 'rgba(167,139,250,0.7)', animation: 'spin 0.8s linear infinite' }} />
                    )}
                    {isAnalyzing ? 'Analyzing…' : 'Request Atlas Analysis'}
                  </button>
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
              )}
            </div>
          </div>
        ) : (
          // Empty state
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 16,
              color: 'rgba(226,232,240,0.25)',
            }}
          >
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(88,28,135,0.3)" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 2h12l4 4v16H4V2z" />
              <path d="M14 2v4h4" />
              <path d="M8 10h8M8 14h8M8 18h5" />
            </svg>
            <span style={{ fontSize: '0.8rem' }}>Select an entry or create a new one</span>
          </div>
        )}
      </div>
    </div>
  );
}
