// Atlas-Audit: [EXEC-ROUTE] Verified — Local line-of-inquiry classification for posture 1–5 when user leaves routing on Auto (complements server routing).
import type { AppState } from '../types';

const ADMIN_PAT = /\b(schedule|remind|calendar|email|todo|list|password|login|settings|export|import)\b/i;
const DEEP_PAT =
  /\b(epistem|ontology|consciousness|sovereignty|meaning of|prove|paradox|first principles|cartograph|simulate all|every perspective)\b/i;
const STRATEGIC_PAT =
  /\b(strategy|stakeholder|portfolio|roadmap|scenario|tradeoff|second.order|consequence|incentive|competitive|market)\b/i;
const CHALLENGE_PAT =
  /\b(am i wrong|blind spot|assume|challenge|steelman|devil|what if i('| a)m mistaken|contradict)\b/i;

/**
 * Posture scale (Section IX):
 * 1 Concise / Direct / Administrative
 * 2 Practical / Clarifying
 * 3 Socratic / Challenging
 * 4 Strategic / Multi-perspective
 * 5 Deep Synthesis / Mind Cartography
 */
export function inferInquiryPosture(
  query: string,
  sessionIntent: AppState['sessionIntent']
): number {
  const q = query.trim();
  if (q.length < 8) return 1;
  if (ADMIN_PAT.test(q) && q.length < 120) return 1;
  if (sessionIntent === 'decide' || STRATEGIC_PAT.test(q)) return 4;
  if (sessionIntent === 'reflect' || CHALLENGE_PAT.test(q)) return 3;
  if (sessionIntent === 'map' || DEEP_PAT.test(q) || q.length > 400) return 5;
  if (sessionIntent === 'study' || sessionIntent === 'think') return 3;
  return 2;
}
