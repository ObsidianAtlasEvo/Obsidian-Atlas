/**
 * Local auth shim (IndexedDB passwords + session). Alias: `firebase/auth`.
 */

import { idbAuthGet, idbAuthPut, type AuthUserRecord } from './atlasIndexedDb';
import { SOVEREIGN_CREATOR_EMAIL } from '../config/sovereignCreator';

const SESSION_KEY = 'atlas-local-session-v1';

export interface UserInfo {
  providerId: string;
  displayName: string | null;
  email: string | null;
  phoneNumber: string | null;
  photoURL: string | null;
}

export class User {
  readonly providerData: UserInfo[] = [];
  readonly isAnonymous = false;
  readonly tenantId: string | null = null;
  readonly metadata: { creationTime?: string; lastSignInTime?: string } = {};
  readonly refreshToken = '';
  readonly phoneNumber: string | null = null;
  displayName: string | null = null;
  photoURL: string | null = null;

  constructor(
    readonly uid: string,
    readonly email: string | null,
    public emailVerified: boolean
  ) {}

  async reload(): Promise<void> {
    const rec = await idbAuthGet(this.uid);
    if (rec) {
      this.emailVerified = rec.emailVerified;
    }
  }

  async getIdToken(): Promise<string> {
    return 'local-token';
  }

  async getIdTokenResult(): Promise<{ token: string }> {
    return { token: 'local-token' };
  }

  async delete(): Promise<void> {
    /* noop local */
  }

  toJSON(): object {
    return { uid: this.uid, email: this.email, emailVerified: this.emailVerified };
  }
}

export interface UserCredential {
  user: User;
  operationType?: string;
  providerId?: string | null;
}

export interface Auth {
  readonly currentUser: User | null;
}

function stableUidFromEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  let h = 0;
  for (let i = 0; i < normalized.length; i++) {
    h = (Math.imul(31, h) + normalized.charCodeAt(i)) | 0;
  }
  return `local_${Math.abs(h).toString(16)}`;
}

function readSession(): User | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as { uid: string; email: string | null; emailVerified: boolean };
    return new User(o.uid, o.email, o.emailVerified);
  } catch {
    return null;
  }
}

function writeSession(user: User | null): void {
  if (!user) {
    sessionStorage.removeItem(SESSION_KEY);
    return;
  }
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      uid: user.uid,
      email: user.email,
      emailVerified: user.emailVerified,
    })
  );
}

type AuthCb = (user: User | null) => void;
const authListeners = new Set<AuthCb>();

function notify(user: User | null): void {
  (auth as MutableAuth)._currentUser = user;
  authListeners.forEach((fn) => {
    try {
      fn(user);
    } catch (e) {
      console.error(e);
    }
  });
}

type MutableAuth = Auth & { _currentUser: User | null };

export const auth: MutableAuth = {
  _currentUser: readSession(),
  get currentUser() {
    return this._currentUser;
  },
};

// Restore session on load
auth._currentUser = readSession();

export function onAuthStateChanged(_auth: Auth, nextOrObserver: AuthCb): () => void {
  authListeners.add(nextOrObserver);
  queueMicrotask(() => nextOrObserver(auth.currentUser));
  return () => {
    authListeners.delete(nextOrObserver);
  };
}

/**
 * @deprecated UNSAFE — stores passwords in plaintext in IndexedDB.
 * This method is dead code and must not be re-enabled without a proper
 * hashing implementation. Google OAuth is the only supported auth path.
 * @throws Always throws in production builds.
 */
export async function signInWithEmailAndPassword(
  _auth: Auth,
  email: string,
  password: string
): Promise<UserCredential> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[AUTH] Email/password auth is disabled. Use Google OAuth.');
  }
  const trimmed = email.trim();
  const uid = stableUidFromEmail(trimmed);
  let rec = await idbAuthGet(uid);
  if (!rec) {
    rec = {
      email: trimmed,
      password,
      emailVerified: trimmed !== SOVEREIGN_CREATOR_EMAIL,
    };
    await idbAuthPut(uid, rec);
  } else if (rec.password !== password) {
    throw new Error('Firebase: Error (auth/wrong-password).');
  }
  const user = new User(uid, rec.email, rec.emailVerified);
  writeSession(user);
  notify(user);
  return { user };
}

/**
 * @deprecated UNSAFE — stores passwords in plaintext in IndexedDB.
 * This method is dead code and must not be re-enabled without a proper
 * hashing implementation. Google OAuth is the only supported auth path.
 * @throws Always throws in production builds.
 */
export async function createUserWithEmailAndPassword(
  _auth: Auth,
  email: string,
  password: string
): Promise<UserCredential> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[AUTH] Email/password auth is disabled. Use Google OAuth.');
  }
  const trimmed = email.trim();
  const uid = stableUidFromEmail(trimmed);
  const existing = await idbAuthGet(uid);
  if (existing) {
    throw new Error('Firebase: Error (auth/email-already-in-use).');
  }
  const rec: AuthUserRecord = {
    email: trimmed,
    password,
    emailVerified: trimmed !== SOVEREIGN_CREATOR_EMAIL,
  };
  await idbAuthPut(uid, rec);
  const user = new User(uid, rec.email, rec.emailVerified);
  writeSession(user);
  notify(user);
  return { user };
}

export async function signOut(_auth: Auth): Promise<void> {
  writeSession(null);
  notify(null);
}

export async function sendPasswordResetEmail(_email: string): Promise<void> {
  console.info('[Atlas local auth] Password reset is a no-op in offline mode.');
}

export async function sendEmailVerification(_user: User): Promise<void> {
  console.info('[Atlas local auth] Email verification is handled locally for the creator flow.');
}

/** Internal: mark creator email verified (local 3FA complete). */
export async function __localMarkEmailVerified(uid: string): Promise<void> {
  const rec = await idbAuthGet(uid);
  if (!rec) return;
  rec.emailVerified = true;
  await idbAuthPut(uid, rec);
  const u = new User(uid, rec.email, true);
  writeSession(u);
  notify(u);
}
