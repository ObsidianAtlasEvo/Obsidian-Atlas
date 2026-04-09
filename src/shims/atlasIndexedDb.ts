/**
 * Local-only persistence for Atlas (replaces Firestore). Single-process, offline-first.
 */

const DB_NAME = 'obsidian-atlas-local-v1';
const DB_VERSION = 1;
const DOCS = 'documents';
const AUTH = 'auth_users';

export type AuthUserRecord = {
  email: string;
  password: string;
  emailVerified: boolean;
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DOCS)) {
          db.createObjectStore(DOCS);
        }
        if (!db.objectStoreNames.contains(AUTH)) {
          db.createObjectStore(AUTH);
        }
      };
    });
  }
  return dbPromise;
}

export async function idbDocGet(path: string): Promise<Record<string, unknown> | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DOCS, 'readonly');
    const req = tx.objectStore(DOCS).get(path);
    req.onsuccess = () => resolve(req.result as Record<string, unknown> | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function idbDocPut(path: string, data: Record<string, unknown>): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DOCS, 'readwrite');
    tx.objectStore(DOCS).put(data, path);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbDocDelete(path: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DOCS, 'readwrite');
    tx.objectStore(DOCS).delete(path);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** All document paths under `collectionId/` (not nested subcollections for v1). */
export async function idbListCollection(collectionId: string): Promise<{ path: string; data: Record<string, unknown> }[]> {
  const db = await openDb();
  const prefix = `${collectionId}/`;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DOCS, 'readonly');
    const store = tx.objectStore(DOCS);
    const out: { path: string; data: Record<string, unknown> }[] = [];
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) {
        resolve(out);
        return;
      }
      const key = String(cursor.key);
      if (key.startsWith(prefix) && key.indexOf('/', prefix.length) === -1) {
        out.push({ path: key, data: cursor.value as Record<string, unknown> });
      }
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

export async function idbAuthGet(uid: string): Promise<AuthUserRecord | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUTH, 'readonly');
    const req = tx.objectStore(AUTH).get(uid);
    req.onsuccess = () => resolve(req.result as AuthUserRecord | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function idbAuthPut(uid: string, rec: AuthUserRecord): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUTH, 'readwrite');
    tx.objectStore(AUTH).put(rec, uid);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
