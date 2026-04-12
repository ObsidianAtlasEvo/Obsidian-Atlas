/**
 * Shared types for SovereignAuditLog UI (mirrors backend sovereignSecurity.ts).
 */

export type SovereignAction =
  | 'prompt.read'
  | 'prompt.edit'
  | 'prompt.publish'
  | 'prompt.rollback'
  | 'flag.read'
  | 'flag.toggle'
  | 'flag.create'
  | 'flag.delete'
  | 'users.read'
  | 'users.evolution.read'
  | 'users.evolution.reset'
  | 'bugs.read'
  | 'bugs.update'
  | 'deploy.trigger'
  | 'release.publish'
  | 'logs.stream'
  | 'evolution.rebuild'
  | 'evolution.quarantine_override';

export interface SovereignAuditEntry {
  id: string;
  timestamp: number;
  action: SovereignAction;
  actorEmail: string;
  actorIp: string;
  targetUserId?: string;
  payload: Record<string, unknown>;
  result: 'success' | 'denied' | 'error';
  durationMs: number;
  sessionId: string;
}
