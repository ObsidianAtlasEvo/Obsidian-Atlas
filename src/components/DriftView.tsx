// Atlas-Audit: [EXEC-MODE] Verified — Calibration / ritual handoff to Home uses coerceActiveMode('today-in-atlas', prev.activeMode) with activeChamberState.
import React, { useEffect, useState } from 'react';
import { AppState, DriftAlert, CalibrationRitual } from '../types';
import { motion } from 'motion/react';
import { Activity, AlertTriangle, CheckCircle2, Clock, RefreshCw, Shield, Zap, ArrowRight, Info, Loader2 } from 'lucide-react';
import { coerceActiveMode } from '../lib/atlasWayfinding';
import { atlasApiUrl, atlasHttpEnabled } from '../lib/atlasApi';
import { atlasTraceUserId } from '../lib/atlasTraceContext';
import { cn } from '../lib/utils';

interface DriftViewProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

export function DriftView({ state, setState }: DriftViewProps) {
  const { driftDetection } = state;
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Fetch drift events from backend on mount
  useEffect(() => {
    if (!atlasHttpEnabled()) return;
    const userId = atlasTraceUserId(state);
    if (userId === 'anonymous') return;

    let cancelled = false;
    setIsLoading(true);
    setFetchError(null);

    fetch(atlasApiUrl(`/v1/governance/drift-events?userId=${encodeURIComponent(userId)}&limit=50`))
      .then(async (res) => {
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        return res.json() as Promise<{ alerts: DriftAlert[]; overallAlignment: number }>;
      })
      .then((data) => {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          driftDetection: {
            ...prev.driftDetection,
            alerts: data.alerts,
            overallAlignment: data.overallAlignment,
          },
        }));
      })
      .catch((err) => {
        if (cancelled) return;
        setFetchError(err instanceof Error ? err.message : 'Failed to load drift events');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleInitiateCalibration = (alertId: string, type: string) => {
    const cmd = `/calibrate --alert-id=${alertId} --type=${type}`;
    setState((prev) => ({
      ...prev,
      activeMode: coerceActiveMode('today-in-atlas', prev.activeMode),
      activeChamberState: {
        ...prev.activeChamberState,
        forcedQuery: cmd,
        focusState: 'calibration',
      },
    }));
  };

  const handlePerformRitual = (ritualId: string) => {
    const cmd = `/perform-ritual --id=${ritualId}`;
    setState((prev) => ({
      ...prev,
      activeMode: coerceActiveMode('today-in-atlas', prev.activeMode),
      activeChamberState: {
        ...prev.activeChamberState,
        forcedQuery: cmd,
        focusState: 'ritual',
      },
    }));
  };

  return (
    <div className="h-full flex flex-col bg-obsidian text-ivory overflow-hidden">
      <header className="p-8 border-b border-purple-500/15 flex items-center justify-between bg-[#0f0a1e]/40 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 border border-gold-500/40 flex items-center justify-center bg-gold-500/5">
            <Activity className="text-gold-500" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-serif tracking-tight text-gold-500">Drift Detection & Alignment</h1>
            <p className="text-[10px] text-stone uppercase tracking-widest opacity-60">Constitutional Monitoring • Calibration Rituals</p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex flex-col items-end">
            <span className="text-[8px] uppercase tracking-widest text-stone font-bold">Sovereign Alignment</span>
            <span className="text-2xl font-serif text-gold-500">{(driftDetection.overallAlignment * 100).toFixed(1)}%</span>
          </div>
          <div className="w-32 h-1.5 bg-purple-500/10 rounded-full overflow-hidden border border-purple-500/20">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${driftDetection.overallAlignment * 100}%` }}
              transition={{ duration: 1.5, ease: "easeOut" }}
              className="h-full bg-gold-500 shadow-[0_0_10px_rgba(212,175,55,0.4)]" 
            />
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-8 max-w-6xl mx-auto w-full space-y-12 no-scrollbar">
        {/* Drift Alerts */}
        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <AlertTriangle className="text-gold-500/60" size={20} />
            <h2 className="text-lg font-serif text-ivory/90">Active Drift Alerts</h2>
          </div>
          <div className="grid grid-cols-1 gap-4">
            {driftDetection.alerts.map((alert) => (
              <motion.div 
                key={alert.id} 
                whileHover={{ scale: 1.005 }}
                className="p-6 bg-[#1a103c]/20 border border-purple-500/15 rounded-sm space-y-4 hover:border-gold-500/30 transition-all group"
              >
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-mono text-stone-500">{new Date(alert.timestamp).toLocaleString()}</span>
                      <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 bg-gold-500/10 text-gold-500 border border-gold-500/20 rounded">
                        {alert.type.replace('-', ' ')}
                      </span>
                    </div>
                    <p className="text-sm text-ivory/80 leading-relaxed group-hover:text-ivory transition-colors">{alert.description}</p>
                  </div>
                  <span className={cn(
                    "text-[9px] uppercase tracking-widest px-2 py-0.5 rounded border font-bold",
                    alert.severity === 'high' ? "border-red-500/40 bg-red-500/10 text-red-500" : "border-purple-500/20 text-stone-500"
                  )}>
                    {alert.severity} Severity
                  </span>
                </div>
                <div className="pt-4 border-t border-purple-500/10 space-y-2">
                  <span className="text-[8px] uppercase tracking-widest text-stone-500 font-bold">Evidence Points</span>
                  <div className="flex flex-wrap gap-2">
                    {alert.evidence.map(ev => (
                      <span key={ev} className="text-[9px] text-stone-400 bg-purple-500/5 px-2 py-0.5 rounded border border-purple-500/10">#{ev}</span>
                    ))}
                  </div>
                </div>
                <motion.button 
                  whileHover={{ scale: 1.02, backgroundColor: 'rgba(212, 175, 55, 0.1)' }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleInitiateCalibration(alert.id, alert.type)}
                  className="w-full py-3 bg-gold-500/5 border border-gold-500/20 text-gold-500 text-[10px] uppercase tracking-widest font-bold hover:border-gold-500/50 transition-all shadow-[0_0_15px_rgba(212,175,55,0)] hover:shadow-[0_0_15px_rgba(212,175,55,0.1)]"
                >
                  [ INITIATE CALIBRATION RITUAL ]
                </motion.button>
              </motion.div>
            ))}
            {driftDetection.alerts.length === 0 && (
              <div className="p-12 border border-dashed border-gold-500/20 rounded-sm text-center bg-gold-500/[0.02]">
                <CheckCircle2 className="mx-auto text-gold-500/40 mb-4" size={32} />
                <p className="text-sm text-stone-500 italic font-serif">No significant drift detected. System is aligned with Personal Constitution.</p>
              </div>
            )}
          </div>
        </section>

        {/* Calibration Rituals */}
        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <RefreshCw className="text-gold-500/60" size={20} />
            <h2 className="text-lg font-serif text-ivory/90">Calibration Rituals</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {driftDetection.calibrationRituals.map((ritual) => (
              <motion.div 
                key={ritual.id} 
                whileHover={{ y: -4 }}
                className="glass-obsidian p-6 border-purple-500/15 hover:border-gold-500/30 transition-all space-y-4 group"
              >
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <h3 className="text-ivory/90 font-medium font-serif group-hover:text-gold-500 transition-colors">{ritual.title}</h3>
                    <span className="text-[9px] uppercase tracking-widest text-stone-500">{ritual.frequency} Frequency</span>
                  </div>
                  <span className={cn(
                    "text-[9px] uppercase tracking-widest px-2 py-0.5 rounded border font-bold",
                    ritual.status === 'completed' ? "border-teal/30 bg-teal/5 text-teal" : "border-gold-500/30 bg-gold-500/5 text-gold-500"
                  )}>
                    {ritual.status}
                  </span>
                </div>
                <p className="text-xs text-stone-400 leading-relaxed font-sans">{ritual.description}</p>
                <div className="pt-4 border-t border-purple-500/10 flex justify-between items-center">
                  <div className="flex flex-col">
                    <span className="text-[8px] uppercase tracking-widest text-stone-500 font-bold">Last Performed</span>
                    <span className="text-xs font-mono text-ivory/60">{ritual.lastPerformed ? new Date(ritual.lastPerformed).toLocaleDateString() : 'Never'}</span>
                  </div>
                  <button 
                    onClick={() => handlePerformRitual(ritual.id)}
                    className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-gold-500 hover:text-ivory transition-colors font-bold"
                  >
                    [ PERFORM NOW ] <ArrowRight size={12} />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Systemic Observations */}
        <section className="p-8 bg-gold-500/[0.03] border border-gold-500/10 rounded-sm space-y-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-gold-500/20" />
          <div className="flex items-center gap-2 text-gold-500/60">
            <Info size={16} />
            <h3 className="text-[10px] uppercase tracking-widest font-bold">Systemic Observations</h3>
          </div>
          {isLoading ? (
            <div className="flex items-center gap-2 text-stone-500">
              <Loader2 size={14} className="animate-spin" />
              <span className="text-xs">Loading drift analysis...</span>
            </div>
          ) : fetchError ? (
            <p className="text-sm text-stone-500 italic font-serif">
              Unable to load drift analysis: {fetchError}
            </p>
          ) : driftDetection.alerts.length === 0 ? (
            <p className="text-sm text-stone-400 leading-relaxed italic font-serif">
              No drift signals detected. System behavior is aligned with stated values and goals.
            </p>
          ) : (
            <p className="text-sm text-stone-400 leading-relaxed italic font-serif">
              {driftDetection.alerts.length} drift signal{driftDetection.alerts.length !== 1 ? 's' : ''} detected.
              {driftDetection.alerts.filter(a => a.severity === 'high').length > 0 &&
                ` ${driftDetection.alerts.filter(a => a.severity === 'high').length} high-severity alert${driftDetection.alerts.filter(a => a.severity === 'high').length !== 1 ? 's' : ''} require attention.`
              }
              {' '}Overall alignment: {(driftDetection.overallAlignment * 100).toFixed(1)}%.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
