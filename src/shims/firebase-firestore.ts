/**
 * Firestore-compatible API backed by IndexedDB. Used via Vite alias `firebase/firestore`.
 */

import {
  idbDocDelete,
  idbDocGet,
  idbDocPut,
  idbListCollection,
} from './atlasIndexedDb';

export type Firestore = { readonly _atlasLocal: true };
export const db: Firestore = { _atlasLocal: true as const };

export class Timestamp {
  constructor(
    readonly seconds: number,
    readonly nanoseconds: number
  ) {}

  toDate(): Date {
    return new Date(this.seconds * 1000 + this.nanoseconds / 1e6);
  }

  toMillis(): number {
    return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6);
  }

  static now(): Timestamp {
    const ms = Date.now();
    return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6);
  }

  static fromDate(d: Date): Timestamp {
    const ms = d.getTime();
    return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6);
  }
}

const TS_MARKER = '__atlasTs';

function serializeValue(v: unknown): unknown {
  if (v instanceof Timestamp) {
    return { [TS_MARKER]: true, seconds: v.seconds, nanoseconds: v.nanoseconds };
  }
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o)) {
      out[k] = serializeValue(o[k]);
    }
    return out;
  }
  if (Array.isArray(v)) {
    return v.map(serializeValue);
  }
  return v;
}

function deserializeValue(v: unknown): unknown {
  if (v && typeof v === 'object' && !Array.isArray(v) && (v as Record<string, unknown>)[TS_MARKER] === true) {
    const t = v as { seconds: number; nanoseconds: number };
    return new Timestamp(t.seconds, t.nanoseconds);
  }
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o)) {
      out[k] = deserializeValue(o[k]);
    }
    return out;
  }
  if (Array.isArray(v)) {
    return v.map(deserializeValue);
  }
  return v;
}

export class DocumentReference {
  constructor(readonly path: string) {}
  get id(): string {
    const parts = this.path.split('/');
    return parts[parts.length - 1] ?? this.path;
  }
}

export class CollectionReference {
  constructor(readonly path: string) {}
  get id(): string {
    const parts = this.path.split('/');
    return parts[parts.length - 1] ?? this.path;
  }
}

export function doc(
  parent: Firestore | DocumentReference | CollectionReference,
  ...pathSegments: string[]
): DocumentReference {
  if (pathSegments.length < 1) {
    throw new Error('doc() requires at least one path segment');
  }
  const isRoot = parent && typeof parent === 'object' && '_atlasLocal' in parent && parent._atlasLocal;
  const base = isRoot ? '' : 'path' in parent ? parent.path : '';
  const tail = pathSegments.join('/');
  const full = base ? `${base}/${tail}` : tail;
  return new DocumentReference(full);
}

export function collection(
  parent: Firestore | DocumentReference,
  ...pathSegments: string[]
): CollectionReference {
  if (pathSegments.length < 1) {
    throw new Error('collection() requires at least one path segment');
  }
  const isRoot = parent && typeof parent === 'object' && '_atlasLocal' in parent && parent._atlasLocal;
  const base = isRoot ? '' : 'path' in parent ? parent.path : '';
  const tail = pathSegments.join('/');
  const full = base ? `${base}/${tail}` : tail;
  return new CollectionReference(full);
}

type OrderByConstraint = { _t: 'orderBy'; field: string; dir: 'asc' | 'desc' };
type LimitConstraint = { _t: 'limit'; n: number };
type WhereConstraint = { _t: 'where'; field: string; op: string; value: unknown };

export function orderBy(fieldPath: string, directionStr: 'asc' | 'desc' = 'asc'): OrderByConstraint {
  return { _t: 'orderBy', field: fieldPath, dir: directionStr };
}

export function limit(count: number): LimitConstraint {
  return { _t: 'limit', n: count };
}

export function where(fieldPath: string, op: string, value: unknown): WhereConstraint {
  return { _t: 'where', field: fieldPath, op, value };
}

export class Query {
  constructor(
    readonly _collection: CollectionReference,
    readonly _constraints: unknown[]
  ) {}
}

export function query(collectionRef: CollectionReference, ...queryConstraints: unknown[]): Query {
  return new Query(collectionRef, queryConstraints);
}

export class DocumentSnapshot {
  constructor(
    readonly ref: DocumentReference,
    private readonly _data: Record<string, unknown> | undefined
  ) {}

  exists(): boolean {
    return this._data !== undefined;
  }

  data(): Record<string, unknown> | undefined {
    return this._data === undefined ? undefined : (deserializeValue(this._data) as Record<string, unknown>);
  }

  get id(): string {
    return this.ref.id;
  }
}

export class QueryDocumentSnapshot extends DocumentSnapshot {
  data(): Record<string, unknown> {
    const d = super.data();
    if (!d) {
      throw new Error('Document does not exist');
    }
    return d;
  }
}

export class QuerySnapshot {
  constructor(readonly docs: QueryDocumentSnapshot[]) {}
}

function sortValue(data: Record<string, unknown>, field: string): string | number {
  const v = data[field];
  if (v instanceof Timestamp) return v.toMillis();
  if (v && typeof v === 'object' && (v as Record<string, unknown>)[TS_MARKER] === true) {
    return new Timestamp(
      (v as { seconds: number }).seconds,
      (v as { nanoseconds: number }).nanoseconds
    ).toMillis();
  }
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return v;
  if (v instanceof Date) return v.getTime();
  return String(v ?? '');
}

async function runQuery(q: Query): Promise<QuerySnapshot> {
  const colPath = q._collection.path;
  const rows = await idbListCollection(colPath);
  let items = rows.map((r) => {
    const raw = deserializeValue(r.data) as Record<string, unknown>;
    return new QueryDocumentSnapshot(new DocumentReference(r.path), raw);
  });

  for (const c of q._constraints) {
    if (c && typeof c === 'object' && '_t' in c) {
      if ((c as WhereConstraint)._t === 'where') {
        const w = c as WhereConstraint;
        if (w.op === '==') {
          items = items.filter((s) => {
            const d = s.data();
            return d[w.field] === w.value;
          });
        }
      }
    }
  }

  let order: OrderByConstraint | undefined;
  let lim: LimitConstraint | undefined;
  for (const c of q._constraints) {
    if (c && typeof c === 'object' && '_t' in c) {
      if ((c as OrderByConstraint)._t === 'orderBy') order = c as OrderByConstraint;
      if ((c as LimitConstraint)._t === 'limit') lim = c as LimitConstraint;
    }
  }

  if (order) {
    items = [...items].sort((a, b) => {
      const av = sortValue(a.data(), order!.field);
      const bv = sortValue(b.data(), order!.field);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return order!.dir === 'desc' ? -cmp : cmp;
    });
  }

  if (lim) {
    items = items.slice(0, lim.n);
  }

  return new QuerySnapshot(items);
}

export async function getDoc(reference: DocumentReference): Promise<DocumentSnapshot> {
  const raw = await idbDocGet(reference.path);
  const data = raw === undefined ? undefined : (deserializeValue(raw) as Record<string, unknown>);
  return new DocumentSnapshot(reference, data);
}

export async function getDocs(q: Query): Promise<QuerySnapshot> {
  return runQuery(q);
}

export async function setDoc(
  reference: DocumentReference,
  data: Record<string, unknown>,
  options?: { merge?: boolean }
): Promise<void> {
  let next = serializeValue(data) as Record<string, unknown>;
  if (options?.merge) {
    const prev = await idbDocGet(reference.path);
    if (prev) {
      const prevDeser = deserializeValue(prev) as Record<string, unknown>;
      next = serializeValue({ ...prevDeser, ...data }) as Record<string, unknown>;
    }
  }
  await idbDocPut(reference.path, next);
  notifyDoc(reference.path);
  notifyCollection(reference.path.split('/').slice(0, -1).join('/') || reference.path.split('/')[0]);
}

export async function updateDoc(reference: DocumentReference, data: Record<string, unknown>): Promise<void> {
  const prev = await idbDocGet(reference.path);
  if (!prev) {
    throw new Error(`No document to update at ${reference.path}`);
  }
  const merged = { ...(deserializeValue(prev) as Record<string, unknown>), ...data };
  await idbDocPut(reference.path, serializeValue(merged) as Record<string, unknown>);
  notifyDoc(reference.path);
  notifyCollection(reference.path.split('/').slice(0, -1).join('/') || reference.path.split('/')[0]);
}

export async function addDoc(
  collectionRef: CollectionReference,
  data: Record<string, unknown>
): Promise<DocumentReference> {
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `id_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const ref = doc(db, collectionRef.path, id);
  await setDoc(ref, data);
  return ref;
}

export async function deleteDoc(reference: DocumentReference): Promise<void> {
  await idbDocDelete(reference.path);
  notifyDoc(reference.path);
  notifyCollection(reference.path.split('/').slice(0, -1).join('/') || reference.path.split('/')[0]);
}

type DocListener = (snap: DocumentSnapshot) => void;
type QueryListener = (snap: QuerySnapshot) => void;
type ErrListener = (e: Error) => void;

const docListeners = new Map<string, Set<DocListener>>();
const queryRegistry: {
  q: Query;
  listeners: Set<QueryListener>;
  err: Set<ErrListener>;
}[] = [];

function notifyDoc(path: string): void {
  const set = docListeners.get(path);
  if (!set) return;
  void (async () => {
    const snap = await getDoc(new DocumentReference(path));
    set.forEach((fn) => {
      try {
        fn(snap);
      } catch (e) {
        console.error(e);
      }
    });
  })();
}

function notifyCollection(collectionPath: string): void {
  for (const entry of queryRegistry) {
    if (entry.q._collection.path !== collectionPath) continue;
    void (async () => {
      try {
        const snap = await runQuery(entry.q);
        entry.listeners.forEach((fn) => fn(snap));
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        entry.err.forEach((fn) => fn(err));
      }
    })();
  }
}

export function onSnapshot(
  ref: DocumentReference | Query,
  onNext: (snapshot: DocumentSnapshot | QuerySnapshot) => void,
  onError?: (error: Error) => void
): () => void {
  if (ref instanceof DocumentReference) {
    const set = docListeners.get(ref.path) ?? new Set();
    docListeners.set(ref.path, set);
    const listener: DocListener = (snap) => onNext(snap);
    set.add(listener);
    void getDoc(ref).then((snap) => onNext(snap)).catch((e) => onError?.(e instanceof Error ? e : new Error(String(e))));
    return () => {
      set.delete(listener);
      if (set.size === 0) docListeners.delete(ref.path);
    };
  }

  const q = ref as Query;
  let entry = queryRegistry.find((e) => e.q === q);
  if (!entry) {
    entry = { q, listeners: new Set(), err: new Set() };
    queryRegistry.push(entry);
  }
  const ql: QueryListener = (snap) => onNext(snap);
  entry.listeners.add(ql);
  if (onError) entry.err.add(onError);
  void runQuery(q)
    .then((snap) => onNext(snap))
    .catch((e) => onError?.(e instanceof Error ? e : new Error(String(e))));
  return () => {
    entry!.listeners.delete(ql);
    if (onError) entry!.err.delete(onError);
    if (entry!.listeners.size === 0) {
      const i = queryRegistry.indexOf(entry!);
      if (i >= 0) queryRegistry.splice(i, 1);
    }
  };
}

/** Test helper: reset in-memory listener state (optional). */
export function __resetFirestoreListenersForTests(): void {
  docListeners.clear();
  queryRegistry.length = 0;
}
