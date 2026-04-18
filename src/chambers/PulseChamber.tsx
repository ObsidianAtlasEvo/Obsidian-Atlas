import React, { useState } from 'react';
import { useAtlasStore } from '../store/useAtlasStore';
import { nowISO } from '../lib/persistence';
import type { PulseItem } from '@/types';

const TYPE_CONFIG: Record<PulseItem['type'], { label: string; color: string; desc: string }> = {
  ripening:  { label: 'Ripening',   color: 'rgba(34,197,94,0.7)',   desc: 'Ideas or decisions approaching readiness' },
  neglected: { label: 'Neglected',  color: 'rgba(239,68,68,0.65)',  desc: 'Important things going without attention' },
  relevant:  { label: 'Relevant',   color: 'rgba(99,102,241,0.7)',  desc: 'Items contextually significant right now' },
  attention: { label: 'Attention',  color: 'rgba(234,179,8,0.75)',  desc: 'Requires your focus today' },
  pattern:   { label: 'Pattern',    color: 'rgba(167,139,250,0.75)', desc: 'Recurring patterns worth noting' },
};

const SESSION_INTENTS = [
  { id: 'think', label: 'Think' },
  { id: 'decide', label: 'Decide' },
  { id: 'study', label: 'Study' },
  { id: 'write', label: 'Write' },
  { id: 'reflect', label: 'Reflect' },
  { id: 'map', label: 'Map' },
  { id: 'prepare', label: 'Prepare' },
  { id: 'recover', label: 'Recover' },
] as const;

/** Stable ref for stats that don't navigate (cursor: default). */
const PULSE_STAT_NO_OP = (): null => null;

export default function PulseChamber() {
  const pulse = useAtlasStore((s) => s.pulse);
  const sessionIntent = useAtlasStore((s) => s.sessionIntent);
  const setSessionIntent = useAtlasStore((s) => s.setSessionIntent);
  const addPulseItem = useAtlasStore((s) => s.addPulseItem);
  const removePulseItem = useAtlasStore((s) => s.removePulseItem);
  const setActiveMode = useAtlasStore((s) => s.setActiveMode);
  const recentQuestions = useAtlasStore((s) => s.recentQuestions);
  const doctrine = useAtlasStore((s) => s.userModel.doctrine);
  const journal = useAtlasStore((s) => s.journal);

  const [isAdding, setIsAdding] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newType, setNewType] = useState<PulseItem['type']>('attention');
  const [newPriority, setNewPriority] = useState(5);

  const now = new Date();
  const greeting = now.getHours() < 12
    ? 'Good morning'
    : now.getHours() < 17
      ? 'Good afternoon'
      : 'Good evening';

  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  const sortedItems = [...pulse.items].sort((a, b) => b.priority - a.priority);
  const attentionItems = sortedItems.filter((p) => p.type === 'attention' || p.type === 'neglected');
  const contextItems = sortedItems.filter((p) => p.type === 'ripening' || p.type === 'relevant');
  const patternItems = sortedItems.filter((p) => p.type === 'pattern');

  function handleAddItem() {
    if (!newContent.trim()) return;
    addPulseItem({
      type: newType,
      content: newContent.trim(),
      priority: newPriority,
      timestamp: nowISO(),
    });
    setNewContent('');
    setIsAdding(false);
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>

        {/* Greeting */}
        <div style={{ marginBottom: 32, animation: 'atlas-fade-in 400ms ease both' }}>
          <div style={{ fontSize: '0.7rem', color: 'rgba(226,232,240,0.3)', letterSpacing: '0.08em', marginBottom: 4 }}>
            {dateStr}
          </div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 300, letterSpacing: '-0.03em', color: 'rgba(226,232,240,0.85)' }}>
            {greeting}.
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: '0.875rem', color: 'rgba(226,232,240,0.3)' }}>
            What is the state of your field?
          </p>
        </div>

        {/* Session intent */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.12em', color: 'rgba(226,232,240,0.28)', textTransform: 'uppercase', marginBottom: 10 }}>
            Session Intent
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {SESSION_INTENTS.map((intent) => (
              <button
                key={intent.id}
                onClick={() => setSessionIntent(sessionIntent === intent.id ? null : intent.id)}
                style={{
                  background: sessionIntent === intent.id ? 'rgba(88,28,135,0.25)' : 'transparent',
                  border: `1px solid ${sessionIntent === intent.id ? 'rgba(88,28,135,0.5)' : 'rgba(88,28,135,0.15)'}`,
                  borderRadius: 20,
                  padding: '6px 14px',
                  color: sessionIntent === intent.id ? 'rgba(167,139,250,0.9)' : 'rgba(226,232,240,0.35)',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontFamily: 'inherit',
                  fontWeight: sessionIntent === intent.id ? 500 : 400,
                  transition: 'all 140ms ease',
                }}
              >
                {intent.label}
              </button>
            ))}
          </div>
        </div>

        {/* Quick stats */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 10,
            marginBottom: 32,
          }}
        >
          {[
            { label: 'Questions', value: recentQuestions.length, action: () => setActiveMode('atlas'), color: 'rgba(99,102,241,0.7)' },
            { label: 'Journal', value: journal.length, action: () => setActiveMode('journal'), color: 'rgba(34,197,94,0.65)' },
            { label: 'Doctrine', value: doctrine.length, action: () => setActiveMode('doctrine'), color: 'rgba(201,162,39,0.7)' },
            { label: 'Pulse Items', value: pulse.items.length, action: PULSE_STAT_NO_OP, color: 'rgba(167,139,250,0.7)' },
          ].map((stat) => (
            <button
              key={stat.label}
              onClick={stat.action}
              style={{
                background: 'rgba(15,10,30,0.5)',
                border: '1px solid rgba(88,28,135,0.12)',
                borderRadius: 8,
                padding: '14px 14px',
                cursor: stat.action !== PULSE_STAT_NO_OP ? 'pointer' : 'default',
                fontFamily: 'inherit',
                textAlign: 'left',
                transition: 'all 140ms ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(88,28,135,0.25)';
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(88,28,135,0.08)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(88,28,135,0.12)';
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(15,10,30,0.5)';
              }}
            >
              <div style={{ fontSize: '1.4rem', fontWeight: 300, color: stat.color, lineHeight: 1, marginBottom: 5 }}>
                {stat.value}
              </div>
              <div style={{ fontSize: '0.65rem', color: 'rgba(226,232,240,0.3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                {stat.label}
              </div>
            </button>
          ))}
        </div>

        {/* Pulse items */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.12em', color: 'rgba(226,232,240,0.28)', textTransform: 'uppercase' }}>
              Pulse Items
            </div>
            <button
              onClick={() => setIsAdding(true)}
              style={{
                background: 'transparent',
                border: '1px solid rgba(88,28,135,0.2)',
                borderRadius: 5,
                padding: '4px 10px',
                color: 'rgba(226,232,240,0.3)',
                cursor: 'pointer',
                fontSize: '0.68rem',
                fontFamily: 'inherit',
                transition: 'all 140ms ease',
              }}
            >
              + Add
            </button>
          </div>

          {isAdding && (
            <div
              style={{
                background: 'rgba(15,10,30,0.6)',
                border: '1px solid rgba(88,28,135,0.25)',
                borderRadius: 8,
                padding: '14px',
                marginBottom: 14,
                animation: 'atlas-fade-in 200ms ease both',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="What needs your attention?"
                autoFocus
                rows={2}
                style={{
                  background: 'rgba(5,5,8,0.5)',
                  border: '1px solid rgba(88,28,135,0.2)',
                  borderRadius: 6,
                  padding: '8px 10px',
                  color: 'rgba(226,232,240,0.85)',
                  fontSize: '0.83rem',
                  fontFamily: 'inherit',
                  outline: 'none',
                  resize: 'none',
                  lineHeight: 1.65,
                }}
              />
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as PulseItem['type'])}
                  style={{
                    background: 'rgba(5,5,8,0.5)',
                    border: '1px solid rgba(88,28,135,0.2)',
                    borderRadius: 5,
                    padding: '6px 8px',
                    color: 'rgba(226,232,240,0.7)',
                    fontSize: '0.75rem',
                    fontFamily: 'inherit',
                    outline: 'none',
                    cursor: 'pointer',
                    flex: 1,
                  }}
                >
                  {(Object.keys(TYPE_CONFIG) as PulseItem['type'][]).map((t) => (
                    <option key={t} value={t}>{TYPE_CONFIG[t].label}</option>
                  ))}
                </select>

                <input
                  type="range"
                  min={1}
                  max={10}
                  value={newPriority}
                  onChange={(e) => setNewPriority(Number(e.target.value))}
                  title={`Priority: ${newPriority}`}
                  style={{ flex: 1, cursor: 'pointer', accentColor: 'rgba(201,162,39,0.7)' }}
                />
                <span style={{ fontSize: '0.65rem', color: 'rgba(226,232,240,0.35)', minWidth: 20 }}>{newPriority}</span>

                <button
                  onClick={() => setIsAdding(false)}
                  style={{ background: 'transparent', border: 'none', color: 'rgba(226,232,240,0.3)', cursor: 'pointer', fontSize: '0.75rem', fontFamily: 'inherit', padding: '4px 6px' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddItem}
                  style={{
                    background: 'rgba(88,28,135,0.22)',
                    border: '1px solid rgba(88,28,135,0.4)',
                    borderRadius: 5,
                    padding: '5px 12px',
                    color: 'rgba(167,139,250,0.8)',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    fontFamily: 'inherit',
                  }}
                >
                  Add
                </button>
              </div>
            </div>
          )}

          {pulse.items.length === 0 && !isAdding ? (
            <div style={{ padding: '28px 0', color: 'rgba(226,232,240,0.2)', fontSize: '0.8rem', textAlign: 'center', lineHeight: 1.7 }}>
              No pulse items. Add items that require your attention today.
            </div>
          ) : (
            <>
              {attentionItems.length > 0 && (
                <PulseSection title="Requires Attention" items={attentionItems} onRemove={removePulseItem} />
              )}
              {contextItems.length > 0 && (
                <PulseSection title="Active Context" items={contextItems} onRemove={removePulseItem} />
              )}
              {patternItems.length > 0 && (
                <PulseSection title="Patterns" items={patternItems} onRemove={removePulseItem} />
              )}
            </>
          )}
        </div>

        {/* Go to Atlas */}
        {sessionIntent && (
          <div style={{ textAlign: 'center', animation: 'atlas-fade-in 400ms ease both' }}>
            <button
              onClick={() => setActiveMode('atlas')}
              style={{
                background: 'rgba(88,28,135,0.2)',
                border: '1px solid rgba(88,28,135,0.4)',
                borderRadius: 8,
                padding: '11px 24px',
                color: 'rgba(167,139,250,0.85)',
                cursor: 'pointer',
                fontSize: '0.83rem',
                fontFamily: 'inherit',
                fontWeight: 500,
                transition: 'all 140ms ease',
                letterSpacing: '0.02em',
              }}
            >
              Begin {sessionIntent.charAt(0).toUpperCase() + sessionIntent.slice(1)} Session →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PulseSection({
  title,
  items,
  onRemove,
}: {
  title: string;
  items: PulseItem[];
  onRemove: (id: string) => void;
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.1em', color: 'rgba(226,232,240,0.22)', textTransform: 'uppercase', marginBottom: 8 }}>
        {title}
      </div>
      {items.map((item) => {
        const config = TYPE_CONFIG[item.type];
        return (
          <div
            key={item.id}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '10px 12px',
              background: 'rgba(15,10,30,0.35)',
              border: '1px solid rgba(88,28,135,0.1)',
              borderLeft: `2px solid ${config.color}`,
              borderRadius: 6,
              marginBottom: 7,
              animation: 'atlas-fade-in 200ms ease both',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <span style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.08em', color: config.color, textTransform: 'uppercase' }}>
                  {config.label}
                </span>
                <span style={{ fontSize: '0.58rem', color: 'rgba(226,232,240,0.2)' }}>
                  p{item.priority}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '0.83rem', color: 'rgba(226,232,240,0.72)', lineHeight: 1.65 }}>
                {item.content}
              </p>
            </div>
            <button
              onClick={() => onRemove(item.id)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(226,232,240,0.2)',
                cursor: 'pointer',
                padding: '2px 4px',
                fontSize: '0.9rem',
                lineHeight: 1,
                flexShrink: 0,
                transition: 'color 140ms ease',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(239,68,68,0.5)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(226,232,240,0.2)'; }}
              title="Remove"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
