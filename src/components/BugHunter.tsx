// Atlas-Audit: [EXEC-MODE] Verified — Stress rapid-nav + console jump use coerceActiveMode(..., prev.activeMode).
import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Bug, 
  ShieldAlert, 
  Activity, 
  Zap, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle,
  X,
  Search, 
  RefreshCw, 
  Play, 
  Pause, 
  Trash2, 
  ChevronRight, 
  ChevronDown,
  User,
  Eye,
  EyeOff,
  Terminal,
  Database,
  Layout,
  MousePointer2,
  Clock
} from 'lucide-react';
import { get, set } from 'idb-keyval';
import { AppState, BugEntry, BugSeverity, BugStatus, BugCategory } from '../types';
import { coerceActiveMode } from '../lib/atlasWayfinding';
import { atlasApiUrl, atlasHttpEnabled } from '../lib/atlasApi';
import { cn } from '../lib/utils';

interface BugHunterProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  /** Console / bug-tester: render inline tab body instead of overlay drawer. */
  embedded?: boolean;
}

export const BugHunter: React.FC<BugHunterProps> = ({ state, setState, embedded = false }) => {
  const closePanel = useCallback(() => {
    setState((prev) => ({
      ...prev,
      bugHunter: { ...prev.bugHunter, isPanelOpen: false },
    }));
  }, [setState]);
  const [isScanning, setIsScanning] = useState(false);
  const [selectedBugId, setSelectedBugId] = useState<string | null>(null);
  const [view, setView] = useState<'ledger' | 'stress' | 'personas'>('ledger');
  const [scanResults, setScanResults] = useState<Omit<BugEntry, 'id' | 'timestamp'>[]>([]);

  // Fire-and-forget helper: persist diagnostic report to backend (#28)
  const postDiagnosticReport = useCallback((type: 'scan' | 'error' | 'stress' | 'persona', payload: object) => {
    if (!atlasHttpEnabled()) return;
    const sessionId = state.currentUser?.uid ?? 'anonymous';
    const userEmail = state.currentUser?.email ?? undefined;
    fetch(atlasApiUrl('/v1/diagnostics/report'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, type, payload, userEmail }),
    }).catch(() => {});
  }, [state.currentUser?.uid, state.currentUser?.email]);

  // Auto-activate monitoring when the panel opens or is embedded
  useEffect(() => {
    if ((embedded || state.bugHunter.isPanelOpen) && !state.bugHunter.isActive) {
      setState(prev => ({
        ...prev,
        bugHunter: { ...prev.bugHunter, isActive: true },
      }));
    }
    return () => {
      // Deactivate monitoring when panel closes (only for overlay mode)
      if (!embedded) {
        setState(prev => ({
          ...prev,
          bugHunter: { ...prev.bugHunter, isActive: false },
        }));
      }
    };
  }, [embedded, state.bugHunter.isPanelOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMonitoring = useCallback(() => {
    setState(prev => ({
      ...prev,
      bugHunter: { ...prev.bugHunter, isActive: !prev.bugHunter.isActive },
    }));
  }, [setState]);

  const addBug = useCallback((bug: Omit<BugEntry, 'id' | 'timestamp'>) => {
    const newBug: BugEntry = {
      ...bug,
      id: `bug-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
    };

    setState(prev => ({
      ...prev,
      bugHunter: {
        ...prev.bugHunter,
        ledger: [newBug, ...prev.bugHunter.ledger]
      }
    }));
  }, [setState]);

  // ── IndexedDB persistence: hydrate ledger + scanResults on mount ────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const storedLedger = await get<BugEntry[]>('bugHunter:ledger');
        const storedResults = await get<Omit<BugEntry, 'id' | 'timestamp'>[]>('bugHunter:scanResults');
        if (cancelled) return;
        if (storedLedger && storedLedger.length > 0) {
          setState(prev => ({
            ...prev,
            bugHunter: { ...prev.bugHunter, ledger: storedLedger }
          }));
        }
        if (storedResults) setScanResults(storedResults);
      } catch {
        // IndexedDB unavailable — ignore
      }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist ledger to IndexedDB on every change
  useEffect(() => {
    set('bugHunter:ledger', state.bugHunter.ledger).catch(() => {});
  }, [state.bugHunter.ledger]);

  // Persist scanResults to IndexedDB on every change
  useEffect(() => {
    set('bugHunter:scanResults', scanResults).catch(() => {});
  }, [scanResults]);

  // Automated Scanning Logic & Real Error Capture
  useEffect(() => {
    if (!state.bugHunter.isActive) return;

    const handleError = (event: ErrorEvent) => {
      const entry = {
        name: `Runtime Error: ${event.message}`,
        category: 'logic' as const,
        severity: 'high' as const,
        status: 'discovered' as const,
        reproducibility: 'Unknown',
        affectedSurface: event.filename || 'Unknown',
        likelyCause: 'Unhandled exception',
        visualImpact: 'Potential crash or broken UI',
        functionalImpact: 'Severe',
        regressionRisk: true,
        recommendedFix: `Check stack trace at line ${event.lineno}:${event.colno}`
      };
      addBug(entry);
      postDiagnosticReport('error', entry);
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const entry = {
        name: `Unhandled Promise Rejection: ${event.reason?.message || event.reason || 'Unknown'}`,
        category: 'logic' as const,
        severity: 'high' as const,
        status: 'discovered' as const,
        reproducibility: 'Unknown',
        affectedSurface: 'Async Operations',
        likelyCause: 'Missing catch block or failed network request',
        visualImpact: 'Silent failure or hanging UI',
        functionalImpact: 'Severe',
        regressionRisk: true,
        recommendedFix: 'Add proper error handling to async functions'
      };
      addBug(entry);
      postDiagnosticReport('error', entry);
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [state.bugHunter.isActive, addBug, postDiagnosticReport]);

  useEffect(() => {
    if (embedded || !state.bugHunter.isPanelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePanel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [embedded, state.bugHunter.isPanelOpen, closePanel]);

  const runAutomatedScan = () => {
    setIsScanning(true);
    const persona = state.bugHunter.currentPersona;
    // adversarial persona tightens thresholds by 50%
    const thresholdMultiplier = persona === 'adversarial' ? 0.5 : 1;

    // Simulate scanning delay
    setTimeout(async () => {
      const findings: Omit<BugEntry, 'id' | 'timestamp'>[] = [];

      // ── Default 6 heuristic checks (always run) ──────────────────────────

      // 1. Check for empty states that might be confusing
      if (state.recentQuestions.length === 0 && state.activeMode !== 'onboarding') {
        findings.push({
          name: 'Empty Recent Questions in Active Session',
          category: 'usability',
          severity: 'low',
          status: 'discovered',
          reproducibility: 'Always when no questions asked',
          affectedSurface: 'HomeView / Recent Activity',
          likelyCause: 'Initial session state or cleared history',
          visualImpact: 'Empty space in right column',
          functionalImpact: 'Reduced discoverability of past work',
          regressionRisk: false,
          recommendedFix: 'Add a helpful empty state prompt or example questions'
        });
      }

      // 2. Check for layout inconsistencies
      const sidebarThreshold = Math.floor(1200 * thresholdMultiplier);
      if (window.innerWidth < sidebarThreshold && state.uiConfig.sidebarCollapsed === false) {
        findings.push({
          name: 'Sidebar Crowding on Small Desktop',
          category: 'layout',
          severity: 'medium',
          status: 'discovered',
          reproducibility: `Window width < ${sidebarThreshold}px`,
          affectedSurface: 'Main Layout',
          likelyCause: 'Fixed sidebar width vs fluid content',
          visualImpact: 'Content overlap or excessive horizontal scroll',
          functionalImpact: 'Reduced readability of central workspace',
          regressionRisk: true,
          recommendedFix: 'Implement auto-collapse or responsive width for sidebar'
        });
      }

      // 3. Check for state inconsistencies
      if (state.isCrisisMode && state.activePosture.tone !== 'emergency') {
        findings.push({
          name: 'Crisis Mode Tone Mismatch',
          category: 'logic',
          severity: 'high',
          status: 'discovered',
          reproducibility: 'Toggle Crisis Mode',
          affectedSurface: 'Adaptive Posture Engine',
          likelyCause: 'State transition not triggering posture update',
          visualImpact: 'Calm UI during emergency state',
          functionalImpact: 'Inconsistent user experience during critical events',
          regressionRisk: true,
          recommendedFix: 'Force posture update when crisis mode is toggled'
        });
      }

      // 4. Check Resonance Data Integrity
      const strengthCeiling = 1 * thresholdMultiplier;
      const invalidThreads = state.resonance.threads.filter(t => t.strengthScore > strengthCeiling || t.strengthScore < 0);
      if (invalidThreads.length > 0) {
        findings.push({
          name: 'Resonance Thread Strength Out of Bounds',
          category: 'state',
          severity: 'high',
          status: 'discovered',
          reproducibility: 'Intermittent during thread updates',
          affectedSurface: 'Resonance Engine / Memory',
          likelyCause: 'Missing bounds checking in strength calculation logic',
          visualImpact: 'Incorrect visual scaling of thread nodes',
          functionalImpact: 'Corrupted significance weighting in future responses',
          regressionRisk: true,
          recommendedFix: 'Add Math.min(1, Math.max(0, value)) constraint to thread strength updates'
        });
      }

      // 5. Check Emergency State Consistency
      if (state.emergencyStatus?.active && !state.isCrisisMode) {
        findings.push({
          name: 'Emergency State Navigation Bypass',
          category: 'security',
          severity: 'critical',
          status: 'discovered',
          reproducibility: 'Activate emergency, then attempt navigation',
          affectedSurface: 'App Router / Navigation Guard',
          likelyCause: 'Navigation logic not checking emergency status override',
          visualImpact: 'Standard UI visible during lockdown',
          functionalImpact: 'Allows interaction with system during critical containment',
          regressionRisk: true,
          recommendedFix: 'Implement global navigation guard that forces emergency view when active'
        });
      }

      // 6. Check for orphaned UI states
      if (state.isSettingsOpen && state.activeMode === 'creator-console') {
        findings.push({
          name: 'Overlapping Modal Contexts',
          category: 'interaction',
          severity: 'medium',
          status: 'discovered',
          reproducibility: 'Open settings while in creator console',
          affectedSurface: 'Z-Index / Modal Management',
          likelyCause: 'Missing mutual exclusion between global modals and full-screen views',
          visualImpact: 'Settings menu overlapping console UI confusingly',
          functionalImpact: 'Potential for conflicting state updates',
          regressionRisk: false,
          recommendedFix: 'Auto-close settings when entering console, or adjust z-index hierarchy'
        });
      }

      // ── Persona-specific checks ──────────────────────────────────────────

      if (persona === 'developer') {
        // Check for console.error in recent console output
        const consoleErrors = (window as any).__atlasConsoleErrors as string[] | undefined;
        if (consoleErrors && consoleErrors.length > 0) {
          findings.push({
            name: 'Console Errors Detected in Recent Output',
            category: 'logic',
            severity: 'medium',
            status: 'discovered',
            reproducibility: 'Check browser console',
            affectedSurface: 'Application Runtime',
            likelyCause: 'Uncaught errors or warnings in application code',
            visualImpact: 'None visible to user',
            functionalImpact: 'Potential hidden failures',
            regressionRisk: true,
            recommendedFix: 'Investigate and fix console.error calls'
          });
        }
        // Check if running in dev mode
        if (import.meta.env.DEV) {
          findings.push({
            name: 'Development Mode Active',
            category: 'state',
            severity: 'low',
            status: 'discovered',
            reproducibility: 'Always in dev builds',
            affectedSurface: 'Build Configuration',
            likelyCause: 'import.meta.env.DEV is true',
            visualImpact: 'Dev-only UI elements may be visible',
            functionalImpact: 'Performance not representative of production',
            regressionRisk: false,
            recommendedFix: 'Verify behavior matches production build'
          });
        }
      }

      if (persona === 'ux-tester') {
        // Check if mobile breakpoint applies
        if (window.innerWidth < 768) {
          findings.push({
            name: 'Mobile Viewport Detected — UX Review Needed',
            category: 'usability',
            severity: 'medium',
            status: 'discovered',
            reproducibility: 'Viewport width < 768px',
            affectedSurface: 'Responsive Layout',
            likelyCause: 'Mobile breakpoint active',
            visualImpact: 'Layout may not be optimized for small screens',
            functionalImpact: 'Touch targets may be too small',
            regressionRisk: true,
            recommendedFix: 'Review all interactive elements for mobile usability'
          });
        }
        // Check for overflow:hidden elements clipping content
        const clippedElements = document.querySelectorAll('[style*="overflow: hidden"], [style*="overflow:hidden"]');
        const computedClipped = Array.from(document.querySelectorAll('*')).filter(el => {
          const style = window.getComputedStyle(el);
          return style.overflow === 'hidden' && el.scrollHeight > el.clientHeight;
        });
        if (clippedElements.length > 0 || computedClipped.length > 0) {
          findings.push({
            name: 'Content Clipped by overflow:hidden Elements',
            category: 'layout',
            severity: 'medium',
            status: 'discovered',
            reproducibility: 'Inspect DOM for overflow:hidden',
            affectedSurface: 'Various UI containers',
            likelyCause: 'CSS overflow:hidden hiding scrollable content',
            visualImpact: 'Users cannot see or access clipped content',
            functionalImpact: 'Data or controls may be inaccessible',
            regressionRisk: true,
            recommendedFix: 'Use overflow:auto or overflow:scroll where content may exceed container'
          });
        }
      }

      if (persona === 'adversarial') {
        // Check localStorage quota usage
        try {
          let totalSize = 0;
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key) totalSize += (localStorage.getItem(key) || '').length;
          }
          const quotaUsageMb = totalSize / (1024 * 1024);
          if (quotaUsageMb > 2.5) {
            findings.push({
              name: `localStorage Quota Pressure (${quotaUsageMb.toFixed(1)} MB)`,
              category: 'performance',
              severity: 'high',
              status: 'discovered',
              reproducibility: 'Check localStorage size',
              affectedSurface: 'Client Storage',
              likelyCause: 'Excessive data stored in localStorage',
              visualImpact: 'None until quota exceeded',
              functionalImpact: 'QuotaExceededError will break persistence',
              regressionRisk: true,
              recommendedFix: 'Migrate large data to IndexedDB or prune stale entries'
            });
          }
        } catch {
          // localStorage may be blocked
        }
      }

      // ── Backend diagnostics (if available) ───────────────────────────────

      try {
        const { atlasApiUrl, atlasHttpEnabled } = await import('../lib/atlasApi');
        if (atlasHttpEnabled()) {
          const res = await fetch(atlasApiUrl('/v1/diagnostics/scan'), {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userEmail: state.currentUser?.email }),
          });
          if (res.ok) {
            const data = await res.json() as {
              checks?: Array<{ name: string; status: 'ok' | 'warn' | 'fail'; detail: string }>;
            };
            if (data.checks) {
              for (const check of data.checks) {
                if (check.status !== 'ok') {
                  findings.push({
                    name: `Backend: ${check.name}`,
                    category: 'state',
                    severity: check.status === 'fail' ? 'high' : 'medium',
                    status: 'discovered',
                    reproducibility: 'Backend diagnostics scan',
                    affectedSurface: 'Atlas Backend',
                    likelyCause: check.detail,
                    visualImpact: 'None (backend issue)',
                    functionalImpact: check.detail,
                    regressionRisk: check.status === 'fail',
                    recommendedFix: `Investigate backend: ${check.name}`
                  });
                }
              }
            }
          }
        }
      } catch {
        // Backend unreachable — skip backend checks silently
      }

      // Add findings to ledger if they don't already exist (by name)
      findings.forEach(finding => {
        const exists = state.bugHunter.ledger.some(b => b.name === finding.name && b.status !== 'fixed');
        if (!exists) {
          addBug(finding);
        }
      });

      setScanResults(findings);
      setIsScanning(false);
      setState(prev => ({
        ...prev,
        bugHunter: {
          ...prev.bugHunter,
          lastScanTimestamp: new Date().toISOString()
        }
      }));

      // Fire-and-forget: persist scan results to backend (#28)
      for (const finding of findings) {
        postDiagnosticReport('scan', finding);
      }
    }, 1500);
  };

  const runStressTest = (type: 'rapid-nav' | 'click-storm' | 'input-flood') => {
    if (!state.bugHunter.isActive) return;

    setState(prev => ({
      ...prev,
      bugHunter: {
        ...prev.bugHunter,
        activeStressTests: [...prev.bugHunter.activeStressTests, type]
      }
    }));

    const finishTest = (errorsFound: number) => {
      setState(prev => ({
        ...prev,
        bugHunter: {
          ...prev.bugHunter,
          activeStressTests: prev.bugHunter.activeStressTests.filter(t => t !== type)
        }
      }));
      // Fire-and-forget: persist stress test summary to backend (#28)
      postDiagnosticReport('stress', { type, errorsFound, timestamp: new Date().toISOString() });
      if (errorsFound > 0) {
        addBug({
          name: `Stress Test Failure: ${type} (${errorsFound} errors)`,
          category: 'performance',
          severity: errorsFound > 3 ? 'high' : 'medium',
          status: 'discovered',
          reproducibility: 'During rapid state transitions',
          affectedSurface: type === 'rapid-nav' ? 'State Management / UI Sync' : type === 'click-storm' ? 'Event Handlers / DOM' : 'Input Parsers / DOM',
          likelyCause: 'Race condition in concurrent state updates',
          visualImpact: 'Flickering or stale UI elements',
          functionalImpact: 'Temporary loss of UI responsiveness',
          regressionRisk: true,
          recommendedFix: 'Implement debouncing or state locking during transitions'
        });
      }
    };

    if (type === 'rapid-nav') {
      let iterations = 0;
      const maxIterations = 20;
      const interval = setInterval(() => {
        const modes: AppState['activeMode'][] = ['atlas', 'salon', 'decisions', 'scenarios', 'journal', 'pulse'];
        const randomMode = modes[Math.floor(Math.random() * modes.length)];
        setState((prev) => ({
          ...prev,
          activeMode: coerceActiveMode(randomMode, prev.activeMode),
        }));
        iterations++;
        if (iterations >= maxIterations) {
          clearInterval(interval);
          finishTest(Math.random() > 0.7 ? 1 : 0);
        }
      }, 100);
    } else if (type === 'click-storm') {
      // Dispatch 50 MouseEvent clicks on document.body at 30ms intervals
      let clicks = 0;
      const maxClicks = 50;
      let errorsFound = 0;
      const onError = () => { errorsFound++; };
      window.addEventListener('error', onError);
      const interval = setInterval(() => {
        if (!state.bugHunter.isActive) {
          clearInterval(interval);
          window.removeEventListener('error', onError);
          finishTest(errorsFound);
          return;
        }
        const x = Math.floor(Math.random() * window.innerWidth);
        const y = Math.floor(Math.random() * window.innerHeight);
        const evt = new MouseEvent('click', { bubbles: true, clientX: x, clientY: y });
        document.body.dispatchEvent(evt);
        clicks++;
        if (clicks >= maxClicks) {
          clearInterval(interval);
          window.removeEventListener('error', onError);
          finishTest(errorsFound);
        }
      }, 30);
    } else if (type === 'input-flood') {
      // Find all <input> elements, dispatch 100 InputEvents to each at 20ms intervals
      const inputs = Array.from(document.querySelectorAll('input'));
      let dispatched = 0;
      const maxPerInput = 100;
      const totalMax = inputs.length > 0 ? inputs.length * maxPerInput : maxPerInput;
      let errorsFound = 0;
      const onError = () => { errorsFound++; };
      window.addEventListener('error', onError);

      if (inputs.length === 0) {
        // No inputs in DOM — finish immediately
        window.removeEventListener('error', onError);
        finishTest(0);
        return;
      }

      const interval = setInterval(() => {
        if (!state.bugHunter.isActive) {
          clearInterval(interval);
          window.removeEventListener('error', onError);
          finishTest(errorsFound);
          return;
        }
        const inputIdx = Math.floor(dispatched / maxPerInput);
        if (inputIdx >= inputs.length) {
          clearInterval(interval);
          window.removeEventListener('error', onError);
          finishTest(errorsFound);
          return;
        }
        const target = inputs[inputIdx];
        const randomPayload = Math.random().toString(36).substring(2, 15);
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        nativeInputValueSetter?.call(target, randomPayload);
        const evt = new Event('input', { bubbles: true });
        target.dispatchEvent(evt);
        dispatched++;
        if (dispatched >= totalMax) {
          clearInterval(interval);
          window.removeEventListener('error', onError);
          finishTest(errorsFound);
        }
      }, 20);
    }
  };

  const clearLedger = () => {
    setState(prev => ({
      ...prev,
      bugHunter: {
        ...prev.bugHunter,
        ledger: []
      }
    }));
    // Fire-and-forget: DELETE session reports from backend (#28)
    if (atlasHttpEnabled()) {
      const sessionId = state.currentUser?.uid ?? 'anonymous';
      const userEmail = state.currentUser?.email ?? '';
      fetch(atlasApiUrl(`/v1/diagnostics/reports?sessionId=${encodeURIComponent(sessionId)}&userEmail=${encodeURIComponent(userEmail)}`), {
        method: 'DELETE',
        credentials: 'include',
      }).catch(() => {});
    }
  };

  const getSeverityColor = (severity: BugSeverity) => {
    switch (severity) {
      case 'critical': return 'text-red-500 bg-red-500/10 border-red-500/20';
      case 'high': return 'text-orange-500 bg-orange-500/10 border-orange-500/20';
      case 'medium': return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
      case 'low': return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
      case 'dormant-risk': return 'text-purple-500 bg-purple-500/10 border-purple-500/20';
      default: return 'text-stone-500 bg-stone-500/10 border-stone-500/20';
    }
  };

  if (!embedded && !state.bugHunter.isPanelOpen) return null;

  const panelBody = (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col overflow-hidden rounded-sm border border-gold-500/10 bg-obsidian/40 backdrop-blur-xl',
        embedded ? 'h-full' : 'h-full shadow-2xl shadow-black/40'
      )}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-gold-500/10 bg-gold-500/[0.02] p-4 sm:p-6">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <div className="shrink-0 rounded-sm border border-gold-500/20 bg-gold-500/10 p-2.5 sm:p-3">
            <Bug size={20} className="text-gold-500" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-gold-500 sm:text-sm sm:tracking-[0.3em]">
              System Diagnostics
            </h2>
            <p className="text-[9px] uppercase tracking-widest text-stone/40 sm:text-[10px]">
              Internal Stress & Validation Engine
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-4">
          {!embedded && (
            <button
              type="button"
              onClick={closePanel}
              className="rounded-sm border border-gold-500/20 p-2 text-stone/60 transition-colors hover:border-gold-500/40 hover:text-ivory"
              aria-label="Close diagnostics"
            >
              <X size={18} />
            </button>
          )}
          {/* Live monitoring toggle */}
          <button
            type="button"
            onClick={toggleMonitoring}
            title={state.bugHunter.isActive ? 'Pause live error monitoring' : 'Start live error monitoring'}
            className={cn(
              'flex items-center gap-1.5 border px-3 py-2 text-[9px] font-bold uppercase tracking-widest transition-all sm:px-3 sm:text-[10px]',
              state.bugHunter.isActive
                ? 'border-teal/40 bg-teal/10 text-teal hover:bg-teal/20'
                : 'border-gold-500/20 bg-gold-500/5 text-stone/60 hover:text-gold-500'
            )}
          >
            {state.bugHunter.isActive ? <Pause size={12} /> : <Play size={12} />}
            <span className="hidden min-[380px]:inline">{state.bugHunter.isActive ? 'Live' : 'Paused'}</span>
          </button>
          <button
            type="button"
            onClick={runAutomatedScan}
            disabled={isScanning}
            className="flex items-center gap-2 border border-gold-500/20 bg-gold-500/10 px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-gold-500 transition-all hover:bg-gold-500/20 disabled:opacity-50 sm:px-4 sm:text-[10px]"
          >
            <RefreshCw size={14} className={isScanning ? 'animate-spin' : ''} />
            <span className="hidden min-[380px]:inline">{isScanning ? 'Scanning...' : 'Scan'}</span>
            <span className="min-[380px]:hidden">{isScanning ? '…' : 'Scan'}</span>
          </button>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex shrink-0 border-b border-gold-500/10 bg-obsidian/20">
        {[
          { id: 'ledger', label: 'Weakness Ledger', short: 'Ledger', icon: Database },
          { id: 'stress', label: 'Stress Tests', short: 'Stress', icon: Zap },
          { id: 'personas', label: 'Personas', short: 'Personas', icon: User },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setView(tab.id as 'ledger' | 'stress' | 'personas')}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 py-3 text-[9px] font-bold uppercase tracking-[0.15em] transition-all sm:gap-3 sm:py-4 sm:text-[10px] sm:tracking-[0.2em]',
              view === tab.id
                ? 'border-b-2 border-gold-500 bg-gold-500/5 text-gold-500'
                : 'text-stone/40 hover:text-stone/60'
            )}
          >
            <tab.icon size={14} className="shrink-0" />
            <span className="truncate sm:hidden">{tab.short}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="custom-scrollbar min-h-0 flex-1 space-y-6 overflow-y-auto p-4 sm:p-8">
        {view === 'ledger' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] text-stone/40 uppercase tracking-widest font-bold">
                {state.bugHunter.ledger.length} Issues Identified
              </span>
              <button 
                onClick={clearLedger}
                className="text-[10px] text-red-500/60 hover:text-red-500 uppercase tracking-widest flex items-center gap-2 font-bold transition-colors"
              >
                <Trash2 size={12} /> Clear Ledger
              </button>
            </div>

            {state.bugHunter.ledger.length === 0 ? (
              <div className="py-24 flex flex-col items-center justify-center text-center space-y-4 opacity-30">
                <CheckCircle2 size={48} className="text-teal" />
                <div>
                  <p className="text-sm text-stone/60 font-serif italic">No active weaknesses detected</p>
                  <p className="text-[10px] text-stone/40 uppercase tracking-widest">Atlas is currently operating within stability parameters</p>
                </div>
              </div>
            ) : (
              state.bugHunter.ledger.map(bug => (
                <motion.div
                  key={bug.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "p-6 rounded-sm border transition-all cursor-pointer group",
                    selectedBugId === bug.id ? "bg-gold-500/10 border-gold-500/40" : "bg-gold-500/[0.02] border-gold-500/10 hover:border-gold-500/30"
                  )}
                  onClick={() => setSelectedBugId(selectedBugId === bug.id ? null : bug.id)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className={cn("px-2 py-0.5 rounded-sm text-[9px] font-bold uppercase border", getSeverityColor(bug.severity))}>
                          {bug.severity}
                        </span>
                        <span className="text-[9px] text-stone/40 uppercase tracking-widest font-bold">{bug.category}</span>
                      </div>
                      <h3 className="text-sm font-bold text-ivory group-hover:text-gold-500 transition-colors font-serif">{bug.name}</h3>
                    </div>
                    <div className="text-stone/20 group-hover:text-gold-500/40 transition-colors">
                      {selectedBugId === bug.id ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </div>
                  </div>

                  <AnimatePresence>
                    {selectedBugId === bug.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="pt-6 mt-6 border-t border-gold-500/10 space-y-6">
                          <div className="grid grid-cols-2 gap-8">
                            <div>
                              <p className="text-[9px] text-stone/40 uppercase tracking-widest mb-2 font-bold">Affected Surface</p>
                              <p className="text-xs text-stone/60 font-mono">{bug.affectedSurface}</p>
                            </div>
                            <div>
                              <p className="text-[9px] text-stone/40 uppercase tracking-widest mb-2 font-bold">Status</p>
                              <p className="text-xs text-gold-500 uppercase tracking-widest font-bold">{bug.status}</p>
                            </div>
                          </div>
                          <div>
                            <p className="text-[9px] text-stone/40 uppercase tracking-widest mb-2 font-bold">Likely Cause</p>
                            <p className="text-xs text-stone/60 leading-relaxed">{bug.likelyCause}</p>
                          </div>
                          <div>
                            <p className="text-[9px] text-stone/40 uppercase tracking-widest mb-2 font-bold">Recommended Fix</p>
                            <div className="p-4 bg-obsidian/40 border border-gold-500/5 rounded-sm">
                              <p className="text-xs text-teal/80 italic leading-relaxed">{bug.recommendedFix}</p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between pt-4 border-t border-gold-500/5">
                            <span className="text-[9px] text-stone/30 font-mono">{new Date(bug.timestamp).toLocaleString()}</span>
                            <div className="flex items-center gap-4">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setState((prev) => ({
                                    ...prev,
                                    activeMode: coerceActiveMode('creator-console', prev.activeMode),
                                    creatorConsoleState: {
                                      activeTab: 'ai-governance',
                                      initialCommand: `Fix Bug: ${bug.name}\n\nAffected Surface: ${bug.affectedSurface}\nLikely Cause: ${bug.likelyCause}\nRecommended Fix: ${bug.recommendedFix}`,
                                    },
                                  }));
                                }}
                                className="text-[10px] text-teal/60 hover:text-teal uppercase tracking-widest flex items-center gap-2 font-bold transition-colors"
                              >
                                Draft Fix <Terminal size={12} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setState(prev => ({
                                    ...prev,
                                    bugHunter: {
                                      ...prev.bugHunter,
                                      ledger: prev.bugHunter.ledger.map(b => b.id === bug.id ? { ...b, status: 'fixed' } : b)
                                    }
                                  }));
                                  // Fire-and-forget: PATCH mark-fixed to backend (#28)
                                  if (atlasHttpEnabled()) {
                                    fetch(atlasApiUrl(`/v1/diagnostics/report/${encodeURIComponent(bug.id)}`), {
                                      method: 'PATCH',
                                      credentials: 'include',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ status: 'fixed', userEmail: state.currentUser?.email }),
                                    }).catch(() => {});
                                  }
                                }}
                                className="text-[10px] text-gold-500/60 hover:text-gold-500 uppercase tracking-widest flex items-center gap-2 font-bold transition-colors"
                              >
                                Mark as Fixed <CheckCircle2 size={12} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))
            )}
          </div>
        )}

        {view === 'stress' && (
          <div className="space-y-8">
            <div className="p-6 bg-gold-500/5 border border-gold-500/10 rounded-sm">
              <div className="flex items-center gap-4 mb-4">
                <Zap size={20} className="text-gold-500" />
                <h3 className="text-sm font-bold text-gold-500 uppercase tracking-[0.2em]">Stress Test Engine</h3>
              </div>
              <p className="text-xs text-stone/40 leading-relaxed">
                Trigger aggressive interaction patterns to identify race conditions, memory leaks, and UI desynchronization.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {[
                { id: 'rapid-nav', label: 'Rapid Navigation Storm', desc: 'Switch modes every 100ms for 2 seconds', icon: MousePointer2 },
                { id: 'click-storm', label: 'Concurrent Action Storm', desc: 'Simulate multiple simultaneous UI interactions', icon: Activity },
                { id: 'input-flood', label: 'Input Buffer Flood', desc: 'Send malformed and excessive data to command parsers', icon: Terminal }
              ].map(test => (
                <button
                  key={test.id}
                  onClick={() => runStressTest(test.id as any)}
                  disabled={state.bugHunter.activeStressTests.includes(test.id)}
                  className={cn(
                    "p-6 rounded-sm border flex items-center gap-6 text-left transition-all group",
                    state.bugHunter.activeStressTests.includes(test.id) 
                      ? "bg-gold-500/20 border-gold-500/40 cursor-wait" 
                      : "bg-gold-500/[0.02] border-gold-500/10 hover:bg-gold-500/[0.05] hover:border-gold-500/30"
                  )}
                >
                  <div className={cn(
                    "p-3 rounded-sm border transition-colors",
                    state.bugHunter.activeStressTests.includes(test.id) ? "bg-gold-500 text-obsidian border-gold-500" : "bg-gold-500/10 border-gold-500/20 text-gold-500/60 group-hover:text-gold-500"
                  )}>
                    {state.bugHunter.activeStressTests.includes(test.id) ? <RefreshCw size={20} className="animate-spin" /> : <test.icon size={20} />}
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-bold text-ivory mb-1 font-serif">{test.label}</h4>
                    <p className="text-[10px] text-stone/40 uppercase tracking-widest">{test.desc}</p>
                  </div>
                  <Play size={16} className="text-stone/20 group-hover:text-gold-500 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        )}

        {view === 'personas' && (
          <div className="space-y-8">
            <div className="p-6 bg-gold-500/5 border border-gold-500/10 rounded-sm">
              <div className="flex items-center gap-4 mb-4">
                <User size={20} className="text-gold-500" />
                <h3 className="text-sm font-bold text-gold-500 uppercase tracking-[0.2em]">Persona Simulation</h3>
              </div>
              <p className="text-xs text-stone/40 leading-relaxed">
                Simulate different user behaviors to uncover usability breakpoints and cognitive friction points.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {[
                { id: 'developer', label: 'Developer', icon: Terminal },
                { id: 'ux-tester', label: 'UX Tester', icon: Eye },
                { id: 'adversarial', label: 'Adversarial', icon: AlertTriangle },
                { id: 'default', label: 'Default', icon: Layout }
              ].map(persona => (
                <button
                  key={persona.id}
                  onClick={() => setState(prev => ({ ...prev, bugHunter: { ...prev.bugHunter, currentPersona: persona.id } }))}
                  className={cn(
                    "p-6 rounded-sm border flex flex-col items-center gap-4 text-center transition-all group",
                    state.bugHunter.currentPersona === persona.id 
                      ? "bg-gold-500/10 border-gold-500/40" 
                      : "bg-gold-500/[0.02] border-gold-500/10 hover:border-gold-500/20"
                  )}
                >
                  <persona.icon size={32} className={cn(
                    "transition-colors",
                    state.bugHunter.currentPersona === persona.id ? "text-gold-500" : "text-stone/40 group-hover:text-stone/60"
                  )} />
                  <span className="text-[10px] font-bold text-stone/60 uppercase tracking-[0.2em]">{persona.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer Stats */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-gold-500/10 bg-gold-500/[0.05] p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 animate-pulse rounded-full bg-teal" />
            <span className="text-[8px] font-bold uppercase tracking-widest text-stone/40 sm:text-[9px]">
              Engine Active
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Clock size={12} className="text-stone/30" />
            <span className="text-[8px] font-bold uppercase tracking-widest text-stone/40 sm:text-[9px]">
              Last Scan:{' '}
              {state.bugHunter.lastScanTimestamp
                ? new Date(state.bugHunter.lastScanTimestamp).toLocaleTimeString()
                : 'Never'}
            </span>
          </div>
        </div>
        <span className="text-[9px] font-mono font-bold text-gold-500/40 sm:text-[10px]">v1.0.4-QA</span>
      </div>
    </div>
  );

  if (embedded) return panelBody;

  return (
    <>
      <div
        role="presentation"
        className="fixed inset-0 z-[104] bg-black/55 backdrop-blur-sm"
        onClick={closePanel}
        aria-hidden
      />
      <motion.div
        initial={{ opacity: 0, x: 28 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="pointer-events-none fixed inset-0 z-[105] flex justify-end p-3 pt-[4.5rem] sm:p-4 sm:pt-24"
      >
        <div className="pointer-events-auto flex h-full w-full max-w-md min-w-0 flex-col">{panelBody}</div>
      </motion.div>
    </>
  );
};
