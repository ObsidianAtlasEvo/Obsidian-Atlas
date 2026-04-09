import 'fastify';

declare module 'fastify' {
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
