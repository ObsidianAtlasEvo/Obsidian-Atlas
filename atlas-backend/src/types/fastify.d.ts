import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * Populated by server-side auth after OAuth/JWT verification.
     * Do not set from unauthenticated client input.
     */
    atlasVerifiedEmail?: string | null;
    /** Set when `getAuthenticatedUser` / `attachAtlasSession` resolves an OAuth JWT. */
    atlasAuthUser?: {
      databaseUserId: string;
      email: string;
      /**
       * Supabase-assigned user UUID, fetched via `supabase.auth.getUser()` at
       * JWT verification time. `null` when Supabase lookup fails or is not
       * configured.
       */
      supabaseId: string | null;
    } | null;
    /** Subscription tier resolved by attachAtlasSession from Stripe billing state. */
    subscriptionTier?: 'core' | 'sovereign' | 'zenith';
    /** Billing session bridge — populated by the billing scope preHandler. */
    atlasSession?: { userId: string; email: string };
  }
}
