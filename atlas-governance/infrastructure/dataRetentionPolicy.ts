/**
 * Atlas Data Retention Policy
 * Phase 4 Governance
 *
 * Defines what expires, what is durable, what is user-deletable,
 * and deletion semantics (hard vs soft) for all personalization data.
 * Critical for privacy compliance as Atlas becomes deeply personal.
 */

import { AtlasEventBus } from './eventBus';

export type DataDomain =
  | 'evolution_profile'
  | 'goal_memory'
  | 'mutation_ledger'
  | 'concept_graph'
  | 'event_stream'
  | 'evidence_state'
  | 'mind_profile'
  | 'audit_log'
  | 'conversation_history'
  | 'query_history';

export type DeletionType = 'hard' | 'soft';
export type RetentionClass = 'durable' | 'expires' | 'session_only';

export interface RetentionRule {
  domain: DataDomain;
  retentionClass: RetentionClass;
  /** Days until automatic expiry. null = never expires automatically. */
  expiryDays: number | null;
  /** Whether the user can request deletion. */
  userDeletable: boolean;
  /** Whether derived traits must also be deleted when source data is deleted. */
  cascadesTo: DataDomain[];
  deletionType: DeletionType;
  notes: string;
}

export const RETENTION_POLICIES: Record<DataDomain, RetentionRule> = {
  evolution_profile: {
    domain: 'evolution_profile',
    retentionClass: 'durable',
    expiryDays: null,
    userDeletable: true,
    cascadesTo: ['mutation_ledger', 'mind_profile'],
    deletionType: 'hard',
    notes: 'Core personalization — persists indefinitely unless user deletes. Hard delete removes derived traits.',
  },
  goal_memory: {
    domain: 'goal_memory',
    retentionClass: 'durable',
    expiryDays: null,
    userDeletable: true,
    cascadesTo: [],
    deletionType: 'hard',
    notes: 'Mission memory — user can delete individual goals or full history.',
  },
  mutation_ledger: {
    domain: 'mutation_ledger',
    retentionClass: 'durable',
    expiryDays: 365,
    userDeletable: true,
    cascadesTo: ['mind_profile'],
    deletionType: 'soft', // keep audit trail, just clear content
    notes: 'Rolled-back and quarantined mutations expire after 1 year. Committed mutations retained until user deletes.',
  },
  concept_graph: {
    domain: 'concept_graph',
    retentionClass: 'expires',
    expiryDays: 180,
    userDeletable: true,
    cascadesTo: [],
    deletionType: 'hard',
    notes: 'Graph nodes decay naturally; full graph expires after 6 months of inactivity.',
  },
  event_stream: {
    domain: 'event_stream',
    retentionClass: 'expires',
    expiryDays: 90,
    userDeletable: false, // audit integrity — user cannot delete raw event stream
    cascadesTo: [],
    deletionType: 'soft',
    notes: 'Raw event log retained for 90 days for projection rebuilds. Not user-deletable to preserve audit integrity.',
  },
  evidence_state: {
    domain: 'evidence_state',
    retentionClass: 'expires',
    expiryDays: 30,
    userDeletable: true,
    cascadesTo: ['evolution_profile'],
    deletionType: 'hard',
    notes: 'Claims and evidence expire after 30 days unless reinforced. User can clear all evidence.',
  },
  mind_profile: {
    domain: 'mind_profile',
    retentionClass: 'durable',
    expiryDays: null,
    userDeletable: true,
    cascadesTo: [],
    deletionType: 'hard',
    notes: 'Cognitive dossier — persists until user deletes. Soft data only (no raw messages).',
  },
  audit_log: {
    domain: 'audit_log',
    retentionClass: 'durable',
    expiryDays: 730, // 2 years
    userDeletable: false,
    cascadesTo: [],
    deletionType: 'soft',
    notes: 'Sovereign audit log retained for 2 years. Not user-deletable. Soft delete only for GDPR (anonymize, keep structure).',
  },
  conversation_history: {
    domain: 'conversation_history',
    retentionClass: 'durable',
    expiryDays: null,
    userDeletable: true,
    cascadesTo: ['query_history', 'evidence_state'],
    deletionType: 'hard',
    notes: 'Full message history. User can delete individual conversations or all history.',
  },
  query_history: {
    domain: 'query_history',
    retentionClass: 'expires',
    expiryDays: 90,
    userDeletable: true,
    cascadesTo: [],
    deletionType: 'hard',
    notes: 'Recent prompt history — expires after 90 days. User can clear at any time.',
  },
};

export interface DeletionRequest {
  id: string;
  userId: string;
  domain: DataDomain;
  requestedAt: string;
  cascadeTargets: DataDomain[];
  deletionType: DeletionType;
  status: 'pending' | 'completed' | 'blocked';
  blockReason?: string;
}

const deletionQueue: DeletionRequest[] = [];

/**
 * Request deletion of a data domain for a user.
 * Validates against policy (non-deletable domains are blocked).
 * Returns the full cascade targets so callers know what else will be deleted.
 */
export function requestDeletion(userId: string, domain: DataDomain): DeletionRequest {
  const policy = RETENTION_POLICIES[domain];
  const id = `del-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  if (!policy.userDeletable) {
    const req: DeletionRequest = {
      id,
      userId,
      domain,
      requestedAt: new Date().toISOString(),
      cascadeTargets: [],
      deletionType: policy.deletionType,
      status: 'blocked',
      blockReason: `Domain '${domain}' is not user-deletable per retention policy: ${policy.notes}`,
    };
    deletionQueue.push(req);
    return req;
  }

  const req: DeletionRequest = {
    id,
    userId,
    domain,
    requestedAt: new Date().toISOString(),
    cascadeTargets: policy.cascadesTo,
    deletionType: policy.deletionType,
    status: 'pending',
  };

  deletionQueue.push(req);

  AtlasEventBus.emit('EVOLUTION_RESET', userId, {
    domain,
    cascadeTargets: policy.cascadesTo,
    deletionType: policy.deletionType,
  }, 'dataRetentionPolicy');

  return req;
}

/**
 * Get domains that have passed their expiry date (for scheduled cleanup).
 */
export function getExpiredDomains(userId: string, lastActivityByDomain: Record<DataDomain, string>): DataDomain[] {
  const expired: DataDomain[] = [];
  const now = Date.now();

  for (const [domain, policy] of Object.entries(RETENTION_POLICIES) as [DataDomain, RetentionRule][]) {
    if (!policy.expiryDays) continue;
    const lastActivity = lastActivityByDomain[domain];
    if (!lastActivity) continue;
    const ageDays = (now - new Date(lastActivity).getTime()) / 86400000;
    if (ageDays > policy.expiryDays) expired.push(domain);
  }

  return expired;
}

export function getRetentionPolicy(domain: DataDomain): RetentionRule {
  return RETENTION_POLICIES[domain];
}

export function getDeletionQueue(userId: string): DeletionRequest[] {
  return deletionQueue.filter((r) => r.userId === userId);
}

export function getUserDeletableDomains(): DataDomain[] {
  return (Object.entries(RETENTION_POLICIES) as [DataDomain, RetentionRule][])
    .filter(([, policy]) => policy.userDeletable)
    .map(([domain]) => domain);
}
