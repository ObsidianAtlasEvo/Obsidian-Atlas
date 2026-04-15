/**
 * Thin wrapper around POST /api/v1/chat/omni-stream for non-streaming (single-turn) inference.
 * Replaces all frontend ollamaComplete() calls so the browser never touches Ollama directly.
 */
import { atlasApiUrl } from './atlasApi';

export async function backendComplete(
  prompt: string,
  opts?: { system?: string; signal?: AbortSignal; json?: boolean }
): Promise<string> {
  const messages: { role: string; content: string }[] = [];
  if (opts?.system) messages.push({ role: 'system', content: opts.system });
  messages.push({ role: 'user', content: prompt });

  const url = atlasApiUrl('/v1/chat/omni-stream');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 'system', messages, posture: 3 }),
    signal: opts?.signal,
  });

  if (!res.ok) {
    throw new Error(`Backend inference failed: ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response stream');

  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';
      for (const part of parts) {
        let eventType = 'message';
        let dataStr = '';
        for (const line of part.split('\n')) {
          if (line.startsWith('event: ')) eventType = line.slice(7).trim();
          else if (line.startsWith('data: ')) dataStr = line.slice(6).trim();
        }
        if (!dataStr) continue;
        try {
          const payload = JSON.parse(dataStr) as Record<string, unknown>;
          if (eventType === 'delta' && typeof payload.text === 'string') fullText += payload.text;
          if (eventType === 'done') return fullText;
          if (eventType === 'error') throw new Error(String(payload.message ?? 'Backend error'));
        } catch (e) {
          if (e instanceof SyntaxError) continue;
          throw e;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return fullText;
}

export function parseJsonFromBackend<T = unknown>(raw: string): T {
  const trimmed = raw.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/m);
  const jsonStr = (fence ? fence[1] : trimmed).trim();
  return JSON.parse(jsonStr) as T;
}

// ── Streaming variant (mirrors AtlasChamber's streamOmniChat) ─────────────

interface StreamCallbacks {
  onToken: (token: string) => void;
  onDone: (fullText: string) => void;
  onError: (message: string, code: string) => void;
}

/**
 * Streaming SSE wrapper — drop-in replacement for lib/ollama streamChat.
 * Returns an AbortController so callers can cancel mid-stream.
 */
export function streamBackendChat(
  messages: { role: string; content: string }[],
  callbacks: StreamCallbacks,
  opts?: { posture?: number },
): AbortController {
  const controller = new AbortController();
  const { signal } = controller;

  (async () => {
    const url = atlasApiUrl('/v1/chat/omni-stream');
    let response: Response;

    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'system', messages, posture: opts?.posture ?? 3 }),
        signal,
      });
    } catch (err: unknown) {
      if (signal.aborted) { callbacks.onError('Request was cancelled', 'ABORTED'); return; }
      callbacks.onError(
        err instanceof Error && (err.message.includes('fetch') || err.message.includes('Failed to fetch'))
          ? 'Cannot reach Atlas backend.'
          : err instanceof Error ? err.message : 'Network error',
        'NETWORK',
      );
      return;
    }

    if (!response.ok) {
      callbacks.onError(`Server error ${response.status}`, 'SERVER_ERROR');
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) { callbacks.onError('No response stream', 'SERVER_ERROR'); return; }

    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          let eventType = 'message';
          let dataStr = '';
          for (const line of part.split('\n')) {
            if (line.startsWith('event: ')) eventType = line.slice(7).trim();
            else if (line.startsWith('data: ')) dataStr = line.slice(6).trim();
          }
          if (!dataStr) continue;
          try {
            const payload = JSON.parse(dataStr) as Record<string, unknown>;
            if (eventType === 'delta' && typeof payload.text === 'string') {
              fullText += payload.text;
              callbacks.onToken(payload.text);
            } else if (eventType === 'done') {
              callbacks.onDone(fullText);
              return;
            } else if (eventType === 'error') {
              callbacks.onError(String(payload.message ?? 'Server error'), String(payload.code ?? 'SERVER_ERROR'));
              return;
            }
          } catch (e) { if (e instanceof SyntaxError) continue; throw e; }
        }
      }
      if (fullText) callbacks.onDone(fullText);
      else callbacks.onError('Stream ended without response', 'SERVER_ERROR');
    } catch (err: unknown) {
      if (signal.aborted) callbacks.onError('Request was cancelled', 'ABORTED');
      else callbacks.onError(err instanceof Error ? err.message : 'Stream error', 'NETWORK');
    } finally {
      reader.releaseLock();
    }
  })();

  return controller;
}
