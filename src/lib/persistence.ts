/**
 * Atlas persistence layer.
 * Wraps the Firestore-compatible IDB shim with typed, named operations.
 * All state that should survive a page reload lives here.
 */

import {
  db,
  doc,
  collection,
  getDoc,
  setDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  Timestamp,
} from 'firebase/firestore';

import type {
  UserProfile,
  JournalEntry,
  Decision,
  PersonalDoctrine,
  Directive,
  PulseItem,
  AdaptivePosture,
  AtlasWorkspaceSnapshot,
  MemoryEntry,
} from '@/types';

// ── Collection paths ──────────────────────────────────────────────────────

const COL = {
  users: 'users',
  journal: (uid: string) => `users/${uid}/journal`,
  decisions: (uid: string) => `users/${uid}/decisions`,
  doctrine: (uid: string) => `users/${uid}/doctrine`,
  directives: (uid: string) => `users/${uid}/directives`,
  memory: (uid: string) => `users/${uid}/memory`,
  pulse: (uid: string) => `users/${uid}/pulse`,
} as const;

// ── User Profile ──────────────────────────────────────────────────────────

export async function loadUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, COL.users, uid));
  if (!snap.exists()) return null;
  return snap.data() as unknown as UserProfile;
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  await setDoc(doc(db, COL.users, profile.uid), profile as unknown as Record<string, unknown>);
}

export async function upsertUserProfile(
  uid: string,
  partial: Partial<UserProfile>
): Promise<void> {
  await setDoc(
    doc(db, COL.users, uid),
    partial as unknown as Record<string, unknown>,
    { merge: true }
  );
}

// ── Atlas Workspace Snapshot ──────────────────────────────────────────────

/**
 * Save the mutable workspace slice (journal, decisions, directives, pulse, posture, doctrine).
 * Merged into the user document — does not overwrite the full profile.
 */
export async function saveWorkspaceSnapshot(
  uid: string,
  snapshot: AtlasWorkspaceSnapshot
): Promise<void> {
  await setDoc(
    doc(db, COL.users, uid),
    {
      atlasWorkspace: {
        ...snapshot,
        updatedAt: Timestamp.now().toDate().toISOString(),
      } as unknown as Record<string, unknown>,
    } as Record<string, unknown>,
    { merge: true }
  );
}

// ── Journal ───────────────────────────────────────────────────────────────

export async function loadJournal(uid: string): Promise<JournalEntry[]> {
  const col = collection(db, COL.journal(uid));
  const q = query(col, orderBy('timestamp', 'desc'), limit(200));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as unknown as JournalEntry);
}

export async function saveJournalEntry(uid: string, entry: JournalEntry): Promise<void> {
  const ref = doc(db, COL.journal(uid), entry.id);
  await setDoc(ref, entry as unknown as Record<string, unknown>);
}

export async function deleteJournalEntry(uid: string, entryId: string): Promise<void> {
  await deleteDoc(doc(db, COL.journal(uid), entryId));
}

// ── Decisions ─────────────────────────────────────────────────────────────

export async function loadDecisions(uid: string): Promise<Decision[]> {
  const col = collection(db, COL.decisions(uid));
  const q = query(col, orderBy('createdAt', 'desc'), limit(100));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as unknown as Decision);
}

export async function saveDecision(uid: string, decision: Decision): Promise<void> {
  const ref = doc(db, COL.decisions(uid), decision.id);
  await setDoc(ref, decision as unknown as Record<string, unknown>);
}

export async function deleteDecision(uid: string, decisionId: string): Promise<void> {
  await deleteDoc(doc(db, COL.decisions(uid), decisionId));
}

// ── Personal Doctrine ─────────────────────────────────────────────────────

export async function loadDoctrine(uid: string): Promise<PersonalDoctrine[]> {
  const col = collection(db, COL.doctrine(uid));
  const snap = await getDocs(query(col, orderBy('title', 'asc')));
  return snap.docs.map((d) => d.data() as unknown as PersonalDoctrine);
}

export async function saveDoctrine(uid: string, item: PersonalDoctrine): Promise<void> {
  const ref = doc(db, COL.doctrine(uid), item.id);
  await setDoc(ref, item as unknown as Record<string, unknown>);
}

export async function deleteDoctrine(uid: string, itemId: string): Promise<void> {
  await deleteDoc(doc(db, COL.doctrine(uid), itemId));
}

// ── Directives ────────────────────────────────────────────────────────────

export async function loadDirectives(uid: string): Promise<Directive[]> {
  const col = collection(db, COL.directives(uid));
  const snap = await getDocs(query(col, orderBy('timestamp', 'desc')));
  return snap.docs.map((d) => d.data() as unknown as Directive);
}

export async function saveDirective(uid: string, directive: Directive): Promise<void> {
  const ref = doc(db, COL.directives(uid), directive.id);
  await setDoc(ref, directive as unknown as Record<string, unknown>);
}

export async function deleteDirective(uid: string, directiveId: string): Promise<void> {
  await deleteDoc(doc(db, COL.directives(uid), directiveId));
}

// ── Memory ────────────────────────────────────────────────────────────────

export async function loadMemoryLayer(
  uid: string,
  layer: 'transient' | 'working' | 'sovereign'
): Promise<MemoryEntry[]> {
  const col = collection(db, COL.memory(uid));
  const q = query(col, orderBy('timestamp', 'desc'), limit(500));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => d.data() as unknown as MemoryEntry)
    .filter((m) => m.layer === layer);
}

export async function saveMemoryEntry(uid: string, entry: MemoryEntry): Promise<void> {
  const ref = doc(db, COL.memory(uid), entry.id);
  await setDoc(ref, entry as unknown as Record<string, unknown>);
}

export async function deleteMemoryEntry(uid: string, entryId: string): Promise<void> {
  await deleteDoc(doc(db, COL.memory(uid), entryId));
}

// ── Pulse ─────────────────────────────────────────────────────────────────

export async function loadPulse(uid: string): Promise<PulseItem[]> {
  const col = collection(db, COL.pulse(uid));
  const q = query(col, orderBy('priority', 'desc'), limit(50));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as unknown as PulseItem);
}

export async function savePulseItem(uid: string, item: PulseItem): Promise<void> {
  const ref = doc(db, COL.pulse(uid), item.id);
  await setDoc(ref, item as unknown as Record<string, unknown>);
}

export async function deletePulseItem(uid: string, itemId: string): Promise<void> {
  await deleteDoc(doc(db, COL.pulse(uid), itemId));
}

// ── Helpers ───────────────────────────────────────────────────────────────

export function generateId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `id_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function nowISO(): string {
  return new Date().toISOString();
}
