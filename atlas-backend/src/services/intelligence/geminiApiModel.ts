/**
 * Google AI Studio removes older model ids from generateContent; map legacy names so
 * stale GEMINI_MODEL / CONSENSUS_GEMINI_MODEL values still resolve to a working id.
 */
const DEPRECATED_GEMINI_MODELS: Record<string, string> = {
  'gemini-1.5-flash': 'gemini-2.0-flash',
  'gemini-1.5-flash-8b': 'gemini-2.0-flash',
  'gemini-1.5-flash-latest': 'gemini-2.0-flash',
  'gemini-1.5-pro': 'gemini-2.0-flash',
  'gemini-1.5-pro-latest': 'gemini-2.0-flash',
  'gemini-pro': 'gemini-2.0-flash',
};

export function resolveGeminiApiModelId(
  modelId: string | undefined | null,
  fallback = 'gemini-2.0-flash'
): string {
  const trimmed = modelId?.trim() ?? '';
  if (!trimmed) return fallback;
  return DEPRECATED_GEMINI_MODELS[trimmed] ?? trimmed;
}
