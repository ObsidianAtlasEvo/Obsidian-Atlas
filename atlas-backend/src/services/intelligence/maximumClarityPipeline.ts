import { executeConsensusSwarm, type ClarityTerminalHandler } from './consensusEngine.js';
import { reserveDeepResearchTavilyKey } from './quotaManager.js';
import { runSovereignTavilyResearch } from './researchAgent.js';

/**
 * Quota/BYOK Tavily research → shared web context → Groq + Gemini parallel → Gemini Chief Judge (streamed).
 */
export async function runMaximumClarityTrack(input: {
  userId: string;
  userPrompt: string;
  onTerminal?: ClarityTerminalHandler;
  onDelta: (text: string) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<{ fullText: string; modelLabel: string }> {
  const { apiKey } = reserveDeepResearchTavilyKey(input.userId);

  const evidence = await runSovereignTavilyResearch({
    userPrompt: input.userPrompt,
    tavilyApiKey: apiKey,
    onTerminal: input.onTerminal,
    signal: input.signal,
  });

  return executeConsensusSwarm({
    userId: input.userId,
    userPrompt: input.userPrompt,
    evidence,
    onTerminal: input.onTerminal,
    onDelta: input.onDelta,
    signal: input.signal,
    timeoutMs: input.timeoutMs,
  });
}
