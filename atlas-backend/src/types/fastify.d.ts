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
       * UUID-shaped identifier for Supabase tables whose `user_id` column is typed
       * UUID. The raw Google `sub` is a numeric string and is rejected by Postgres
       * UUID validation, so we deterministically derive a UUIDv5 from it.
       */
      supabaseId: string;
    } | null;
    /** Subscription tier resolved by attachAtlasSession from Stripe billing state. */
    subscriptionTier?: 'core' | 'sovereign' | 'zenith';
    /** Billing session bridge — populated by the billing scope preHandler. */
    atlasSession?: { userId: string; email: string };
  }
}
