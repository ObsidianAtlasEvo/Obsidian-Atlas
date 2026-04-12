import React, { useState, useEffect, useCallback } from 'react';
import { AppState, AuditLog } from '../types';
import { cn } from '../lib/utils';
import { atlasApiUrl } from '../lib/atlasApi';
import { atlasTraceUserId } from '../lib/atlasTraceContext';

interface AuditLogViewProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

export function AuditLogView({ state }: AuditLogViewProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'critical' | 'high' | 'medium' | 'low'>('all');

  const userId = atlasTraceUserId(state);

  const loadLogs = useCallback(async () => {
    try {
      const res = await fetch(
        `${atlasApiUrl('/v1/governance/audit-logs')}?userId=${encodeURIComponent(userId)}&limit=100`,
        { credentials: 'include' }
      );
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as {
        logs: Array<{
          id: string;
          action: string;
          actor: string;
          severity: string;
          timestamp: string;
          metadata?: unknown;
        }>;
      };
      const mapped: AuditLog[] = data.logs.map((l) => ({
        id: l.id,
        timestamp: l.timestamp,
        actorUid: l.actor || 'unknown',
        action: l.action,
        metadata: l.metadata,
        severity: (l.severity as AuditLog['severity']) || 'medium',
      }));
      setLogs(mapped);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadLogs();
    const id = setInterval(() => void loadLogs(), 25_000);
    return () => clearInterval(id);
  }, [loadLogs]);

  const filteredLogs = filter === 'all' ? logs : logs.filter((l) => l.severity === filter);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'text-oxblood';
      case 'high':
        return 'text-gold';
      case 'medium':
        return 'text-ivory';
      default:
        return 'text-stone';
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-serif text-ivory tracking-tight">Immutable Audit Logs</h2>
          <p className="text-[10px] font-mono uppercase tracking-widest text-stone">Governance & Security Event History · Atlas backend</p>
        </div>
        <div className="flex bg-titanium/5 border border-titanium/10 p-1 rounded-sm">
          {['all', 'critical', 'high', 'medium', 'low'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f as typeof filter)}
              className={cn(
                'px-3 py-1.5 text-[8px] uppercase tracking-widest transition-all',
                filter === f ? 'bg-gold/10 text-gold' : 'text-stone hover:text-ivory'
              )}
            >
              {f}
            </button>
          ))}
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
              <tr>
                <td colSpan={5} className="p-20 text-center text-stone uppercase tracking-widest animate-pulse">
                  Retrieving Audit Trail...
                </td>
              </tr>
            ) : filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-20 text-center text-stone uppercase tracking-widest opacity-30">
                  No Logs Recorded
                </td>
              </tr>
            ) : (
              filteredLogs.map((log) => (
                <tr key={log.id} className="border-b border-titanium/5 hover:bg-titanium/5 transition-all group">
                  <td className="p-4 text-[10px] font-mono text-stone group-hover:text-ivory transition-all whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString([], { hour12: false })}
                  </td>
                  <td className="p-4 text-[10px] font-bold text-ivory uppercase tracking-widest">{log.action}</td>
                  <td className="p-4 text-[10px] font-mono text-stone group-hover:text-ivory transition-all">
                    {(log.actorUid || 'unknown').substring(0, 8)}...
                  </td>
                  <td className="p-4">
                    <span
                      className={cn(
                        'text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 border rounded-full',
                        getSeverityColor(log.severity),
                        `border-${getSeverityColor(log.severity)}/20`
                      )}
                    >
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
