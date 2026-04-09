import React, { useCallback, useEffect, useState } from 'react';
import { atlasApiUrl, isAtlasAuthDisabled } from '../../lib/atlasApi';
import { AtlasAuthProvider, type AtlasAuthSession } from './atlasAuthContext';
import { LoginScreen } from './LoginScreen';

type GuardStatus = 'loading' | 'unauthenticated' | 'authenticated';

async function fetchAtlasSession(signal?: AbortSignal): Promise<AtlasAuthSession | null> {
  const res = await fetch(atlasApiUrl('/v1/auth/session'), {
    method: 'GET',
    credentials: 'include',
    signal,
  });

  if (!res.ok) return null;

  const data = (await res.json()) as {
    authenticated?: boolean;
    databaseUserId?: string;
    email?: string;
  };

  if (
    data.authenticated === true &&
    typeof data.databaseUserId === 'string' &&
    typeof data.email === 'string'
  ) {
    return { databaseUserId: data.databaseUserId, email: data.email };
  }

  return null;
}

/**
 * Blocks the Atlas shell until a valid backend session exists (Google OAuth cookie).
 * Set `VITE_ATLAS_AUTH_DISABLED=true` only for local development without OAuth.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<GuardStatus>('loading');
  const [session, setSession] = useState<AtlasAuthSession | null>(null);

  const runCheck = useCallback(async () => {
    if (isAtlasAuthDisabled()) {
      setSession(null);
      setStatus('authenticated');
      return;
    }

    setStatus('loading');
    const ac = new AbortController();
    try {
      const s = await fetchAtlasSession(ac.signal);
      if (s) {
        setSession(s);
        setStatus('authenticated');
      } else {
        setSession(null);
        setStatus('unauthenticated');
      }
    } catch {
      setSession(null);
      setStatus('unauthenticated');
    }
  }, []);

  useEffect(() => {
    void runCheck();
  }, [runCheck]);

  if (isAtlasAuthDisabled()) {
    return <>{children}</>;
  }

  if (status === 'loading') {
    return (
      <div className="min-h-[100dvh] w-full bg-black flex flex-col items-center justify-center">
        <p className="text-[11px] text-stone/50 font-serif tracking-[0.2em] text-center px-8">
          Establishing Secure Connection…
        </p>
      </div>
    );
  }

  if (status === 'unauthenticated' || !session) {
    return <LoginScreen />;
  }

  return <AtlasAuthProvider value={session}>{children}</AtlasAuthProvider>;
}
