import 'fastify';
import type { SupabaseClient } from '@supabase/supabase-js';

declare module 'fastify' {
  interface FastifyInstance {
    /** Service-role Supabase client when Evolution / Sovereign persistence is enabled. */
    supabase?: SupabaseClient;
  }

  interface FastifyRequest {
    /**
     * Populated by server-side auth after OAuth/JWT verification.
     * Do not set from unauthenticated client input.
     */
    atlasVerifiedEmail?: string | null;
    /** Set when `getAuthenticatedUser` / `attachAtlasSession` resolves an OAuth JWT. */
    atlasAuthUser?: { databaseUserId: string; email: string } | null;
  }
}
