import type { FastifyReply, FastifyRequest } from 'fastify';
import { attachAtlasSession, getAuthenticatedUser, isGoogleAuthConfigured } from '../auth/authProvider.js';
import { isSovereignOwnerEmail } from '../intelligence/router.js';

/**
 * Governance APIs pass `userId` in query/body. When Google auth is configured,
 * require a session and restrict access to self or sovereign operator.
 */
export async function assertGovernanceAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  targetUserId: string
): Promise<boolean> {
  await attachAtlasSession(request);
  const user = await getAuthenticatedUser(request);

  if (isGoogleAuthConfigured() && !user) {
    reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Sign in to access governance data.' });
    return false;
  }

  if (!user) {
    return true;
  }

  if (user.databaseUserId === targetUserId) {
    return true;
  }

  if (isSovereignOwnerEmail(user.email)) {
    return true;
  }

  reply.code(403).send({ error: 'FORBIDDEN', message: 'Governance userId does not match signed-in user.' });
  return false;
}
