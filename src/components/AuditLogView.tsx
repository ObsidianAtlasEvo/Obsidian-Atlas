import React, { useState, useEffect, useCallback } from 'react';
import { AppState, AuditLog } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { History, ShieldCheck, AlertTriangle, Clock, Search, Filter, ChevronRight, User, RefreshCw } from 'lucide-react';
import { atlasApiUrl } from '../lib/atlasApi';
import { cn } from '../lib/utils';

interface AuditLogViewProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

export function AuditLogView({ state, setState }: AuditLogViewProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<'all' | 'critical' | 'high' | 'medium' | 'low'>('all');

  const fetchLogs = useCallback(async () => {
    const userId = state.currentUser?.uid;
    if (!userId) {
      setLoading(false);
      setError(true);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(atlasApiUrl(`/v1/governance/audit-logs?userId=${encodeURIComponent(userId)}&limit=100`), {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Backend returned ${res.status}`);
      const data = await res.json() as { logs: AuditLog[]; total: number };
      setLogs(data.logs);
    } catch {
      setError(true);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [state.currentUser?.uid]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const filteredLogs = filter === 'all' ? logs : logs.filter(l => l.severity === filter);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-oxblood';
      case 'high': return 'text-gold';
      case 'medium': return 'text-ivory';
      default: return 'text-stone';
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-serif text-ivory tracking-tight">Immutable Audit Logs</h2>
          <p className="text-[10px] font-mono uppercase tracking-widest text-stone">Governance & Security Event History</p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 text-[8px] uppercase tracking-widest border border-titanium/10 text-stone hover:text-ivory transition-all"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <div className="flex bg-titanium/5 border border-titanium/10 p-1 rounded-sm">
            {['all', 'critical', 'high', 'medium', 'low'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f as any)}
                className={cn(
                  "px-3 py-1.5 text-[8px] uppercase tracking-widest transition-all",
                  filter === f ? "bg-gold/10 text-gold" : "text-stone hover:text-ivory"
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-graphite/20 border border-titanium/10 rounded-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-titanium/10 bg-titanium/5">
              <th className="p-4 text-[8px] uppercase tracking-widest text-stone font-bold">Timestamp</th>
              <th className="p-4 text-[8px] uppercase tracking-widest text-stone font-bold">Action</th>
              <th className="p-4 text-[8px] uppercase tracking-widest text-stone font-bold">Actor</th>
              <th className="p-4 text-[8px] uppercase tracking-widest text-stone font-bold">Severity</th>
              <th className="p-4 text-[8px] uppercase tracking-widest text-stone font-bold">Metadata</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="p-20 text-center text-stone uppercase tracking-widest animate-pulse">Retrieving Audit Trail...</td></tr>
            ) : error ? (
              <tr><td colSpan={5} className="p-20 text-center text-stone uppercase tracking-widest opacity-30">Backend required for audit logs</td></tr>
            ) : filteredLogs.length === 0 ? (
              <tr><td colSpan={5} className="p-20 text-center text-stone uppercase tracking-widest opacity-30">No Logs Recorded</td></tr>
            ) : (
              filteredLogs.map((log) => (
                <tr key={log.id} className="border-b border-titanium/5 hover:bg-titanium/5 transition-all group">
                  <td className="p-4 text-[10px] font-mono text-stone group-hover:text-ivory transition-all whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString([], { hour12: false })}
                  </td>
                  <td className="p-4 text-[10px] font-bold text-ivory uppercase tracking-widest">
                    {log.action}
                  </td>
                  <td className="p-4 text-[10px] font-mono text-stone group-hover:text-ivory transition-all">
                    {log.actorUid.substring(0, 8)}...
                  </td>
                  <td className="p-4">
                    <span className={cn("text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 border rounded-full", getSeverityColor(log.severity), `border-${getSeverityColor(log.severity)}/20`)}>
                      {log.severity}
                    </span>
                  </td>
                  <td className="p-4 text-[10px] text-stone font-mono truncate max-w-xs">
                    {JSON.stringify(log.metadata)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
