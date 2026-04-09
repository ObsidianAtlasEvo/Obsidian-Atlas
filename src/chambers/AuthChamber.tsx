import React, { useState } from 'react';
import {
  auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  __localMarkEmailVerified,
} from 'firebase/auth';
import { useAtlasStore } from '../store/useAtlasStore';
import { saveUserProfile } from '../lib/persistence';
import { nowISO } from '../lib/persistence';
import type { UserProfile } from '@/types';

type AuthMode = 'sign-in' | 'register';

function AtlasGlyph() {
  return (
    <div
      style={{
        width: 64,
        height: 64,
        borderRadius: '50%',
        border: '1.5px solid rgba(201,162,39,0.35)',
        background: 'radial-gradient(circle, rgba(88,28,135,0.25) 0%, transparent 70%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 0 40px -8px rgba(88,28,135,0.4), 0 0 80px -16px rgba(201,162,39,0.1)',
      }}
    >
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(201,162,39,0.75)" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7v10l10 5 10-5V7L12 2z" />
        <path d="M12 22V12" />
        <path d="M2 7l10 5 10-5" />
      </svg>
    </div>
  );
}

export default function AuthChamber() {
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [is3FA, setIs3FA] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputFocus, setInputFocus] = useState<string | null>(null);

  const setCurrentUser = useAtlasStore((s) => s.setCurrentUser);
  const setActiveMode = useAtlasStore((s) => s.setActiveMode);
  const hydrateUserData = useAtlasStore((s) => s.hydrateUserData);

  const isCreatorEmail = email.trim().toLowerCase() === 'crowleyrc62@gmail.com';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (loading) return;

    // 3FA code verification step (creator only)
    if (is3FA) {
      // In local mode: any 6-digit code works. This is an honor-based gate.
      if (verifyCode.length !== 6) {
        setError('Enter the 6-digit verification code.');
        return;
      }
      setLoading(true);
      try {
        const uid = auth.currentUser?.uid;
        if (!uid) throw new Error('No active session');
        await __localMarkEmailVerified(uid);
        await completeSignIn(uid);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Verification failed');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }

    if (mode === 'register' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);

    try {
      if (mode === 'register') {
        const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password);
        // Build and save user profile
        const profile: UserProfile = {
          uid: user.uid,
          email: user.email ?? email.trim(),
          emailVerified: user.emailVerified,
          role: isCreatorEmail ? 'sovereign_creator' : 'registered_user',
          createdAt: nowISO(),
          securitySettings: { mfaEnabled: false, passkeyEnabled: false },
          privacySettings: { dataMinimization: true, memorySovereignty: true },
          consent: {
            acceptedTerms: true,
            informedConsent: true,
            granularConsents: {
              cognitiveSignature: true,
              questionTopology: true,
              relationshipPresence: false,
              identityArc: true,
              covenantMatching: false,
              sharedChambers: false,
              connectors: false,
              crossAccountComparison: false,
              enterpriseGovernance: false,
              modelImprovement: false,
              browserHistory: false,
            },
          },
        };
        await saveUserProfile(profile);

        if (isCreatorEmail && !user.emailVerified) {
          // Creator 3FA flow
          setIs3FA(true);
          setLoading(false);
          return;
        }

        await completeSignIn(user.uid);
      } else {
        const { user } = await signInWithEmailAndPassword(auth, email.trim(), password);

        if (isCreatorEmail && !user.emailVerified) {
          setIs3FA(true);
          setLoading(false);
          return;
        }

        await completeSignIn(user.uid);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication failed';
      if (msg.includes('wrong-password')) {
        setError('Incorrect password.');
      } else if (msg.includes('email-already-in-use')) {
        setError('An account with this email already exists. Sign in instead.');
      } else {
        setError(msg);
      }
      setLoading(false);
    }
  }

  async function completeSignIn(uid: string) {
    try {
      await hydrateUserData(uid);
      setActiveMode('atlas');
    } catch {
      setActiveMode('atlas');
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = (field: string): React.CSSProperties => ({
    width: '100%',
    background: 'rgba(5,5,8,0.6)',
    border: `1px solid ${inputFocus === field ? 'rgba(201,162,39,0.3)' : 'rgba(88,28,135,0.2)'}`,
    borderRadius: 8,
    padding: '12px 14px',
    color: 'rgba(226,232,240,0.9)',
    fontSize: '0.875rem',
    fontFamily: 'inherit',
    outline: 'none',
    transition: 'border-color 140ms ease, box-shadow 140ms ease',
    boxShadow: inputFocus === field ? '0 0 0 2px rgba(201,162,39,0.07)' : 'none',
  });

  return (
    <div
      style={{
        width: '100%',
        height: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--atlas-void-core)',
        backgroundImage: 'radial-gradient(ellipse 80% 60% at 50% 20%, rgba(88,28,135,0.1) 0%, transparent 60%)',
        padding: 24,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 400,
          animation: 'atlas-fade-in 400ms ease both',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16,
            marginBottom: 40,
          }}
        >
          <AtlasGlyph />
          <div style={{ textAlign: 'center' }}>
            <h1
              style={{
                fontSize: '1.25rem',
                fontWeight: 400,
                letterSpacing: '-0.02em',
                color: 'rgba(226,232,240,0.9)',
                margin: '0 0 4px',
              }}
            >
              {is3FA ? 'Identity Verification' : mode === 'sign-in' ? 'Access Atlas' : 'Initialize Atlas'}
            </h1>
            <p
              style={{
                fontSize: '0.8rem',
                color: 'rgba(226,232,240,0.3)',
                margin: 0,
              }}
            >
              {is3FA
                ? 'Enter the 6-digit code from your verification channel'
                : mode === 'sign-in'
                  ? 'Your sovereign intelligence system awaits'
                  : 'Create your private Atlas instance'}
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!is3FA ? (
            <>
              {/* Email */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.65rem',
                    fontWeight: 600,
                    letterSpacing: '0.1em',
                    color: 'rgba(226,232,240,0.35)',
                    textTransform: 'uppercase',
                    marginBottom: 6,
                  }}
                >
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setInputFocus('email')}
                  onBlur={() => setInputFocus(null)}
                  autoComplete="email"
                  placeholder="you@domain.com"
                  style={{
                    ...inputStyle('email'),
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    WebkitTextFillColor: 'rgba(226,232,240,0.9)',
                  }}
                />
              </div>

              {/* Password */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.65rem',
                    fontWeight: 600,
                    letterSpacing: '0.1em',
                    color: 'rgba(226,232,240,0.35)',
                    textTransform: 'uppercase',
                    marginBottom: 6,
                  }}
                >
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setInputFocus('password')}
                  onBlur={() => setInputFocus(null)}
                  autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                  placeholder="At least 8 characters"
                  style={inputStyle('password')}
                />
              </div>

              {/* Confirm password (register only) */}
              {mode === 'register' && (
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      letterSpacing: '0.1em',
                      color: 'rgba(226,232,240,0.35)',
                      textTransform: 'uppercase',
                      marginBottom: 6,
                    }}
                  >
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onFocus={() => setInputFocus('confirm')}
                    onBlur={() => setInputFocus(null)}
                    autoComplete="new-password"
                    placeholder="Repeat password"
                    style={inputStyle('confirm')}
                  />
                </div>
              )}
            </>
          ) : (
            /* 3FA code input */
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  letterSpacing: '0.1em',
                  color: 'rgba(226,232,240,0.35)',
                  textTransform: 'uppercase',
                  marginBottom: 6,
                }}
              >
                Verification Code
              </label>
              <input
                type="text"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onFocus={() => setInputFocus('code')}
                onBlur={() => setInputFocus(null)}
                placeholder="000000"
                maxLength={6}
                style={{
                  ...inputStyle('code'),
                  textAlign: 'center',
                  fontSize: '1.25rem',
                  letterSpacing: '0.3em',
                  fontFamily: "'JetBrains Mono', monospace",
                }}
                autoFocus
              />
              <p style={{ fontSize: '0.7rem', color: 'rgba(226,232,240,0.25)', marginTop: 8, textAlign: 'center' }}>
                In local mode, any 6-digit code grants access.
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div
              style={{
                background: 'rgba(239,68,68,0.07)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 6,
                padding: '10px 12px',
                fontSize: '0.8rem',
                color: 'rgba(239,68,68,0.8)',
                animation: 'atlas-fade-in 200ms ease both',
              }}
            >
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 8,
              width: '100%',
              padding: '12px 20px',
              background: loading ? 'rgba(88,28,135,0.15)' : 'rgba(88,28,135,0.25)',
              border: '1px solid rgba(88,28,135,0.4)',
              borderRadius: 8,
              color: loading ? 'rgba(226,232,240,0.3)' : 'rgba(226,232,240,0.85)',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: loading ? 'wait' : 'pointer',
              transition: 'all 140ms ease',
              fontFamily: 'inherit',
              letterSpacing: '0.02em',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                (e.target as HTMLButtonElement).style.background = 'rgba(88,28,135,0.4)';
                (e.target as HTMLButtonElement).style.borderColor = 'rgba(201,162,39,0.3)';
              }
            }}
            onMouseLeave={(e) => {
              if (!loading) {
                (e.target as HTMLButtonElement).style.background = 'rgba(88,28,135,0.25)';
                (e.target as HTMLButtonElement).style.borderColor = 'rgba(88,28,135,0.4)';
              }
            }}
          >
            {loading ? (
              <>
                <div
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    border: '1.5px solid rgba(226,232,240,0.2)',
                    borderTopColor: 'rgba(226,232,240,0.6)',
                    animation: 'spin 0.8s linear infinite',
                  }}
                />
                Processing…
              </>
            ) : is3FA ? (
              'Verify Identity'
            ) : mode === 'sign-in' ? (
              'Enter Atlas'
            ) : (
              'Initialize Instance'
            )}
          </button>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </form>

        {/* Mode toggle */}
        {!is3FA && (
          <div
            style={{
              marginTop: 24,
              textAlign: 'center',
              fontSize: '0.8rem',
              color: 'rgba(226,232,240,0.3)',
            }}
          >
            {mode === 'sign-in' ? (
              <>
                No instance yet?{' '}
                <button
                  onClick={() => { setMode('register'); setError(null); }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'rgba(201,162,39,0.7)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: 'inherit',
                    padding: 0,
                    textDecoration: 'underline',
                    textDecorationColor: 'rgba(201,162,39,0.3)',
                  }}
                >
                  Initialize one
                </button>
              </>
            ) : (
              <>
                Already initialized?{' '}
                <button
                  onClick={() => { setMode('sign-in'); setError(null); }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'rgba(201,162,39,0.7)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: 'inherit',
                    padding: 0,
                    textDecoration: 'underline',
                    textDecorationColor: 'rgba(201,162,39,0.3)',
                  }}
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        )}

        {/* Local mode notice */}
        <div
          style={{
            marginTop: 32,
            padding: '10px 14px',
            background: 'rgba(88,28,135,0.06)',
            border: '1px solid rgba(88,28,135,0.15)',
            borderRadius: 6,
            fontSize: '0.65rem',
            color: 'rgba(226,232,240,0.25)',
            letterSpacing: '0.02em',
            lineHeight: 1.6,
          }}
        >
          Local mode — all data lives on this device. No cloud sync. Sovereign by design.
        </div>
      </div>
    </div>
  );
}
