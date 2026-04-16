import React, { useState, useEffect } from 'react';
import { AppState, AuditLog, EmergencyContainment } from '../types';
import { db, logAudit, handleFirestoreError, OperationType } from '../services/firebase';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  limit,
  Timestamp,
  type QuerySnapshot,
} from 'firebase/firestore';
import { ShieldAlert, ShieldCheck, Activity, History, Lock, Unlock, AlertTriangle, FileText, Terminal, Zap, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { EmergencyActivationFlow } from './EmergencyActivationFlow';
import { SOVEREIGN_CREATOR_EMAIL } from '../config/sovereignCreator';

interface EmergencyConsoleProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

export const EmergencyConsole: React.FC<EmergencyConsoleProps> = ({ state, setState }) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLifting, setIsLifting] = useState(false);
  const [activeTab, setActiveTab] = useState<'status' | 'logs' | 'recovery'>('status');

  useEffect(() => {
    const q = query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc'), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const s = snapshot as QuerySnapshot;
      const logsData = s.docs.map((d) => ({ id: d.id, ...d.data() } as AuditLog));
      setLogs(logsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'audit_logs');
    });
    return () => unsubscribe();
  }, []);

  const renderStatus = () => (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="obsidian-surface border border-red-500/20 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest text-stone">System State</span>
            <Lock className="w-4 h-4 text-red-500" />
          </div>
          <div className="text-2xl font-serif text-red-500 uppercase tracking-widest">Hard Freeze</div>
          <p className="text-[8px] text-stone uppercase tracking-widest leading-relaxed">
            All writes suspended. Self-modification disabled.
          </p>
        </div>
        <div className="obsidian-surface border border-gold/20 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest text-stone">Incident Level</span>
            <AlertTriangle className="w-4 h-4 text-gold" />
          </div>
          <div className="text-2xl font-serif text-gold uppercase tracking-widest">Level {state.emergencyStatus?.level || 4}</div>
          <p className="text-[8px] text-stone uppercase tracking-widest leading-relaxed">
            Critical system containment active.
          </p>
        </div>
        <div className="obsidian-surface border border-emerald-500/20 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest text-stone">Forensic Integrity</span>
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-serif text-emerald-500 uppercase tracking-widest">Preserved</div>
          <p className="text-[8px] text-stone uppercase tracking-widest leading-relaxed">
            Audit trails and system state snapshots locked.
          </p>
        </div>
      </div>

      <div className="obsidian-surface border border-gold/10 p-8 space-y-6">
        <div className="flex items-center gap-3 text-ivory">
          <FileText className="w-5 h-5" />
          <h3 className="text-sm font-serif uppercase tracking-widest">Incident Dossier</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <div className="flex flex-col">
              <span className="text-[8px] text-stone uppercase tracking-widest">Activation Timestamp</span>
              <span className="text-[10px] font-mono text-ivory">{state.emergencyStatus?.activatedAt}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[8px] text-stone uppercase tracking-widest">Activated By</span>
              <span className="text-[10px] font-mono text-ivory">{state.emergencyStatus?.activatedBy}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[8px] text-stone uppercase tracking-widest">Reason for Freeze</span>
              <span className="text-[10px] font-mono text-gold italic">"{state.emergencyStatus?.reason || 'N/A'}"</span>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex flex-col">
              <span className="text-[8px] text-stone uppercase tracking-widest">Snapshot State</span>
              <pre className="text-[8px] font-mono text-ivory/60 bg-obsidian p-2 border border-gold/5 overflow-auto max-h-32">
                {JSON.stringify(state.emergencyStatus?.forensicSnapshot?.configState, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderLogs = () => (
    <div className="obsidian-surface border border-gold/10 overflow-hidden flex flex-col h-[600px]">
      <div className="p-4 border-b border-gold/10 bg-gold/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <History className="w-4 h-4 text-gold" />
          <span className="text-[10px] uppercase tracking-widest text-ivory">Forensic Audit Trail</span>
        </div>
        <span className="text-[8px] text-stone uppercase tracking-widest">Last 50 Events</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2 font-mono">
        {logs.map((log) => (
          <div key={log.id} className="text-[9px] flex gap-4 p-2 border-b border-gold/5 hover:bg-gold/5 transition-colors">
            <span className="text-stone whitespace-nowrap">{new Date(log.timestamp).toLocaleTimeString()}</span>
            <span className={`w-16 uppercase tracking-widest ${
              log.severity === 'critical' ? 'text-red-500' : 
              log.severity === 'high' ? 'text-gold' : 
              'text-stone'
            }`}>{log.severity}</span>
            <span className="text-ivory flex-1">{log.action}</span>
            <span className="text-stone/60">{log.actorUid.slice(0, 8)}...</span>
          </div>
        ))}
      </div>
    </div>
  );

  const renderRecovery = () => (
    <div className="space-y-8">
      <div className="obsidian-surface border border-emerald-500/20 p-8 space-y-6">
        <div className="flex items-center gap-3 text-emerald-500">
          <RefreshCw className="w-5 h-5" />
          <h3 className="text-sm font-serif uppercase tracking-widest">Staged Recovery Plan</h3>
        </div>
        <div className="space-y-4">
          {[
            { step: 1, title: 'Integrity Verification', desc: 'Verify core system files and database schemas.', status: 'ready' },
            { step: 2, title: 'Privilege Audit', desc: 'Review all active roles and permissions.', status: 'ready' },
            { step: 3, title: 'Route Lockdown Review', desc: 'Verify all API endpoints are secure.', status: 'ready' },
            { step: 4, title: 'Staged Reactivation', desc: 'Restore minimal services for creator testing.', status: 'pending' },
            { step: 5, title: 'Full Restoration', desc: 'Lift freeze and resume normal operations.', status: 'pending' }
          ].map((item) => (
            <div key={item.step} className="flex items-start gap-4 p-4 border border-gold/5 bg-gold/5">
              <div className="w-6 h-6 rounded-full border border-gold/40 flex items-center justify-center text-[10px] text-gold font-mono">
                {item.step}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] uppercase tracking-widest text-ivory">{item.title}</span>
                  <span className={`text-[8px] uppercase tracking-widest ${item.status === 'ready' ? 'text-emerald-500' : 'text-stone'}`}>
                    {item.status}
                  </span>
                </div>
                <p className="text-[9px] text-stone leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="pt-6 border-t border-gold/10">
          <button 
            onClick={() => setIsLifting(true)}
            className="w-full py-4 bg-emerald-500/10 border border-emerald-500/40 text-emerald-500 text-[12px] uppercase tracking-[0.4em] hover:bg-emerald-500/20 transition-all"
          >
            Initiate Recovery Protocol
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-obsidian p-8 overflow-y-auto">
      <div className="max-w-6xl mx-auto w-full space-y-12">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 bg-red-500/10 border border-red-500/40 flex items-center justify-center">
              <ShieldAlert className="w-8 h-8 text-red-500" />
            </div>
            <div>
              <h1 className="text-3xl font-serif uppercase tracking-[0.4em] text-ivory">Emergency Console</h1>
              <div className="flex items-center gap-3 mt-2">
                <div className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[10px] uppercase tracking-[0.3em] text-red-500 font-mono">Hard Freeze Active</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setActiveTab('status')}
              className={`px-6 py-2 text-[10px] uppercase tracking-widest transition-all ${activeTab === 'status' ? 'bg-gold/10 text-gold border-b-2 border-gold' : 'text-stone hover:text-ivory'}`}
            >
              Status
            </button>
            <button 
              onClick={() => setActiveTab('logs')}
              className={`px-6 py-2 text-[10px] uppercase tracking-widest transition-all ${activeTab === 'logs' ? 'bg-gold/10 text-gold border-b-2 border-gold' : 'text-stone hover:text-ivory'}`}
            >
              Audit
            </button>
            <button 
              onClick={() => setActiveTab('recovery')}
              className={`px-6 py-2 text-[10px] uppercase tracking-widest transition-all ${activeTab === 'recovery' ? 'bg-gold/10 text-gold border-b-2 border-gold' : 'text-stone hover:text-ivory'}`}
            >
              Recovery
            </button>
          </div>
        </div>

        {/* Content */}
        <motion.div 
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {activeTab === 'status' && renderStatus()}
          {activeTab === 'logs' && renderLogs()}
          {activeTab === 'recovery' && renderRecovery()}
        </motion.div>

        {/* Footer Info */}
        <div className="pt-12 border-t border-gold/10 flex items-center justify-between text-[8px] text-stone uppercase tracking-widest">
          <span>Atlas Sovereign Governance Layer</span>
          <span>Incident Response Protocol v4.0</span>
          <span>Creator: {SOVEREIGN_CREATOR_EMAIL}</span>
        </div>
      </div>

      <AnimatePresence>
        {isLifting && (
          <EmergencyActivationFlow 
            state={state} 
            onClose={() => setIsLifting(false)} 
            isLifting={true}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
