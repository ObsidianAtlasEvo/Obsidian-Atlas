/**
 * SovereignConsole.tsx
 * The creator-only control panel for Obsidian Atlas.
 * Accessible ONLY when session.user.email === 'crowleyrc62@gmail.com'.
 *
 * Six tabs:
 *   1. Command Center  — system status, quick actions, live log stream
 *   2. Prompt Forge    — system prompt editor with version history + diff
 *   3. Feature Flags   — toggle engine flags stored in Supabase
 *   4. User Observatory — all users, evolution profiles, mind profiles
 *   5. Bug Hunter      — bug queue management for the creator
 *   6. Publish         — changelog, semver release, deploy pipeline
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { SovereignExplainabilityTab } from './explainability/SovereignExplainabilityTab';
import {
  useSovereignStore,
  type SovereignTab,
  type BugSeverity,
  type BugStatus,
  type FeatureFlag,
  type UserSummary,
  type BugReport,
  type Release,
  type PromptVersion,
} from '../store/useSovereignStore';

// ─── Atlas Store (stub — replace with actual import) ──────────────────────────

interface AtlasUser {
  email: string;
  userId: string;
  displayName?: string;
}

// Replace this with your real useAtlasStore hook
function useAtlasStore(): { user: AtlasUser | null } {
  // Stub: In production, import from '../store/useAtlasStore'
  return { user: null };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SOVEREIGN_EMAIL = 'crowleyrc62@gmail.com';

const TABS: { id: SovereignTab; label: string; short: string }[] = [
  { id: 'command', label: 'Command Center', short: 'CMD' },
  { id: 'prompt', label: 'Prompt Forge', short: 'FORGE' },
  { id: 'flags', label: 'Feature Flags', short: 'FLAGS' },
  { id: 'users', label: 'User Observatory', short: 'USERS' },
  { id: 'explainability', label: 'Explainability', short: 'WHY' },
  { id: 'bugs', label: 'Bug Hunter', short: 'BUGS' },
  { id: 'publish', label: 'Publish', short: 'DEPLOY' },
];

// ─── Colours (sovereign palette) ─────────────────────────────────────────────

const C = {
  bg: '#0a0a0c',
  surface: '#0f0f12',
  surfaceAlt: '#13131a',
  border: 'rgba(255,255,255,0.07)',
  borderRed: 'rgba(220,38,38,0.4)',
  borderGold: 'rgba(212,175,55,0.3)',
  red: '#dc2626',
  redDim: 'rgba(220,38,38,0.12)',
  gold: '#d4af37',
  goldDim: 'rgba(212,175,55,0.1)',
  teal: '#14b8a6',
  tealDim: 'rgba(20,184,166,0.1)',
  textPrimary: '#f9fafb',
  textSecondary: 'rgba(255,255,255,0.55)',
  textMuted: 'rgba(255,255,255,0.3)',
};

// ─── Shared Styles ────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: `1px solid ${C.border}`,
  borderRadius: '0.375rem',
  padding: '0.5rem 0.75rem',
  color: C.textPrimary,
  fontSize: '0.875rem',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  color: C.textMuted,
  fontSize: '0.6875rem',
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  marginBottom: '0.375rem',
};

function GoldButton({
  onClick,
  children,
  disabled,
  small,
  danger,
  teal,
}: {
  onClick?: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  small?: boolean;
  danger?: boolean;
  teal?: boolean;
}) {
  const accent = danger ? '#dc2626' : teal ? C.teal : C.gold;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: small ? '0.375rem 0.75rem' : '0.5rem 1.125rem',
        borderRadius: '0.375rem',
        background: disabled ? 'rgba(255,255,255,0.04)' : `${accent}18`,
        border: `1px solid ${disabled ? C.border : `${accent}55`}`,
        color: disabled ? C.textMuted : accent,
        fontSize: small ? '0.75rem' : '0.8125rem',
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.15s ease',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        color: C.red,
        fontSize: '0.6875rem',
        fontWeight: 700,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        marginBottom: '0.875rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
      }}
    >
      <span
        style={{
          width: '1.5rem',
          height: '1px',
          background: C.red,
          opacity: 0.5,
          display: 'inline-block',
        }}
      />
      {children}
    </div>
  );
}

function Card({
  children,
  style,
  onClick,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
}) {
  return (
    <div
      style={{
        background: C.surfaceAlt,
        border: `1px solid ${C.border}`,
        borderRadius: '0.5rem',
        padding: '1rem',
        ...style,
      }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {children}
    </div>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: '0.5rem',
        height: '0.5rem',
        borderRadius: '50%',
        background: ok ? C.teal : C.red,
        boxShadow: `0 0 6px ${ok ? C.teal : C.red}`,
        flexShrink: 0,
      }}
    />
  );
}

function Spinner() {
  return (
    <span
      style={{
        display: 'inline-block',
        width: '0.875rem',
        height: '0.875rem',
        borderRadius: '50%',
        border: `2px solid rgba(212,175,55,0.2)`,
        borderTopColor: C.gold,
        animation: 'spin 0.7s linear infinite',
      }}
    />
  );
}

// ─── Simple line-diff ─────────────────────────────────────────────────────────

function computeDiff(
  prev: string,
  next: string
): Array<{ type: 'same' | 'added' | 'removed'; line: string }> {
  const prevLines = prev.split('\n');
  const nextLines = next.split('\n');
  const result: Array<{ type: 'same' | 'added' | 'removed'; line: string }> = [];

  const maxLen = Math.max(prevLines.length, nextLines.length);
  for (let i = 0; i < maxLen; i++) {
    const p = prevLines[i];
    const n = nextLines[i];
    if (p === undefined) {
      result.push({ type: 'added', line: n });
    } else if (n === undefined) {
      result.push({ type: 'removed', line: p });
    } else if (p !== n) {
      result.push({ type: 'removed', line: p });
      result.push({ type: 'added', line: n });
    } else {
      result.push({ type: 'same', line: p });
    }
  }
  return result;
}

// ─── Semver helpers ───────────────────────────────────────────────────────────

function parseSemver(v: string): [number, number, number] {
  const parts = v.replace(/^v/, '').split('.').map(Number);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function bumpVersion(v: string, part: 'major' | 'minor' | 'patch'): string {
  let [major, minor, patch] = parseSemver(v);
  if (part === 'major') { major++; minor = 0; patch = 0; }
  else if (part === 'minor') { minor++; patch = 0; }
  else patch++;
  return `${major}.${minor}.${patch}`;
}

// ─── Sovereign Denied Screen ──────────────────────────────────────────────────

function SovereignDenied() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#080808',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.5rem',
        zIndex: 9999,
      }}
    >
      {/* Atlas Logo mark */}
      <svg
        width="48"
        height="48"
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ opacity: 0.35 }}
      >
        <polygon
          points="24,4 44,36 4,36"
          stroke="#dc2626"
          strokeWidth="2"
          fill="none"
        />
        <line x1="24" y1="4" x2="24" y2="36" stroke="#dc2626" strokeWidth="1.5" opacity="0.5" />
        <line x1="4" y1="36" x2="44" y2="36" stroke="#dc2626" strokeWidth="1.5" opacity="0.5" />
      </svg>
      <div
        style={{
          color: C.red,
          fontSize: '0.8125rem',
          fontWeight: 700,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
        }}
      >
        RESTRICTED — SOVEREIGN ACCESS REQUIRED
      </div>
    </div>
  );
}

// ─── Guard ────────────────────────────────────────────────────────────────────

function SovereignGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAtlasStore();
  if (!user || user.email !== SOVEREIGN_EMAIL) {
    return <SovereignDenied />;
  }
  return <>{children}</>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 1: COMMAND CENTER
// ═══════════════════════════════════════════════════════════════════════════════

function CommandCenter() {
  const {
    systemStatus,
    systemStatusLoading,
    liveLogLines,
    loadSystemStatus,
    appendLiveLog,
    clearLiveLog,
    runQuickAction,
  } = useSovereignStore();

  const logRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  useEffect(() => {
    loadSystemStatus();
    const interval = setInterval(loadSystemStatus, 30_000);
    return () => clearInterval(interval);
  }, [loadSystemStatus]);

  useEffect(() => {
    // Connect to live log SSE
    const es = new EventSource('/api/sovereign/logs', { withCredentials: true });
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const { line } = JSON.parse(e.data) as { line: string };
        appendLiveLog(line);
      } catch {
        appendLiveLog(e.data);
      }
    };
    es.onerror = () => {
      appendLiveLog('[sovereign] Log stream disconnected. Reconnecting...');
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [appendLiveLog]);

  // Auto-scroll log to bottom
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [liveLogLines]);

  const quickAction = async (action: 'rebuild' | 'clearBuffers' | 'recalibrate') => {
    setActionInProgress(action);
    await runQuickAction(action);
    setActionInProgress(null);
  };

  const s = systemStatus;
  const memPct = s ? Math.round((s.memoryUsageMB / s.memoryTotalMB) * 100) : 0;
  const uptime = s
    ? `${Math.floor(s.uptime / 3600)}h ${Math.floor((s.uptime % 3600) / 60)}m`
    : '—';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Status Metrics */}
      <div>
        <SectionTitle>System Status</SectionTitle>
        {systemStatusLoading && !s ? (
          <div style={{ color: C.textMuted, fontSize: '0.875rem' }}>Loading...</div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              gap: '0.75rem',
            }}
          >
            {[
              { label: 'Backend', value: s?.healthy ? 'Online' : 'Degraded', ok: s?.healthy ?? false, metric: true },
              { label: 'Groq API', value: s?.groqApiStatus ?? '—', ok: s?.groqApiStatus === 'online', metric: true },
              { label: 'Uptime', value: uptime, ok: true, metric: false },
              { label: 'Memory', value: s ? `${s.memoryUsageMB} MB (${memPct}%)` : '—', ok: memPct < 80, metric: false },
              { label: 'Avg Response', value: s ? `${s.avgResponseTimeMs}ms` : '—', ok: (s?.avgResponseTimeMs ?? 0) < 2000, metric: false },
              { label: 'Active Users (24h)', value: s?.activeUsersLast24h?.toString() ?? '—', ok: true, metric: false },
              { label: 'Evolution Profiles', value: s?.totalEvolutionProfiles?.toString() ?? '—', ok: true, metric: false },
              { label: 'Overseer Queue', value: s?.overseerQueueDepth?.toString() ?? '—', ok: (s?.overseerQueueDepth ?? 0) < 100, metric: false },
            ].map(({ label, value, ok, metric }) => (
              <Card key={label}>
                <div style={{ color: C.textMuted, fontSize: '0.6875rem', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.375rem' }}>
                  {label}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {metric && <StatusDot ok={ok} />}
                  <span style={{ color: ok ? C.textPrimary : C.red, fontSize: '0.9375rem', fontWeight: 600 }}>
                    {value}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div>
        <SectionTitle>Quick Actions</SectionTitle>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {[
            { id: 'rebuild' as const, label: 'Rebuild All Evolution Profiles' },
            { id: 'clearBuffers' as const, label: 'Clear Signal Buffers' },
            { id: 'recalibrate' as const, label: 'Force Overseer Recalibration' },
          ].map(({ id, label }) => (
            <GoldButton
              key={id}
              onClick={() => quickAction(id)}
              disabled={actionInProgress !== null}
            >
              {actionInProgress === id ? '...' : label}
            </GoldButton>
          ))}
        </div>
      </div>

      {/* Live Log Stream */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
          <SectionTitle>Live Log Stream</SectionTitle>
          <GoldButton small onClick={clearLiveLog}>Clear</GoldButton>
        </div>
        <div
          ref={logRef}
          style={{
            background: '#080808',
            border: `1px solid ${C.border}`,
            borderRadius: '0.5rem',
            padding: '0.75rem',
            height: '16rem',
            overflowY: 'auto',
            fontFamily: 'monospace',
            fontSize: '0.75rem',
            lineHeight: 1.6,
          }}
        >
          {liveLogLines.length === 0 ? (
            <span style={{ color: C.textMuted }}>Connecting to log stream...</span>
          ) : (
            liveLogLines.map((line, i) => (
              <div
                key={i}
                style={{
                  color: line.includes('[stderr]') || line.includes('ERROR')
                    ? '#f87171'
                    : line.includes('[sovereign]')
                    ? C.gold
                    : 'rgba(255,255,255,0.65)',
                  marginBottom: '0.125rem',
                  wordBreak: 'break-all',
                }}
              >
                {line}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 2: PROMPT FORGE
// ═══════════════════════════════════════════════════════════════════════════════

function PromptForge() {
  const {
    currentPrompt,
    promptVersion,
    promptHistory,
    promptDirty,
    promptSaving,
    testPromptResponse,
    testPromptLoading,
    loadPrompt,
    loadPromptHistory,
    setCurrentPrompt,
    savePrompt,
    testPrompt,
    rollbackPrompt,
    clearTestResponse,
  } = useSovereignStore();

  const [showDiff, setShowDiff] = useState(false);
  const [diffTarget, setDiffTarget] = useState<PromptVersion | null>(null);
  const [testQuery, setTestQuery] = useState('Hello Atlas. Who are you?');
  const [showTest, setShowTest] = useState(false);

  useEffect(() => {
    loadPrompt();
    loadPromptHistory();
  }, [loadPrompt, loadPromptHistory]);

  const diff = useMemo(() => {
    if (!showDiff || !diffTarget) return null;
    return computeDiff(diffTarget.content, currentPrompt);
  }, [showDiff, diffTarget, currentPrompt]);

  const handleTest = () => {
    setShowTest(true);
    clearTestResponse();
    testPrompt(testQuery);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <SectionTitle>System Prompt</SectionTitle>
          <span style={{ color: C.textMuted, fontSize: '0.75rem', marginTop: '-0.875rem' }}>v{promptVersion}</span>
          {promptDirty && (
            <span style={{ color: C.gold, fontSize: '0.75rem', marginTop: '-0.875rem' }}>● unsaved</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <GoldButton small onClick={() => setShowTest(!showTest)}>
            Test Prompt
          </GoldButton>
          <GoldButton small onClick={savePrompt} disabled={promptSaving || !promptDirty} teal>
            {promptSaving ? 'Saving...' : 'Publish Prompt'}
          </GoldButton>
        </div>
      </div>

      {/* Editor + Test split */}
      <div style={{ display: 'grid', gridTemplateColumns: showTest ? '1fr 1fr' : '1fr', gap: '1rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label style={labelStyle}>Editor</label>
          <textarea
            value={currentPrompt}
            onChange={(e) => setCurrentPrompt(e.target.value)}
            spellCheck={false}
            style={{
              ...inputStyle,
              fontFamily: 'monospace',
              fontSize: '0.8125rem',
              minHeight: '22rem',
              resize: 'vertical',
              lineHeight: 1.7,
              tabSize: 2,
            }}
          />
        </div>

        {showTest && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={labelStyle}>Test Output</label>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <input
                type="text"
                value={testQuery}
                onChange={(e) => setTestQuery(e.target.value)}
                placeholder="Test query..."
                style={{ ...inputStyle, flex: 1 }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleTest(); }}
              />
              <GoldButton small onClick={handleTest} disabled={testPromptLoading}>
                {testPromptLoading ? <Spinner /> : 'Run'}
              </GoldButton>
            </div>
            <div
              style={{
                background: '#080808',
                border: `1px solid ${C.border}`,
                borderRadius: '0.375rem',
                padding: '0.875rem',
                fontFamily: 'monospace',
                fontSize: '0.8125rem',
                lineHeight: 1.7,
                color: testPromptResponse?.startsWith('Error:') ? '#f87171' : C.textPrimary,
                minHeight: '20rem',
                whiteSpace: 'pre-wrap',
                overflowY: 'auto',
              }}
            >
              {testPromptLoading ? (
                <span style={{ color: C.textMuted }}>Running test...</span>
              ) : testPromptResponse ? (
                testPromptResponse
              ) : (
                <span style={{ color: C.textMuted }}>Response appears here.</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Diff viewer */}
      {diff && diffTarget && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <label style={labelStyle}>Diff vs v{diffTarget.version}</label>
            <GoldButton small onClick={() => { setShowDiff(false); setDiffTarget(null); }}>Close Diff</GoldButton>
          </div>
          <div
            style={{
              background: '#080808',
              border: `1px solid ${C.border}`,
              borderRadius: '0.375rem',
              padding: '0.75rem',
              fontFamily: 'monospace',
              fontSize: '0.75rem',
              lineHeight: 1.7,
              maxHeight: '14rem',
              overflowY: 'auto',
            }}
          >
            {diff.map((row, i) => (
              <div
                key={i}
                style={{
                  color:
                    row.type === 'added'
                      ? '#4ade80'
                      : row.type === 'removed'
                      ? '#f87171'
                      : 'rgba(255,255,255,0.4)',
                  background:
                    row.type === 'added'
                      ? 'rgba(74,222,128,0.06)'
                      : row.type === 'removed'
                      ? 'rgba(248,113,113,0.06)'
                      : 'transparent',
                  padding: '0 0.25rem',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {row.type === 'added' ? '+ ' : row.type === 'removed' ? '- ' : '  '}
                {row.line}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Version History */}
      {promptHistory.length > 0 && (
        <div>
          <SectionTitle>Version History</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {promptHistory.map((v) => (
              <Card
                key={v.version}
                style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 1rem' }}
              >
                <span style={{ color: C.gold, fontSize: '0.75rem', fontWeight: 600, minWidth: '3rem' }}>
                  v{v.version}
                </span>
                <span style={{ color: C.textMuted, fontSize: '0.75rem', flexGrow: 1 }}>
                  {new Date(v.savedAt).toLocaleString()}
                </span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <GoldButton
                    small
                    onClick={() => {
                      setDiffTarget(v);
                      setShowDiff(true);
                    }}
                  >
                    Diff
                  </GoldButton>
                  <GoldButton
                    small
                    danger
                    onClick={() => rollbackPrompt(v.version)}
                  >
                    Rollback
                  </GoldButton>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 3: FEATURE FLAGS
// ═══════════════════════════════════════════════════════════════════════════════

function FeatureFlags() {
  const { featureFlags, flagsLoading, loadFlags, toggleFlag, addFlag, deleteFlag } =
    useSovereignStore();

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    loadFlags();
  }, [loadFlags]);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    await addFlag({
      name: newName.trim().toLowerCase().replace(/\s+/g, '_'),
      description: newDesc.trim(),
      enabled: false,
      affectedUsers: 'all',
    });
    setNewName('');
    setNewDesc('');
    setShowAdd(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <SectionTitle>Feature Flags</SectionTitle>
        <GoldButton small onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? 'Cancel' : '+ New Flag'}
        </GoldButton>
      </div>

      {showAdd && (
        <Card>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div>
              <label style={labelStyle}>Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="flag_name"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Description</label>
              <input
                type="text"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="What does this flag do?"
                style={inputStyle}
              />
            </div>
          </div>
          <GoldButton teal onClick={handleAdd} disabled={!newName.trim()}>
            Create Flag
          </GoldButton>
        </Card>
      )}

      {flagsLoading ? (
        <div style={{ color: C.textMuted, fontSize: '0.875rem' }}>Loading flags...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {featureFlags.map((flag: FeatureFlag) => (
            <Card
              key={flag.name}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '1rem',
                borderLeft: `3px solid ${flag.enabled ? C.teal : C.border}`,
                transition: 'border-color 0.2s ease',
              }}
            >
              {/* Toggle */}
              <button
                onClick={() => toggleFlag(flag.name, !flag.enabled)}
                aria-label={`Toggle ${flag.name}`}
                style={{
                  flexShrink: 0,
                  marginTop: '0.125rem',
                  width: '2.25rem',
                  height: '1.25rem',
                  borderRadius: '0.625rem',
                  background: flag.enabled ? C.teal : 'rgba(255,255,255,0.1)',
                  border: 'none',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'background 0.2s ease',
                  padding: 0,
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: '0.125rem',
                    left: flag.enabled ? 'calc(100% - 1.125rem)' : '0.125rem',
                    width: '1rem',
                    height: '1rem',
                    borderRadius: '50%',
                    background: 'white',
                    transition: 'left 0.2s ease',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                    display: 'block',
                  }}
                />
              </button>

              {/* Info */}
              <div style={{ flexGrow: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <span style={{ color: C.textPrimary, fontSize: '0.875rem', fontWeight: 600, fontFamily: 'monospace' }}>
                    {flag.name}
                  </span>
                  <span
                    style={{
                      fontSize: '0.625rem',
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      padding: '0.125rem 0.375rem',
                      borderRadius: '0.25rem',
                      background: flag.enabled ? C.tealDim : 'rgba(255,255,255,0.05)',
                      color: flag.enabled ? C.teal : C.textMuted,
                      border: `1px solid ${flag.enabled ? 'rgba(20,184,166,0.3)' : C.border}`,
                    }}
                  >
                    {flag.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <div style={{ color: C.textSecondary, fontSize: '0.8125rem', lineHeight: 1.5 }}>
                  {flag.description || 'No description.'}
                </div>
                <div style={{ color: C.textMuted, fontSize: '0.6875rem', marginTop: '0.25rem' }}>
                  Affects: {Array.isArray(flag.affectedUsers) ? `${flag.affectedUsers.length} users` : flag.affectedUsers}
                  {' · '}Updated {new Date(flag.updatedAt).toLocaleDateString()}
                </div>
              </div>

              {/* Delete */}
              {deleteConfirm === flag.name ? (
                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                  <GoldButton small danger onClick={() => { deleteFlag(flag.name); setDeleteConfirm(null); }}>
                    Confirm Delete
                  </GoldButton>
                  <GoldButton small onClick={() => setDeleteConfirm(null)}>
                    Cancel
                  </GoldButton>
                </div>
              ) : (
                <GoldButton small danger onClick={() => setDeleteConfirm(flag.name)}>
                  Delete
                </GoldButton>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 4: USER OBSERVATORY
// ═══════════════════════════════════════════════════════════════════════════════

function UserObservatory() {
  const {
    users,
    usersLoading,
    usersTotal,
    usersPage,
    selectedUser,
    selectedUserMindProfile,
    loadUsers,
    selectUser,
    clearSelectedUser,
    resetUserEvolution,
    loadUserMindProfile,
  } = useSovereignStore();

  const [searchArchetype, setSearchArchetype] = useState('');
  const [minConfidence, setMinConfidence] = useState(0);
  const [resetConfirm, setResetConfirm] = useState<string | null>(null);
  const [showMindProfile, setShowMindProfile] = useState(false);

  useEffect(() => {
    loadUsers(1);
  }, [loadUsers]);

  const filtered = users.filter((u: UserSummary) => {
    if (searchArchetype && !u.archetype.toLowerCase().includes(searchArchetype.toLowerCase()))
      return false;
    if (u.confidenceScore < minConfidence) return false;
    return true;
  });

  const handleSelectUser = async (userId: string) => {
    if (selectedUser?.userId === userId) {
      clearSelectedUser();
      setShowMindProfile(false);
    } else {
      await selectUser(userId);
    }
  };

  const handleViewMindProfile = async (userId: string) => {
    await loadUserMindProfile(userId);
    setShowMindProfile(true);
  };

  const handleResetEvolution = async (userId: string) => {
    await resetUserEvolution(userId);
    setResetConfirm(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <SectionTitle>User Observatory</SectionTitle>
        <span style={{ color: C.textMuted, fontSize: '0.75rem', marginTop: '-0.875rem' }}>
          {usersTotal} total
        </span>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <label style={labelStyle}>Filter Archetype</label>
          <input
            type="text"
            value={searchArchetype}
            onChange={(e) => setSearchArchetype(e.target.value)}
            placeholder="e.g. Architect"
            style={{ ...inputStyle, width: '12rem' }}
          />
        </div>
        <div>
          <label style={labelStyle}>Min Confidence</label>
          <input
            type="number"
            value={minConfidence}
            onChange={(e) => setMinConfidence(Number(e.target.value))}
            min={0}
            max={1}
            step={0.05}
            style={{ ...inputStyle, width: '6rem' }}
          />
        </div>
        <GoldButton small onClick={() => loadUsers(usersPage)}>Refresh</GoldButton>
      </div>

      {usersLoading ? (
        <div style={{ color: C.textMuted, fontSize: '0.875rem' }}>Loading users...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
          {/* Header */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '5rem 1fr 6rem 5rem 6rem 5rem',
              gap: '0.75rem',
              padding: '0.375rem 0.75rem',
              color: C.textMuted,
              fontSize: '0.6875rem',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            <span>User ID</span>
            <span>Email / Archetype</span>
            <span>Confidence</span>
            <span>Interactions</span>
            <span>Last Active</span>
            <span>Actions</span>
          </div>

          {filtered.map((u: UserSummary) => (
            <div key={u.userId} style={{ display: 'flex', flexDirection: 'column' }}>
              <Card
                style={{
                  display: 'grid',
                  gridTemplateColumns: '5rem 1fr 6rem 5rem 6rem 5rem',
                  gap: '0.75rem',
                  alignItems: 'center',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s ease',
                  borderColor: selectedUser?.userId === u.userId ? C.borderGold : C.border,
                  padding: '0.625rem 0.75rem',
                }}
                onClick={() => handleSelectUser(u.userId)}
              >
                <span style={{ color: C.gold, fontSize: '0.75rem', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {u.userId.slice(0, 8)}…
                </span>
                <div>
                  <div style={{ color: C.textPrimary, fontSize: '0.8125rem', marginBottom: '0.125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {u.email || <span style={{ color: C.textMuted }}>—</span>}
                  </div>
                  <div style={{ color: C.textMuted, fontSize: '0.6875rem' }}>{u.archetype || '—'}</div>
                </div>
                <div>
                  <div
                    style={{
                      height: '0.25rem',
                      background: 'rgba(255,255,255,0.08)',
                      borderRadius: '0.125rem',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.round(u.confidenceScore * 100)}%`,
                        background: u.confidenceScore > 0.7 ? C.teal : u.confidenceScore > 0.4 ? C.gold : C.red,
                        borderRadius: '0.125rem',
                      }}
                    />
                  </div>
                  <span style={{ color: C.textMuted, fontSize: '0.6875rem' }}>
                    {Math.round(u.confidenceScore * 100)}%
                  </span>
                </div>
                <span style={{ color: C.textSecondary, fontSize: '0.8125rem' }}>{u.totalInteractions}</span>
                <span style={{ color: C.textMuted, fontSize: '0.75rem' }}>
                  {u.lastActive ? new Date(u.lastActive).toLocaleDateString() : '—'}
                </span>
                {/* Stop propagation on actions */}
                <div
                  style={{ display: 'flex', gap: '0.375rem' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <GoldButton small onClick={() => handleViewMindProfile(u.userId)}>
                    Mind
                  </GoldButton>
                  {resetConfirm === u.userId ? (
                    <GoldButton small danger onClick={() => handleResetEvolution(u.userId)}>
                      ✓
                    </GoldButton>
                  ) : (
                    <GoldButton small danger onClick={() => setResetConfirm(u.userId)}>
                      Reset
                    </GoldButton>
                  )}
                </div>
              </Card>

              {/* Expanded evolution profile */}
              {selectedUser?.userId === u.userId && selectedUser.evolutionProfile && (
                <Card
                  style={{
                    marginLeft: '1rem',
                    marginTop: '0.25rem',
                    borderLeft: `2px solid ${C.gold}`,
                    background: '#0d0d0f',
                  }}
                >
                  <label style={labelStyle}>AtlasAdaptationState</label>
                  <pre
                    style={{
                      color: 'rgba(255,255,255,0.65)',
                      fontSize: '0.75rem',
                      fontFamily: 'monospace',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                      margin: 0,
                      lineHeight: 1.6,
                      maxHeight: '14rem',
                      overflowY: 'auto',
                    }}
                  >
                    {JSON.stringify(selectedUser.evolutionProfile, null, 2)}
                  </pre>
                </Card>
              )}
            </div>
          ))}

          {/* Pagination */}
          {usersTotal > 20 && (
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <GoldButton small onClick={() => loadUsers(usersPage - 1)} disabled={usersPage <= 1}>
                ← Prev
              </GoldButton>
              <span style={{ color: C.textMuted, fontSize: '0.8125rem', alignSelf: 'center' }}>
                Page {usersPage}
              </span>
              <GoldButton small onClick={() => loadUsers(usersPage + 1)} disabled={usersPage * 20 >= usersTotal}>
                Next →
              </GoldButton>
            </div>
          )}
        </div>
      )}

      {/* Mind Profile Side Panel */}
      {showMindProfile && selectedUserMindProfile && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: 'min(28rem, 90vw)',
            background: C.surface,
            borderLeft: `1px solid ${C.borderGold}`,
            padding: '1.5rem',
            zIndex: 200,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <SectionTitle>Mind Profile</SectionTitle>
            <GoldButton small onClick={() => setShowMindProfile(false)}>Close</GoldButton>
          </div>
          <pre
            style={{
              color: 'rgba(255,255,255,0.65)',
              fontSize: '0.75rem',
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              margin: 0,
              lineHeight: 1.6,
            }}
          >
            {JSON.stringify(selectedUserMindProfile, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 5: BUG HUNTER (CREATOR VIEW)
// ═══════════════════════════════════════════════════════════════════════════════

const SEVERITY_COLOR: Record<BugSeverity, string> = {
  minor: 'rgba(255,255,255,0.4)',
  major: '#f59e0b',
  critical: '#ef4444',
};

const STATUS_COLOR: Record<BugStatus, string> = {
  new: '#60a5fa',
  investigating: '#f59e0b',
  resolved: C.teal,
};

function BugHunterPanel() {
  const { bugs, bugsLoading, bugFilter, loadBugs, updateBugStatus, setBugFilter, addBugToChangelog } =
    useSovereignStore();

  useEffect(() => {
    loadBugs();
  }, [loadBugs]);

  const filtered = bugs.filter((b: BugReport) => {
    if (bugFilter === 'new') return b.status === 'new';
    if (bugFilter === 'critical') return b.severity === 'critical';
    if (bugFilter === 'resolved') return b.status === 'resolved';
    return true;
  });

  const counts = {
    all: bugs.length,
    new: bugs.filter((b: BugReport) => b.status === 'new').length,
    critical: bugs.filter((b: BugReport) => b.severity === 'critical').length,
    resolved: bugs.filter((b: BugReport) => b.status === 'resolved').length,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <SectionTitle>Bug Hunter Queue</SectionTitle>
        <GoldButton small onClick={loadBugs}>Refresh</GoldButton>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {(['all', 'new', 'critical', 'resolved'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setBugFilter(f)}
            style={{
              padding: '0.375rem 0.875rem',
              borderRadius: '0.375rem',
              border: `1px solid ${bugFilter === f ? C.gold : C.border}`,
              background: bugFilter === f ? C.goldDim : 'transparent',
              color: bugFilter === f ? C.gold : C.textMuted,
              fontSize: '0.75rem',
              fontWeight: 600,
              letterSpacing: '0.04em',
              textTransform: 'capitalize',
              cursor: 'pointer',
            }}
          >
            {f} ({counts[f]})
          </button>
        ))}
      </div>

      {bugsLoading ? (
        <div style={{ color: C.textMuted, fontSize: '0.875rem' }}>Loading bugs...</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: C.textMuted, fontSize: '0.875rem', textAlign: 'center', padding: '2rem' }}>
          No bugs match this filter.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {filtered.map((bug: BugReport) => (
            <Card
              key={bug.id}
              style={{
                borderLeft: `3px solid ${SEVERITY_COLOR[bug.severity]}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                <div style={{ flexGrow: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                    <span style={{ color: C.textPrimary, fontSize: '0.875rem', fontWeight: 600 }}>
                      {bug.title}
                    </span>
                    <span
                      style={{
                        fontSize: '0.625rem',
                        fontWeight: 700,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        padding: '0.125rem 0.375rem',
                        borderRadius: '0.25rem',
                        background: `${SEVERITY_COLOR[bug.severity]}18`,
                        color: SEVERITY_COLOR[bug.severity],
                        border: `1px solid ${SEVERITY_COLOR[bug.severity]}44`,
                      }}
                    >
                      {bug.severity}
                    </span>
                    {bug.addedToChangelog && (
                      <span style={{ fontSize: '0.625rem', color: C.teal, fontWeight: 600, letterSpacing: '0.04em' }}>
                        ✓ In changelog
                      </span>
                    )}
                  </div>
                  {bug.description && (
                    <div style={{ color: C.textSecondary, fontSize: '0.8125rem', lineHeight: 1.5, marginBottom: '0.375rem' }}>
                      {bug.description}
                    </div>
                  )}
                  <div style={{ color: C.textMuted, fontSize: '0.6875rem' }}>
                    {new Date(bug.createdAt).toLocaleString()}
                    {bug.userId && ` · User: ${bug.userId.slice(0, 8)}…`}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', alignItems: 'flex-end', flexShrink: 0 }}>
                  {/* Status Dropdown */}
                  <select
                    value={bug.status}
                    onChange={(e) => updateBugStatus(bug.id, e.target.value as BugStatus)}
                    style={{
                      background: C.surfaceAlt,
                      border: `1px solid ${STATUS_COLOR[bug.status]}44`,
                      borderRadius: '0.375rem',
                      color: STATUS_COLOR[bug.status],
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      padding: '0.25rem 0.5rem',
                      cursor: 'pointer',
                      outline: 'none',
                    }}
                  >
                    <option value="new">New</option>
                    <option value="investigating">Investigating</option>
                    <option value="resolved">Resolved</option>
                  </select>

                  {!bug.addedToChangelog && bug.status === 'resolved' && (
                    <GoldButton small teal onClick={() => addBugToChangelog(bug.id)}>
                      Add to Changelog
                    </GoldButton>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 6: PUBLISH
// ═══════════════════════════════════════════════════════════════════════════════

function PublishPanel() {
  const {
    deployStatus,
    deployLog,
    currentVersion,
    releaseChangelog,
    releases,
    releasesLoading,
    bugs,
    startDeploy,
    setCurrentVersion,
    setReleaseChangelog,
    publishRelease,
    loadReleases,
  } = useSovereignStore();

  const deployLogRef = useRef<HTMLDivElement>(null);
  const [deployConfirm, setDeployConfirm] = useState(false);

  useEffect(() => {
    loadReleases();
  }, [loadReleases]);

  useEffect(() => {
    if (deployLogRef.current) {
      deployLogRef.current.scrollTop = deployLogRef.current.scrollHeight;
    }
  }, [deployLog]);

  // Auto-populate changelog from resolved bugs
  const resolvedBugsForChangelog = bugs.filter(
    (b: BugReport) => b.status === 'resolved' && !b.addedToChangelog
  );

  const handleDeploy = async () => {
    setDeployConfirm(false);
    await startDeploy();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <SectionTitle>Publish Release</SectionTitle>

      {/* Version */}
      <Card>
        <label style={labelStyle}>Version (semver)</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.375rem' }}>
          <span style={{ color: C.gold, fontSize: '1.25rem', fontWeight: 700, fontFamily: 'monospace' }}>
            v{currentVersion}
          </span>
          <div style={{ display: 'flex', gap: '0.375rem' }}>
            {(['patch', 'minor', 'major'] as const).map((part) => (
              <GoldButton small key={part} onClick={() => setCurrentVersion(bumpVersion(currentVersion, part))}>
                +{part}
              </GoldButton>
            ))}
          </div>
          <input
            type="text"
            value={currentVersion}
            onChange={(e) => setCurrentVersion(e.target.value)}
            placeholder="1.0.0"
            style={{ ...inputStyle, width: '7rem' }}
          />
        </div>
      </Card>

      {/* Changelog Editor */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <label style={labelStyle}>Release Notes (Markdown)</label>
          {resolvedBugsForChangelog.length > 0 && (
            <span style={{ color: C.textMuted, fontSize: '0.75rem' }}>
              {resolvedBugsForChangelog.length} resolved bugs not yet in changelog
            </span>
          )}
        </div>
        <textarea
          value={releaseChangelog}
          onChange={(e) => setReleaseChangelog(e.target.value)}
          placeholder={`## v${currentVersion}\n\n### Changes\n- \n\n### Bug Fixes\n- `}
          rows={10}
          style={{
            ...inputStyle,
            fontFamily: 'monospace',
            fontSize: '0.8125rem',
            lineHeight: 1.7,
            resize: 'vertical',
          }}
        />
      </div>

      {/* Publish + Deploy Actions */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <GoldButton
          onClick={publishRelease}
          disabled={!releaseChangelog.trim() || !currentVersion.trim()}
          teal
        >
          Publish Release (no deploy)
        </GoldButton>

        {deployConfirm ? (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ color: C.red, fontSize: '0.8125rem', fontWeight: 600 }}>
              Deploy to production?
            </span>
            <GoldButton danger onClick={handleDeploy} disabled={deployStatus === 'deploying'}>
              Confirm Deploy
            </GoldButton>
            <GoldButton small onClick={() => setDeployConfirm(false)}>Cancel</GoldButton>
          </div>
        ) : (
          <GoldButton
            danger
            onClick={() => setDeployConfirm(true)}
            disabled={deployStatus === 'deploying'}
          >
            {deployStatus === 'deploying' ? 'Deploying...' : 'Publish + Deploy'}
          </GoldButton>
        )}
      </div>

      {/* Deploy Log */}
      {(deployStatus !== 'idle' || deployLog.length > 0) && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <label style={labelStyle}>Deploy Log</label>
            {deployStatus === 'deploying' && <Spinner />}
            {deployStatus === 'success' && (
              <span style={{ color: C.gold, fontSize: '0.875rem', fontWeight: 700 }}>
                Atlas v{currentVersion} is live
              </span>
            )}
            {deployStatus === 'error' && (
              <span style={{ color: C.red, fontSize: '0.875rem', fontWeight: 700 }}>
                Deploy failed
              </span>
            )}
          </div>
          <div
            ref={deployLogRef}
            style={{
              background: '#080808',
              border: `1px solid ${deployStatus === 'error' ? C.borderRed : deployStatus === 'success' ? 'rgba(20,184,166,0.3)' : C.border}`,
              borderRadius: '0.5rem',
              padding: '0.75rem',
              height: '12rem',
              overflowY: 'auto',
              fontFamily: 'monospace',
              fontSize: '0.75rem',
              lineHeight: 1.6,
            }}
          >
            {deployLog.map((line, i) => (
              <div
                key={i}
                style={{
                  color: line.includes('[stderr]') || line.includes('error')
                    ? '#f87171'
                    : line.includes('[sovereign]')
                    ? C.gold
                    : 'rgba(255,255,255,0.65)',
                  marginBottom: '0.125rem',
                }}
              >
                {line}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Release History */}
      <div>
        <SectionTitle>Release History</SectionTitle>
        {releasesLoading ? (
          <div style={{ color: C.textMuted, fontSize: '0.875rem' }}>Loading...</div>
        ) : releases.length === 0 ? (
          <div style={{ color: C.textMuted, fontSize: '0.875rem' }}>No releases yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {releases.map((r: Release, i) => (
              <Card key={r.version}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <span style={{ color: i === 0 ? C.gold : C.textSecondary, fontWeight: 700, fontSize: '0.9375rem', fontFamily: 'monospace' }}>
                    v{r.version}
                  </span>
                  {i === 0 && (
                    <span style={{ color: C.teal, fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                      Latest
                    </span>
                  )}
                  <span style={{ color: C.textMuted, fontSize: '0.75rem', marginLeft: 'auto' }}>
                    {new Date(r.publishedAt).toLocaleString()}
                  </span>
                </div>
                <div style={{ color: C.textSecondary, fontSize: '0.8125rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', maxHeight: '6rem', overflow: 'hidden', position: 'relative' }}>
                  {r.changelog}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN SOVEREIGN CONSOLE
// ═══════════════════════════════════════════════════════════════════════════════

function SovereignConsoleInner() {
  const { activeTab, setActiveTab, bugs } = useSovereignStore();
  const newBugCount = bugs.filter((b: BugReport) => b.status === 'new').length;

  const renderTab = () => {
    switch (activeTab) {
      case 'command': return <CommandCenter />;
      case 'prompt':  return <PromptForge />;
      case 'flags':   return <FeatureFlags />;
      case 'users':   return <UserObservatory />;
      case 'explainability': return <SovereignExplainabilityTab />;
      case 'bugs':    return <BugHunterPanel />;
      case 'publish': return <PublishPanel />;
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: C.bg,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 100,
        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        border: `1px solid ${C.borderRed}`,
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.875rem 1.5rem',
          borderBottom: `1px solid ${C.borderRed}`,
          background: 'rgba(220,38,38,0.04)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Sovereign Logo */}
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Atlas Sovereign">
            <polygon points="14,2 26,22 2,22" stroke="#dc2626" strokeWidth="1.75" fill="rgba(220,38,38,0.08)" />
            <line x1="14" y1="2" x2="14" y2="22" stroke="#d4af37" strokeWidth="1.25" opacity="0.6" />
            <circle cx="14" cy="22" r="1.5" fill="#dc2626" />
          </svg>
          <div>
            <div style={{ color: C.red, fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', lineHeight: 1 }}>
              Sovereign Console
            </div>
            <div style={{ color: C.textMuted, fontSize: '0.6875rem', letterSpacing: '0.04em', marginTop: '0.125rem' }}>
              Obsidian Atlas · Creator Access
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <StatusDot ok={true} />
          <span style={{ color: C.textMuted, fontSize: '0.75rem' }}>
            {SOVEREIGN_EMAIL}
          </span>
        </div>
      </header>

      {/* ── Tab Bar ─────────────────────────────────────────────────────────── */}
      <nav
        style={{
          display: 'flex',
          borderBottom: `1px solid ${C.border}`,
          padding: '0 1.5rem',
          gap: '0',
          flexShrink: 0,
          overflowX: 'auto',
        }}
      >
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          const badge = tab.id === 'bugs' && newBugCount > 0 ? newBugCount : null;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '0.75rem 1.25rem',
                border: 'none',
                background: 'none',
                color: active ? C.red : C.textMuted,
                fontSize: '0.75rem',
                fontWeight: active ? 700 : 500,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                borderBottom: active ? `2px solid ${C.red}` : '2px solid transparent',
                marginBottom: '-1px',
                transition: 'color 0.15s ease',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                position: 'relative',
              }}
            >
              {tab.short}
              {badge !== null && (
                <span
                  style={{
                    background: C.red,
                    color: 'white',
                    fontSize: '0.5rem',
                    fontWeight: 800,
                    padding: '0.125rem 0.3125rem',
                    borderRadius: '9999px',
                    lineHeight: 1,
                    minWidth: '1rem',
                    textAlign: 'center',
                  }}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <main
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1.5rem',
        }}
      >
        {renderTab()}
      </main>

      {/* ── Keyframes ───────────────────────────────────────────────────────── */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 2px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.22); }
        input::placeholder, textarea::placeholder { color: rgba(255,255,255,0.2); }
        select option { background: #1a1a1e; color: #f9fafb; }
      `}</style>
    </div>
  );
}

// ─── Exported Component ───────────────────────────────────────────────────────

export default function SovereignConsole() {
  return (
    <SovereignGuard>
      <SovereignConsoleInner />
    </SovereignGuard>
  );
}

// Named exports for composition
export { SovereignGuard, SovereignDenied };
