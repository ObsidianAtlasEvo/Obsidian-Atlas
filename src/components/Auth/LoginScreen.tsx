import React from 'react';
import { atlasAuthUrl } from '../../lib/atlasApi';

/**
 * Sovereign login — Google OAuth via Atlas backend (`GET /auth/google`).
 */
export function LoginScreen() {
  const startGoogle = () => {
    window.location.href = atlasAuthUrl('/auth/google');
  };

  return (
    <div className="min-h-[100dvh] w-full bg-[#030303] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-md space-y-12 text-center">
        <div className="space-y-3">
          <p className="text-[9px] uppercase tracking-[0.55em] text-stone/45 font-mono">Secure session required</p>
          <h1 className="text-2xl sm:text-3xl font-serif text-ivory/95 tracking-[0.35em] uppercase font-light">
            Obsidian Atlas
          </h1>
          <div className="h-px w-24 mx-auto bg-gradient-to-r from-transparent via-gold/25 to-transparent" />
        </div>

        <>
          <button
            type="button"
            onClick={startGoogle}
            className="w-full py-4 px-6 rounded-sm border border-titanium/20 bg-titanium/[0.04] text-ivory text-[11px] uppercase tracking-[0.25em] font-bold hover:border-gold/35 hover:bg-gold/[0.06] transition-all duration-300 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]"
          >
            Authenticate via Google
          </button>
          <p className="text-[10px] text-stone/40 leading-relaxed font-serif">
            You will be redirected to Google, then returned to Atlas with an encrypted session cookie.
          </p>
        </>
      </div>
    </div>
  );
}
