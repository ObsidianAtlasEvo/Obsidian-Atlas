import { formatVerifiedEvidenceForPrompt, type VerifiedEvidenceItem } from './researchAgent.js';
import { executeGroqGeminiDualConsensus } from './swarmOrchestrator.js';

export type ClarityTerminalHandler = (message: string) => void;

/**
 * Tavily-derived evidence is formatted once and injected identically into both Groq and Gemini lanes,
 * then Gemini Chief Judge streams the unified answer.
 */
export async function executeConsensusSwarm(input: {
  userId: string;
  userPrompt: string;
  evidence: VerifiedEvidenceItem[];
  onTerminal?: ClarityTerminalHandler;
  onDelta: (text: string) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<{ fullText: string; modelLabel: string }> {
  const { userId, userPrompt, evidence, onTerminal, onDelta, signal, timeoutMs } = input;

  const evidenceBlock = formatVerifiedEvidenceForPrompt(evidence);

  onTerminal?.('Maximum Clarity: sharing Tavily results with Groq and Gemini (identical web context)…');

  const out = await executeGroqGeminiDualConsensus({
    userId,
    clientMessages: [{ role: 'user', content: userPrompt }],
    evidenceBlock,
    onDelta,
    onSwarmTicker: (evt) => onTerminal?.(evt.message),
    signal,
    timeoutMs,
  });

  onTerminal?.('Gemini Judge synthesis complete.');

  return { fullText: out.fullText, modelLabel: out.model };
}
