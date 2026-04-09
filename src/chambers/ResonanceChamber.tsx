/**
 * ResonanceChamber — Adaptive alignment dashboard.
 *
 * Shows how Atlas learns and adapts to the user's cognitive signature over time.
 * Five tabs: Overview, Cognitive Model, Profiles, Observation Log, Adjustment History.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useAtlasStore } from '../store/useAtlasStore';
import type { ResonanceMode } from '@/types';
import type {
  ResonanceProfile,
  ResonanceObservation,
  ResonanceAdjustmentLog,
} from '@/resonance/types';

// ── Design tokens ──────────────────────────────────────────────────────────

const C = {
  bg: '#050505',
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
} as const;

// ── Utility helpers ────────────────────────────────────────────────────────

function pct(v: number): string {
  return `${Math.round(Math.min(1, Math.max(0, v)) * 100)}%`;
}

function fmtPct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// ── Sub-components ─────────────────────────────────────────────────────────

interface LabelProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
}

function Label({ children, style }: LabelProps) {
  return (
    <span style={{
      fontSize: '0.62rem',
      fontWeight: 600,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      color: C.muted,
      ...style,
    }}>
      {children}
    </span>
  );
}

interface HBarProps {
  value: number;       // 0–1
  color?: string;
  height?: number;
  showPct?: boolean;
  label?: string;
}

function HBar({ value, color = C.violet, height = 4, showPct = false, label }: HBarProps) {
  const clamped = Math.min(1, Math.max(0, value));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {label && (
        <span style={{ fontSize: '0.72rem', color: C.muted, width: 110, flexShrink: 0 }}>
          {label}
        </span>
      )}
      <div style={{
        flex: 1,
        height,
        background: C.inset,
        borderRadius: height,
        overflow: 'hidden',
        border: `1px solid ${C.borderSubtle}`,
      }}>
        <div style={{
          width: pct(clamped),
          height: '100%',
          background: color,
          borderRadius: height,
          transition: 'width 600ms cubic-bezier(0.4,0,0.2,1)',
        }} />
      </div>
      {showPct && (
        <span style={{ fontSize: '0.72rem', color: C.muted, width: 34, textAlign: 'right', flexShrink: 0 }}>
          {fmtPct(clamped)}
        </span>
      )}
    </div>
  );
}

interface CircleProgressProps {
  value: number;   // 0–1
  size?: number;
  strokeWidth?: number;
  color?: string;
  label?: string;
}

function CircleProgress({ value, size = 64, strokeWidth = 5, color = C.violet, label }: CircleProgressProps) {
  const clamped = Math.min(1, Math.max(0, value));
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - clamped);
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={C.inset}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(0.4,0,0.2,1)' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 2,
      }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: C.text, lineHeight: 1 }}>
          {fmtPct(clamped)}
        </span>
        {label && (
          <span style={{ fontSize: '0.5rem', color: C.dim, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {label}
          </span>
        )}
      </div>
    </div>
  );
}

interface ChipProps {
  children: React.ReactNode;
  color?: string;
  style?: React.CSSProperties;
}

function Chip({ children, color = C.violet, style }: ChipProps) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 7px',
      borderRadius: 4,
      fontSize: '0.62rem',
      fontWeight: 600,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      background: `${color}18`,
      color,
      border: `1px solid ${color}30`,
      ...style,
    }}>
      {children}
    </span>
  );
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

function Section({ title, children, style }: SectionProps) {
  return (
    <div style={{
      background: C.inset,
      border: `1px solid ${C.border}`,
      borderRadius: 10,
      padding: '14px 16px',
      ...style,
    }}>
      <div style={{ marginBottom: 12 }}>
        <Label>{title}</Label>
      </div>
      {children}
    </div>
  );
}

interface KVRowProps {
  label: string;
  value: React.ReactNode;
}

function KVRow({ label, value }: KVRowProps) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '5px 0',
      borderBottom: `1px solid ${C.borderSubtle}`,
    }}>
      <span style={{ fontSize: '0.75rem', color: C.muted }}>{label}</span>
      <span style={{ fontSize: '0.75rem', color: C.text, fontWeight: 500, textAlign: 'right', maxWidth: 180 }}>
        {value}
      </span>
    </div>
  );
}

// ── Tab 1: Overview ────────────────────────────────────────────────────────

const MODES: { id: ResonanceMode; label: string; description: string }[] = [
  { id: 'writing-match', label: 'Writing Match', description: 'Mirror your writing style and voice' },
  { id: 'reasoning-match', label: 'Reasoning Match', description: 'Align with your reasoning architecture' },
  { id: 'identity-aligned', label: 'Identity Aligned', description: 'Adapt to your core identity patterns' },
  { id: 'refined-self', label: 'Refined Self', description: 'Elevate toward your optimal expression' },
];

interface OverviewTabProps {
  resonance: ReturnType<typeof useAtlasStore.getState>['resonance'];
  onToggleLearning: () => void;
  onSetMode: (m: ResonanceMode) => void;
}

function OverviewTab({ resonance, onToggleLearning, onSetMode }: OverviewTabProps) {
  const { model, activeMode, isLearning, adaptiveProfile } = resonance;
  const posture = adaptiveProfile.currentPosture;

  const postureEntries: { key: keyof typeof posture; label: string; color: string }[] = [
    { key: 'depth', label: 'Depth', color: C.violet },
    { key: 'challenge', label: 'Challenge', color: C.danger },
    { key: 'precision', label: 'Precision', color: C.indigo },
    { key: 'warmth', label: 'Warmth', color: C.gold },
    { key: 'directness', label: 'Directness', color: C.amber },
    { key: 'abstractionBias', label: 'Abstraction Bias', color: C.success },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'atlas-fade-in 300ms ease both' }}>
      {/* Mode selector */}
      <Section title="Active Resonance Mode">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {MODES.map((m) => {
            const active = activeMode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => onSetMode(m.id)}
                style={{
                  background: active ? `rgba(167,139,250,0.12)` : C.inset,
                  border: `1px solid ${active ? C.violet : C.border}`,
                  borderRadius: 8,
                  padding: '10px 12px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 200ms ease',
                  outline: 'none',
                }}
              >
                <div style={{
                  fontSize: '0.75rem', fontWeight: 600, color: active ? C.violet : C.text,
                  marginBottom: 3,
                }}>
                  {m.label}
                </div>
                <div style={{ fontSize: '0.68rem', color: C.muted, lineHeight: 1.4 }}>
                  {m.description}
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      {/* Learning toggle + confidence row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* Learning toggle */}
        <div style={{
          background: C.inset,
          border: `1px solid ${isLearning ? 'rgba(234,179,8,0.3)' : C.border}`,
          borderRadius: 10,
          padding: '14px 16px',
          boxShadow: isLearning ? '0 0 18px rgba(234,179,8,0.08)' : 'none',
          transition: 'all 300ms ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <Label>Learning</Label>
            <button
              onClick={onToggleLearning}
              style={{
                width: 36, height: 20,
                background: isLearning ? C.amber : C.border,
                borderRadius: 10,
                border: 'none',
                cursor: 'pointer',
                position: 'relative',
                transition: 'background 250ms ease',
                flexShrink: 0,
              }}
            >
              <div style={{
                position: 'absolute',
                top: 3, left: isLearning ? 19 : 3,
                width: 14, height: 14,
                borderRadius: '50%',
                background: '#fff',
                transition: 'left 250ms ease',
              }} />
            </button>
          </div>
          <div style={{ fontSize: '0.78rem', color: isLearning ? C.amber : C.muted, fontWeight: isLearning ? 600 : 400 }}>
            {isLearning ? 'Actively learning' : 'Learning paused'}
          </div>
          <div style={{ fontSize: '0.68rem', color: C.dim, marginTop: 4 }}>
            {isLearning
              ? 'Atlas observes and updates your cognitive signature in real time.'
              : 'Model is frozen — no new observations are incorporated.'}
          </div>
        </div>

        {/* Model confidence */}
        <div style={{
          background: C.inset,
          border: `1px solid ${C.border}`,
          borderRadius: 10,
          padding: '14px 16px',
        }}>
          <Label style={{ display: 'block', marginBottom: 10 }}>Model Confidence</Label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <CircleProgress
              value={model.confidence}
              size={60}
              color={model.confidence > 0.65 ? C.success : model.confidence > 0.35 ? C.amber : C.danger}
              label="conf"
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.72rem', color: C.muted, marginBottom: 6 }}>
                {model.sampleCount} samples collected
              </div>
              <div style={{ fontSize: '0.68rem', color: C.dim }}>
                Last updated {relativeTime(model.lastUpdated)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Adaptive posture */}
      <Section title="Adaptive Response Posture">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {postureEntries.map(({ key, label, color }) => (
            <HBar key={key} label={label} value={posture[key]} color={color} showPct height={5} />
          ))}
        </div>
      </Section>

      {/* Stability + meta */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* Stability */}
        <div style={{
          background: C.inset,
          border: `1px solid ${C.border}`,
          borderRadius: 10,
          padding: '14px 16px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <Label>Profile Stability</Label>
          <CircleProgress
            value={adaptiveProfile.stabilityScore}
            size={72}
            strokeWidth={6}
            color={adaptiveProfile.stabilityScore > 0.7 ? C.success : adaptiveProfile.stabilityScore > 0.4 ? C.amber : C.danger}
            label="stability"
          />
          <div style={{ fontSize: '0.68rem', color: C.dim, textAlign: 'center' }}>
            {adaptiveProfile.stabilityScore > 0.7
              ? 'Highly stable cognitive signature'
              : adaptiveProfile.stabilityScore > 0.4
              ? 'Signature stabilizing'
              : 'Still calibrating'}
          </div>
        </div>

        {/* Meta stats */}
        <div style={{
          background: C.inset,
          border: `1px solid ${C.border}`,
          borderRadius: 10,
          padding: '14px 16px',
        }}>
          <Label style={{ display: 'block', marginBottom: 12 }}>Adaptation Stats</Label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: C.violet, lineHeight: 1 }}>
                {adaptiveProfile.adaptationCount}
              </div>
              <div style={{ fontSize: '0.68rem', color: C.muted, marginTop: 2 }}>total adaptations</div>
            </div>
            <div style={{ borderTop: `1px solid ${C.borderSubtle}`, paddingTop: 8 }}>
              <div style={{ fontSize: '0.72rem', color: C.muted }}>Last adapted</div>
              <div style={{ fontSize: '0.75rem', color: C.text, marginTop: 2 }}>
                {relativeTime(adaptiveProfile.lastAdaptedAt)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tab 2: Cognitive Model ─────────────────────────────────────────────────

interface CognitiveModelTabProps {
  model: ReturnType<typeof useAtlasStore.getState>['resonance']['model'];
}

function CognitiveModelTab({ model }: CognitiveModelTabProps) {
  const { writingStructure: ws, reasoningArchitecture: ra, emotionalExpression: ee, decisionExpression: de } = model;

  const eeEntries: { key: keyof typeof ee; label: string; color: string }[] = [
    { key: 'restraint', label: 'Restraint', color: C.indigo },
    { key: 'warmth', label: 'Warmth', color: C.gold },
    { key: 'intensity', label: 'Intensity', color: C.danger },
    { key: 'skepticism', label: 'Skepticism', color: C.amber },
    { key: 'assertiveness', label: 'Assertiveness', color: C.violet },
    { key: 'reflection', label: 'Reflection', color: C.success },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'atlas-fade-in 300ms ease both' }}>
      {/* Header meta */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: C.inset,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: '12px 16px',
      }}>
        <div>
          <Label>Cognitive Signature Model</Label>
          <div style={{ fontSize: '0.72rem', color: C.muted, marginTop: 4 }}>
            Derived from {model.sampleCount} observed interactions
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.72rem', color: C.muted }}>Last updated</div>
          <div style={{ fontSize: '0.75rem', color: C.text, marginTop: 2 }}>{formatDate(model.lastUpdated)}</div>
        </div>
      </div>

      {/* Writing Structure */}
      <Section title="Writing Structure">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <KVRow label="Sentence length" value={<Chip color={C.violet}>{ws.sentenceLength}</Chip>} />
          <KVRow label="Paragraph density" value={<Chip color={C.indigo}>{ws.paragraphDensity}</Chip>} />
          <KVRow label="Vocabulary range" value={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 100 }}>
              <HBar value={ws.vocabularyRange} color={C.gold} height={4} />
              <span style={{ fontSize: '0.72rem', color: C.muted, width: 32 }}>{fmtPct(ws.vocabularyRange)}</span>
            </div>
          } />
          <KVRow label="Rhythm" value={ws.rhythm} />
          <KVRow label="Directness" value={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 100 }}>
              <HBar value={ws.directness} color={C.amber} height={4} />
              <span style={{ fontSize: '0.72rem', color: C.muted, width: 32 }}>{fmtPct(ws.directness)}</span>
            </div>
          } />
          <KVRow label="Formality" value={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 100 }}>
              <HBar value={ws.formality} color={C.violet} height={4} />
              <span style={{ fontSize: '0.72rem', color: C.muted, width: 32 }}>{fmtPct(ws.formality)}</span>
            </div>
          } />
          {ws.punctuationHabits.length > 0 && (
            <KVRow label="Punctuation habits" value={
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {ws.punctuationHabits.map((h, i) => (
                  <Chip key={i} color={C.dim}>{h}</Chip>
                ))}
              </div>
            } />
          )}
        </div>
      </Section>

      {/* Reasoning Architecture */}
      <Section title="Reasoning Architecture">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <KVRow label="Progression" value={<Chip color={C.violet}>{ra.progression}</Chip>} />
          <KVRow label="Entry point" value={<Chip color={C.indigo}>{ra.entryPoint}</Chip>} />
          <KVRow label="Primary driver" value={<Chip color={C.gold}>{ra.primaryDriver}</Chip>} />
          <KVRow label="Density" value={<Chip color={C.amber}>{ra.density}</Chip>} />
          <KVRow label="Methodology" value={<Chip color={C.success}>{ra.methodology}</Chip>} />
          <KVRow label="Framing" value={<Chip color={C.indigo}>{ra.framing}</Chip>} />
          <KVRow label="Intent" value={<Chip color={C.violet}>{ra.intent}</Chip>} />
          <KVRow label="Epistemic stance" value={<Chip color={C.danger}>{ra.epistemicStance}</Chip>} />
          <KVRow label="Temporal focus" value={<Chip color={C.gold}>{ra.temporalFocus}</Chip>} />
          <KVRow label="Abstraction level" value={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 100 }}>
              <HBar value={ra.abstractionLevel} color={C.violet} height={4} />
              <span style={{ fontSize: '0.72rem', color: C.muted, width: 32 }}>{fmtPct(ra.abstractionLevel)}</span>
            </div>
          } />
        </div>
      </Section>

      {/* Emotional Expression */}
      <Section title="Emotional Expression">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {eeEntries.map(({ key, label, color }) => (
            <HBar key={key} label={label} value={ee[key]} color={color} showPct height={5} />
          ))}
        </div>
      </Section>

      {/* Decision Expression */}
      <Section title="Decision Expression">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginBottom: 12 }}>
          <KVRow label="Judgment style" value={
            <Chip color={C.violet}>{de.judgmentStyle}</Chip>
          } />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <HBar label="Conviction" value={de.convictionLevel} color={C.violet} showPct height={5} />
          <HBar label="Risk tolerance" value={de.riskTolerance} color={C.danger} showPct height={5} />
          <HBar label="Tradeoff awareness" value={de.tradeoffAwareness} color={C.gold} showPct height={5} />
        </div>
      </Section>
    </div>
  );
}

// ── Tab 3: Profiles ────────────────────────────────────────────────────────

interface ProfilesTabProps {
  profiles: ResonanceProfile[];
}

function ProfileCard({ profile }: { profile: ResonanceProfile }) {
  const confidenceColor = profile.confidence > 0.65 ? C.success : profile.confidence > 0.35 ? C.indigo : C.amber;

  return (
    <div style={{
      background: C.inset,
      border: `1px solid ${C.border}`,
      borderRadius: 10,
      padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: '0.82rem', fontWeight: 600, color: C.text, marginBottom: 3 }}>
            {profile.dimension}
          </div>
          <div style={{ fontSize: '0.68rem', color: C.dim }}>
            {profile.evidenceCount} evidence · updated {relativeTime(profile.lastUpdated)}
          </div>
        </div>
        <Chip color={confidenceColor}>
          {profile.confidence > 0.65 ? 'high' : profile.confidence > 0.35 ? 'medium' : 'low'}
        </Chip>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.68rem', color: C.muted, width: 70, flexShrink: 0 }}>VALUE</span>
          <HBar value={profile.value} color={C.violet} height={5} showPct />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.68rem', color: C.muted, width: 70, flexShrink: 0 }}>CONFIDENCE</span>
          <HBar value={profile.confidence} color={confidenceColor} height={5} showPct />
        </div>
      </div>
    </div>
  );
}

function ProfilesTab({ profiles }: ProfilesTabProps) {
  if (profiles.length === 0) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minHeight: 220, gap: 10, animation: 'atlas-fade-in 300ms ease both',
      }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={C.dim} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4" /><path d="M12 16h.01" />
        </svg>
        <div style={{ fontSize: '0.82rem', color: C.muted, textAlign: 'center' }}>
          No dimension profiles yet.<br />
          <span style={{ color: C.dim, fontSize: '0.72rem' }}>Profiles emerge as Atlas observes your patterns.</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, animation: 'atlas-fade-in 300ms ease both' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <Label>{profiles.length} dimension{profiles.length !== 1 ? 's' : ''} tracked</Label>
      </div>
      {profiles.map((p) => (
        <ProfileCard key={p.id} profile={p} />
      ))}
    </div>
  );
}

// ── Tab 4: Observation Log ─────────────────────────────────────────────────

interface ObservationLogTabProps {
  observations: ResonanceObservation[];
}

function ObservationCard({ obs }: { obs: ResonanceObservation }) {
  const [expanded, setExpanded] = useState(false);
  const strengthColor = obs.strength > 0.1 ? C.success : obs.strength < -0.1 ? C.danger : C.dim;
  const strengthLabel = obs.strength > 0.1 ? 'positive' : obs.strength < -0.1 ? 'negative' : 'neutral';
  const absStrength = Math.abs(obs.strength);

  return (
    <div style={{
      background: C.inset,
      border: `1px solid ${C.border}`,
      borderRadius: 10,
      padding: '12px 14px',
      cursor: 'pointer',
      transition: 'border-color 180ms ease',
    }}
      onClick={() => setExpanded((e) => !e)}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        {/* Strength indicator */}
        <div style={{
          width: 3, borderRadius: 2, flexShrink: 0,
          background: strengthColor,
          alignSelf: 'stretch',
          minHeight: 36,
          opacity: 0.5 + absStrength * 0.5,
        }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Top row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
            <Chip color={C.indigo}>{obs.dimension}</Chip>
            <Chip color={strengthColor}>{strengthLabel}</Chip>
            {obs.sessionId && (
              <span style={{ fontSize: '0.62rem', color: C.dim }}>session {obs.sessionId.slice(0, 6)}</span>
            )}
            <span style={{ fontSize: '0.65rem', color: C.dim, marginLeft: 'auto' }}>
              {relativeTime(obs.timestamp)}
            </span>
          </div>

          {/* Signal */}
          <div style={{ fontSize: '0.78rem', color: C.text, lineHeight: 1.5, marginBottom: 6 }}>
            {obs.signal}
          </div>

          {/* Strength bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.62rem', color: C.dim, width: 50, flexShrink: 0 }}>strength</span>
            <div style={{ flex: 1, height: 3, background: C.panel, borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                width: pct(absStrength),
                height: '100%',
                background: strengthColor,
                borderRadius: 2,
                transition: 'width 500ms ease',
              }} />
            </div>
            <span style={{ fontSize: '0.62rem', color: strengthColor, width: 32, textAlign: 'right' }}>
              {obs.strength > 0 ? '+' : ''}{obs.strength.toFixed(2)}
            </span>
          </div>

          {/* Expandable context */}
          {expanded && obs.context && (
            <div style={{
              marginTop: 10,
              padding: '8px 10px',
              background: C.panel,
              border: `1px solid ${C.borderSubtle}`,
              borderRadius: 6,
              fontSize: '0.72rem',
              color: C.muted,
              lineHeight: 1.6,
              animation: 'atlas-fade-in 200ms ease both',
            }}>
              <Label style={{ display: 'block', marginBottom: 5 }}>Context</Label>
              {obs.context}
            </div>
          )}

          {obs.context && (
            <div style={{
              fontSize: '0.62rem', color: C.dim, marginTop: 4,
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {expanded
                  ? <path d="M18 15l-6-6-6 6" />
                  : <path d="M6 9l6 6 6-6" />}
              </svg>
              {expanded ? 'hide context' : 'show context'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ObservationLogTab({ observations }: ObservationLogTabProps) {
  const sorted = useMemo(
    () => [...observations].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [observations]
  );

  if (sorted.length === 0) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minHeight: 220, gap: 10, animation: 'atlas-fade-in 300ms ease both',
      }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={C.dim} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        <div style={{ fontSize: '0.82rem', color: C.muted, textAlign: 'center' }}>
          No observations recorded yet.<br />
          <span style={{ color: C.dim, fontSize: '0.72rem' }}>Atlas logs signals as it encounters your patterns.</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, animation: 'atlas-fade-in 300ms ease both' }}>
      <div style={{ marginBottom: 4 }}>
        <Label>{sorted.length} observation{sorted.length !== 1 ? 's' : ''}</Label>
      </div>
      {sorted.map((obs) => (
        <ObservationCard key={obs.id} obs={obs} />
      ))}
    </div>
  );
}

// ── Tab 5: Adjustment History ──────────────────────────────────────────────

interface AdjustmentHistoryTabProps {
  adjustmentLog: ResonanceAdjustmentLog[];
}

function AdjustmentEntry({ entry }: { entry: ResonanceAdjustmentLog }) {
  const positive = entry.delta > 0;
  const deltaColor = positive ? C.success : C.danger;
  const deltaSign = positive ? '+' : '';

  return (
    <div style={{
      background: C.inset,
      border: `1px solid ${C.border}`,
      borderRadius: 10,
      padding: '12px 14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: C.text, marginBottom: 3 }}>
            {entry.dimension}
          </div>
          <div style={{ fontSize: '0.68rem', color: C.dim }}>
            {relativeTime(entry.timestamp)}
          </div>
        </div>
        {/* Value change */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: '0.75rem', color: C.muted }}>
            {fmtPct(entry.previousValue)}
          </span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={deltaColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
          <span style={{ fontSize: '0.75rem', color: C.text, fontWeight: 600 }}>
            {fmtPct(entry.newValue)}
          </span>
          <span style={{
            fontSize: '0.72rem', fontWeight: 700, color: deltaColor,
            background: `${deltaColor}15`, border: `1px solid ${deltaColor}30`,
            borderRadius: 4, padding: '1px 5px',
          }}>
            {deltaSign}{fmtPct(Math.abs(entry.delta))}
          </span>
        </div>
      </div>

      {/* Value bars */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.62rem', color: C.dim, width: 48, flexShrink: 0 }}>BEFORE</span>
          <HBar value={entry.previousValue} color={C.dim} height={4} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.62rem', color: C.dim, width: 48, flexShrink: 0 }}>AFTER</span>
          <HBar value={entry.newValue} color={deltaColor} height={4} />
        </div>
      </div>

      {/* Trigger + confidence */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: '0.68rem', color: C.dim }}>Trigger: </span>
          <span style={{ fontSize: '0.72rem', color: C.muted }}>{entry.trigger}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          <span style={{ fontSize: '0.62rem', color: C.dim }}>conf</span>
          <div style={{ width: 40, height: 3, background: C.panel, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              width: pct(entry.confidence),
              height: '100%',
              background: entry.confidence > 0.65 ? C.success : entry.confidence > 0.35 ? C.amber : C.danger,
              borderRadius: 2,
            }} />
          </div>
          <span style={{ fontSize: '0.62rem', color: C.muted }}>{fmtPct(entry.confidence)}</span>
        </div>
      </div>
    </div>
  );
}

function AdjustmentHistoryTab({ adjustmentLog }: AdjustmentHistoryTabProps) {
  const sorted = useMemo(
    () => [...adjustmentLog].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [adjustmentLog]
  );

  if (sorted.length === 0) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minHeight: 220, gap: 10, animation: 'atlas-fade-in 300ms ease both',
      }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={C.dim} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
        <div style={{ fontSize: '0.82rem', color: C.muted, textAlign: 'center' }}>
          No adjustments recorded yet.<br />
          <span style={{ color: C.dim, fontSize: '0.72rem' }}>Model adjustments appear here as Atlas refines your signature.</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, animation: 'atlas-fade-in 300ms ease both' }}>
      <div style={{ marginBottom: 4 }}>
        <Label>{sorted.length} adjustment{sorted.length !== 1 ? 's' : ''} logged</Label>
      </div>
      {sorted.map((entry) => (
        <AdjustmentEntry key={entry.id} entry={entry} />
      ))}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

type TabId = 'overview' | 'cognitive' | 'profiles' | 'observations' | 'adjustments';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
      </svg>
    ),
  },
  {
    id: 'cognitive',
    label: 'Cognitive Model',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" />
        <circle cx="12" cy="12" r="10" />
      </svg>
    ),
  },
  {
    id: 'profiles',
    label: 'Profiles',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    id: 'observations',
    label: 'Observation Log',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    id: 'adjustments',
    label: 'Adjustments',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
];

export default function ResonanceChamber() {
  const resonance = useAtlasStore((s) => s.resonance);
  const toggleResonanceLearning = useAtlasStore((s) => s.toggleResonanceLearning);
  const setResonanceMode = useAtlasStore((s) => s.setResonanceMode);

  const [activeTab, setActiveTab] = useState<TabId>('overview');

  const handleSetMode = useCallback((m: ResonanceMode) => {
    setResonanceMode(m);
  }, [setResonanceMode]);

  return (
    <div style={{
      minHeight: '100vh',
      background: C.bg,
      fontFamily: "'Inter', sans-serif",
      color: C.text,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Chamber Header */}
      <div style={{
        padding: '28px 32px 0',
        background: C.panel,
        borderBottom: `1px solid ${C.border}`,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            {/* Icon + title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <div style={{
                width: 36, height: 36,
                background: 'rgba(167,139,250,0.1)',
                border: `1px solid rgba(167,139,250,0.2)`,
                borderRadius: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.violet} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10" />
                  <path d="M12 6v6l4 2" />
                  <circle cx="18" cy="6" r="3" />
                </svg>
              </div>
              <div>
                <h1 style={{
                  margin: 0,
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  color: C.text,
                  letterSpacing: '-0.01em',
                }}>
                  Resonance
                </h1>
                <p style={{
                  margin: 0,
                  fontSize: '0.78rem',
                  color: C.muted,
                  marginTop: 2,
                }}>
                  Adaptive alignment — how Atlas learns your cognitive signature
                </p>
              </div>
            </div>
          </div>

          {/* Status pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 }}>
            {resonance.isLearning && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '4px 10px',
                background: 'rgba(234,179,8,0.08)',
                border: `1px solid rgba(234,179,8,0.2)`,
                borderRadius: 20,
                animation: 'atlas-fade-in 300ms ease both',
              }}>
                <div style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: C.amber,
                  boxShadow: `0 0 6px ${C.amber}`,
                  animation: 'pulse 2s ease infinite',
                }} />
                <span style={{ fontSize: '0.68rem', fontWeight: 600, color: C.amber, letterSpacing: '0.08em' }}>
                  LEARNING
                </span>
              </div>
            )}
            <div style={{
              padding: '4px 10px',
              background: C.inset,
              border: `1px solid ${C.border}`,
              borderRadius: 20,
            }}>
              <span style={{ fontSize: '0.68rem', color: C.muted }}>
                Confidence: <span style={{ color: C.text, fontWeight: 600 }}>{fmtPct(resonance.model.confidence)}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 2, overflowX: 'auto' }}>
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: `2px solid ${active ? C.violet : 'transparent'}`,
                  cursor: 'pointer',
                  color: active ? C.violet : C.muted,
                  fontSize: '0.78rem',
                  fontWeight: active ? 600 : 400,
                  fontFamily: "'Inter', sans-serif",
                  whiteSpace: 'nowrap',
                  transition: 'color 180ms ease, border-color 180ms ease',
                  marginBottom: -1,
                  outline: 'none',
                }}
              >
                <span style={{ opacity: active ? 1 : 0.6 }}>{tab.icon}</span>
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '24px 32px',
      }}>
        <div style={{ maxWidth: 780, margin: '0 auto' }}>
          {activeTab === 'overview' && (
            <OverviewTab
              resonance={resonance}
              onToggleLearning={toggleResonanceLearning}
              onSetMode={handleSetMode}
            />
          )}
          {activeTab === 'cognitive' && (
            <CognitiveModelTab model={resonance.model} />
          )}
          {activeTab === 'profiles' && (
            <ProfilesTab profiles={resonance.profiles} />
          )}
          {activeTab === 'observations' && (
            <ObservationLogTab observations={resonance.observations} />
          )}
          {activeTab === 'adjustments' && (
            <AdjustmentHistoryTab adjustmentLog={resonance.adjustmentLog} />
          )}
        </div>
      </div>
    </div>
  );
}
