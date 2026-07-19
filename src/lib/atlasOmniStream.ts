/**
 * Atlas backend streaming client — `/v1/chat/omni-stream`.
 *
 * This is the governed §VI pipeline entry point (routing, quota, policy profile,
 * swarm/consensus orchestration, quality gate, Overseer personalization). Chambers
 * that talk to the model should stream through this rather than calling a model
 * provider directly, so conversations feed memory extraction and constitutional
 * review instead of bypassing them.
 */
import { atlasApiUrl } from './atlasApi';

export interface OmniMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OmniStreamCallbacks {
  onToken: (token: string) => void;
  onDone: (fullText: string, metrics?: { tokens: number; duration: number }) => void;
  onError: (err: AtlasStreamError) => void;
}

export class AtlasStreamError extends Error {
  constructor(
    message: string,
    public readonly code: 'NETWORK' | 'TIMEOUT' | 'SERVER_ERROR' | 'ABORTED' | 'PARSE_ERROR' = 'NETWORK'
  ) {
    super(message);
    this.name = 'AtlasStreamError';
  }
}

const TIMEOUT_MS = Number(
  (import.meta as { env?: { VITE_ATLAS_INQUIRY_TIMEOUT_MS?: string } }).env
    ?.VITE_ATLAS_INQUIRY_TIMEOUT_MS ?? '300000'
);

/**
 * Stream a chat completion through the governed Atlas backend.
 * Returns an AbortController you can call .abort() on to cancel; also honors
 * an external `options.signal` so a caller's own request lifecycle can cancel it.
 */
export function streamOmniChat(
  messages: OmniMessage[],
  callbacks: OmniStreamCallbacks,
  options: { userId: string; posture?: number; lineOfInquiry?: string; signal?: AbortSignal }
): AbortController {
  const controller = new AbortController();
  const { signal } = controller;
  const onExternalAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onExternalAbort, { once: true });

  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TIMEOUT_MS);

  const cleanup = () => {
    clearTimeout(timeoutId);
    options.signal?.removeEventListener('abort', onExternalAbort);
  };

  void (async () => {
    const started = Date.now();
    let full = '';

    try {
      const res = await fetch(atlasApiUrl('/v1/chat/omni-stream'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        credentials: 'include',
        signal,
        body: JSON.stringify({
          userId: options.userId,
          messages,
          posture: options.posture,
          lineOfInquiry: options.lineOfInquiry,
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new AtlasStreamError(text || `Server returned ${res.status}`, 'SERVER_ERROR');
      }

      const reader = res.body?.getReader();
      if (!reader) throw new AtlasStreamError('No response body', 'SERVER_ERROR');

      const decoder = new TextDecoder();
      let buffer = '';
      let streamError: string | null = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        let sep: number;
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
          const block = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);

          let eventName = 'message';
          const dataLines: string[] = [];
          for (const line of block.split('\n')) {
            if (line.startsWith('event:')) eventName = line.slice(6).trim();
            else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
          }
          const dataRaw = dataLines.join('');
          let data: Record<string, unknown> | null = null;
          if (dataRaw) {
            try {
              data = JSON.parse(dataRaw) as Record<string, unknown>;
            } catch {
              data = { raw: dataRaw };
            }
          }

          if (eventName === 'delta' && typeof data?.text === 'string') {
            full += data.text;
            callbacks.onToken(data.text);
          } else if (eventName === 'done' && data) {
            const d = data as { reply?: string };
            if (typeof d.reply === 'string' && !full.trim()) full = d.reply;
          } else if (eventName === 'error') {
            streamError = String(data?.message ?? 'Atlas stream failed');
          }
        }
      }

      if (streamError) throw new AtlasStreamError(streamError, 'SERVER_ERROR');
      if (!full.trim()) throw new AtlasStreamError('Atlas returned no content for this request.', 'SERVER_ERROR');

      cleanup();
      callbacks.onDone(full, { tokens: 0, duration: Date.now() - started });
    } catch (err) {
      cleanup();

      if (err instanceof AtlasStreamError) {
        callbacks.onError(err);
        return;
      }

      if (err instanceof DOMException && err.name === 'AbortError') {
        callbacks.onError(
          timedOut
            ? new AtlasStreamError('Request timed out', 'TIMEOUT')
            : new AtlasStreamError('Request was cancelled', 'ABORTED')
        );
        return;
      }

      const message = err instanceof Error ? err.message : String(err);
      const isNetwork =
        message.includes('fetch') || message.includes('network') || message.includes('ECONNREFUSED');
      callbacks.onError(
        new AtlasStreamError(
          isNetwork ? 'Cannot reach the Atlas backend. Check your connection and try again.' : message,
          isNetwork ? 'NETWORK' : 'SERVER_ERROR'
        )
      );
    }
  })();

  return controller;
}
