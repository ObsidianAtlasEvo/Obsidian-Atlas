import { auth, __localMarkEmailVerified, type User } from '../shims/firebase-auth';
import {
  db,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  collection,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  DocumentSnapshot,
} from '../shims/firebase-firestore';
import type { EmergencyContainment } from '../types';

export { db, auth };
export { doc, getDoc, setDoc, updateDoc, onSnapshot, collection, query, where, orderBy, limit, Timestamp };
export type { User };

/** Call after creator completes local 3FA so `reload()` sees verified state. */
export async function markLocalEmailVerified(): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  await __localMarkEmailVerified(uid);
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Local store error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function logAudit(action: string, severity: 'low' | 'medium' | 'high' | 'critical', metadata: Record<string, unknown> = {}) {
  const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  const path = 'audit_logs';
  try {
    await setDoc(doc(db, path, logId), {
      id: logId,
      timestamp: Timestamp.now(),
      actorUid: auth.currentUser?.uid || 'anonymous',
      action,
      severity,
      metadata,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function setEmergencyState(state: EmergencyContainment) {
  const path = 'system_config';
  const docId = 'emergency_state';
  try {
    await setDoc(
      doc(db, path, docId),
      {
        ...state,
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );
    await logAudit(
      state.active ? 'Emergency Freeze Activated' : 'Emergency Freeze Lifted',
      'critical',
      { level: state.level, reason: state.reason }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeToEmergencyState(callback: (state: EmergencyContainment | null) => void) {
  return onSnapshot(
    doc(db, 'system_config', 'emergency_state'),
    (snapshot) => {
      const snap = snapshot as DocumentSnapshot;
      if (snap.exists()) {
        callback(snap.data() as unknown as EmergencyContainment);
      } else {
        callback(null);
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, 'system_config/emergency_state');
    }
  );
}

/** Append-only conversational trace (local IndexedDB). */
export async function appendConversationTrace(entry: {
  channel: string;
  userId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    await setDoc(doc(db, 'conversation_traces', `t_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`), {
      ...entry,
      createdAt: Timestamp.now(),
    });
  } catch (e) {
    console.warn('[Atlas] conversation trace write failed', e);
  }
}
