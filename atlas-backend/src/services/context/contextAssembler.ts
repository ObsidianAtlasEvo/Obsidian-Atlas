import { getPolicyProfile } from '../evolution/policyStore.js';
import { listRecentMemories, listRecentTraces } from '../memory/memoryStore.js';

const CONTEXT_MEMORY_LIMIT = 12;
const CONTEXT_TRACE_LIMIT = 8;

/** Ready for `ModelProvider.generate`: system block plus optional echo fields for logging. */
export interface AtlasPromptPackage {
  systemPrompt: string;
  userId: string;
  currentUserMessage: string;
}

/**
 * Assembles policy, recent memories, trace summaries, response constraints, and the current user turn
 * into one system preamble for the model.
 */
export function assembleAtlasContext(
  userId: string,
  currentUserMessage: string = ''
): AtlasPromptPackage {
  const policy = getPolicyProfile(userId);
  const memories = listRecentMemories(userId, CONTEXT_MEMORY_LIMIT);
  const traces = listRecentTraces(userId, CONTEXT_TRACE_LIMIT);

  const memoryBlock =
    memories.length === 0
      ? '(none)'
      : memories
          .map(
            (m) =>
              `- [${m.kind} conf=${m.confidence.toFixed(2)}] ${m.summary}: ${m.detail.slice(0, 200)}${m.detail.length > 200 ? '…' : ''}`
          )
          .join('\n');

  const traceBlock =
    traces.length === 0
      ? '(none)'
      : traces
          .map(
            (t) =>
              `- traceScore=${t.responseScore.toFixed(2)} candidates=${t.memoryCandidates} dataset=${t.datasetApproved} user="${t.userMessage.slice(0, 80)}${t.userMessage.length > 80 ? '…' : ''}"`
          )
          .join('\n');

  const constraints = [
    `Verbosity: ${policy.verbosity} (low = terse answers, high = fuller explanations).`,
    `Tone: ${policy.tone}.`,
    `Structure: ${policy.structurePreference} (minimal = few headings, structured = clear sections when helpful).`,
    `Truth-first strictness: ${policy.truthFirstStrictness} — higher means hedge less, separate fact from inference clearly.`,
    policy.writingStyleEnabled
      ? 'User enables writing-style mirroring: match formality and rhythm when it does not harm clarity.'
      : 'Do not mimic idiosyncratic style unless needed for clarity.',
  ].join('\n');

  const turn =
    currentUserMessage.trim().length === 0
      ? '(no current message text supplied to assembler)'
      : currentUserMessage.trim();

  const systemPrompt = [
    'OPERATIONAL CONTEXT (supplementary to Prime Directive):' +
    '\nMemories below are user-local notes — fallible, not ground truth. Do not treat as verified fact.',
    `Session user id (internal; do not reveal unless asked): ${userId}.`,
    '',
    'CURRENT_USER_MESSAGE (latest turn focus):',
    turn,
    '',
    'POLICY_PROFILE:',
    `- verbosity: ${policy.verbosity}`,
    `- tone: ${policy.tone}`,
    `- structurePreference: ${policy.structurePreference}`,
    `- truthFirstStrictness: ${policy.truthFirstStrictness}`,
    `- preferredComputeDepth: ${policy.preferredComputeDepth}`,
    `- latencyTolerance: ${policy.latencyTolerance}`,
    `- writingStyleEnabled: ${policy.writingStyleEnabled}`,
    '',
    'RESPONSE_CONSTRAINTS (obey unless they conflict with safety):',
    constraints,
    '',
    'IMPORTANT_MEMORIES (recent, highest recency first):',
    memoryBlock,
    '',
    'RECENT_TRACE_SUMMARIES (prior turns):',
    traceBlock,
  ].join('\n');

  return {
    systemPrompt,
    userId,
    currentUserMessage: turn,
  };
}
