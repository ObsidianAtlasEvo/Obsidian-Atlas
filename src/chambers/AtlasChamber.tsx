import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAtlasStore } from '../store/useAtlasStore';
import { streamChat, OllamaError, type OllamaMessage } from '../lib/ollama';
import { buildAtlasSystemPrompt } from '../lib/atlasPrompt';
import { generateId, nowISO } from '../lib/persistence';
import type { UserQuestion, AnswerDepthTier, InquiryStyle } from '@/types';
import { atlasApiUrl, atlasChatUseHttpBackend } from '../lib/atlasApi';
import { atlasTraceUserId } from '../lib/atlasTraceContext';
import type { ChatRequestState } from '../db/atlasEntities';
import {
  createThread,
  appendMessage,
  saveStreamingChunk,
  finalizeMessage,
  getThreadMessages,
  recoverInterruptedRequests,
  savePromptHistory,
} from '../db/chatPersistence';

// ── Types ─────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  /** Dexie row id for incremental saves; undefined if not yet persisted. */
  dbId?: number;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  isStreaming?: boolean;
  error?: string;
  tokens?: number;
  durationMs?: number;
  requestState?: ChatRequestState;
}

type ThinkingState = 'WEIGHING CONTRADICTIONS' | 'RETRIEVING' | 'SYNTHESIZING' | null;

// ── Depth selector ────────────────────────────────────────────────────────

function DepthControl() {
  const depth = useAtlasStore((s) => s.activePosture.depth);
  const setDepth = useAtlasStore((s) => s.setDepth);

  const tiers: { value: AnswerDepthTier; label: string }[] = [
    { value: 1, label: 'Direct' },
    { value: 2, label: 'Clear' },
    { value: 3, label: 'Deep' },
    { value: 4, label: 'Full' },
    { value: 5, label: 'Total' },
  ];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {tiers.map((t) => (
        <button
          key={t.value}
          onClick={() => setDepth(t.value)}
          title={`Depth ${t.value}: ${t.label}`}
          style={{
            width: 28,
            height: 20,
            border: '1px solid',
            borderColor: depth === t.value ? 'rgba(201,162,39,0.6)' : 'rgba(88,28,135,0.25)',
            borderRadius: 3,
            background: depth === t.value ? 'rgba(201,162,39,0.12)' : 'transparent',
            color: depth === t.value ? 'rgba(201,162,39,0.9)' : 'rgba(226,232,240,0.3)',
            fontSize: '0.6rem',
            fontWeight: depth === t.value ? 600 : 400,
            cursor: 'pointer',
            transition: 'all 140ms ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {t.value}
        </button>
      ))}
      <span style={{ fontSize: '0.625rem', color: 'rgba(226,232,240,0.28)', marginLeft: 2, letterSpacing: '0.06em' }}>
        DEPTH
      </span>
    </div>
  );
}

// ── Epistemic label badge ─────────────────────────────────────────────────

const LABEL_COLORS: Record<string, string> = {
  'direct-source-backed': 'rgba(34,197,94,0.7)',
  'best-synthesis':       'rgba(99,102,241,0.7)',
  'likely-inference':     'rgba(234,179,8,0.7)',
  'contested':            'rgba(239,68,68,0.7)',
  'interpretive':         'rgba(167,139,250,0.7)',
  'exploratory':          'rgba(6,182,212,0.7)',
  'symbolic-reading':     'rgba(244,114,182,0.7)',
};

// ── Message component ─────────────────────────────────────────────────────

function MessageBubble({ msg, isLast }: { msg: ChatMessage; isLast: boolean }) {
  const isUser = msg.role === 'user';

  // Parse markdown-like formatting for assistant messages
  function renderContent(text: string) {
    // Simple markdown: ** for bold, * for italic, ``` for code blocks
    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeLines: string[] = [];
    let codeKey = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith('```')) {
        if (inCodeBlock) {
          elements.push(
            <pre key={`code-${codeKey++}`} style={{ margin: '8px 0' }}>
              <code>{codeLines.join('\n')}</code>
            </pre>
          );
          codeLines = [];
          inCodeBlock = false;
        } else {
          inCodeBlock = true;
        }
        continue;
      }

      if (inCodeBlock) {
        codeLines.push(line);
        continue;
      }

      if (line.startsWith('## ')) {
        elements.push(<h2 key={i} style={{ margin: '16px 0 8px', fontSize: '1rem', fontWeight: 500, color: 'rgba(226,232,240,0.95)', letterSpacing: '-0.01em' }}>{line.slice(3)}</h2>);
      } else if (line.startsWith('### ')) {
        elements.push(<h3 key={i} style={{ margin: '12px 0 6px', fontSize: '0.9rem', fontWeight: 500, color: 'rgba(226,232,240,0.9)' }}>{line.slice(4)}</h3>);
      } else if (line.startsWith('- ') || line.startsWith('• ')) {
        elements.push(<div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
          <span style={{ color: 'rgba(201,162,39,0.6)', marginTop: 2, flexShrink: 0 }}>—</span>
          <span>{renderInline(line.slice(2))}</span>
        </div>);
      } else if (/^\d+\. /.test(line)) {
        const num = line.match(/^(\d+)\. /)?.[1];
        elements.push(<div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
          <span style={{ color: 'rgba(201,162,39,0.5)', minWidth: 18, flexShrink: 0, fontSize: '0.75rem' }}>{num}.</span>
          <span>{renderInline(line.replace(/^\d+\. /, ''))}</span>
        </div>);
      } else if (line.trim() === '') {
        if (i > 0 && lines[i - 1]?.trim() !== '') {
          elements.push(<div key={i} style={{ height: 8 }} />);
        }
      } else {
        elements.push(<p key={i} style={{ margin: '0 0 6px' }}>{renderInline(line)}</p>);
      }
    }

    return elements;
  }

  function renderInline(text: string): React.ReactNode {
    // Bold: **text** → strong
    // Italic: *text* → em
    // Inline code: `text` → code
    // Epistemic markers: [FACT], [INFERENCE], [INTERPRETIVE], [SPECULATIVE]
    const parts: React.ReactNode[] = [];
    const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[FACT\]|\[INFERENCE\]|\[INTERPRETATION\]|\[SPECULATIVE\]|\[UNCERTAIN\])/g;
    let last = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > last) {
        parts.push(text.slice(last, match.index));
      }

      const token = match[0];
      if (token.startsWith('**')) {
        parts.push(<strong key={match.index} style={{ color: 'rgba(226,232,240,0.98)', fontWeight: 600 }}>{token.slice(2, -2)}</strong>);
      } else if (token.startsWith('*')) {
        parts.push(<em key={match.index} style={{ color: 'rgba(167,139,250,0.85)' }}>{token.slice(1, -1)}</em>);
      } else if (token.startsWith('`')) {
        parts.push(<code key={match.index} style={{ background: 'rgba(5,5,8,0.5)', border: '1px solid rgba(226,232,240,0.07)', borderRadius: 3, padding: '1px 4px', fontSize: '0.82em' }}>{token.slice(1, -1)}</code>);
      } else if (token.startsWith('[')) {
        const label = token.slice(1, -1).toLowerCase();
        const color = label === 'fact' ? 'rgba(34,197,94,0.8)' : label === 'speculative' ? 'rgba(239,68,68,0.7)' : 'rgba(234,179,8,0.7)';
        parts.push(
          <span key={match.index} style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.1em', color, background: `${color.replace('0.', '0.08')}`, border: `1px solid ${color.replace('0.', '0.2')}`, borderRadius: 3, padding: '1px 5px', margin: '0 2px', verticalAlign: 'middle' }}>
            {token.slice(1, -1)}
          </span>
        );
      }

      last = match.index + token.length;
    }

    if (last < text.length) parts.push(text.slice(last));
    return parts.length === 1 ? parts[0] : <>{parts}</>;
  }

  if (isUser) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginBottom: 16,
          animation: 'atlas-fade-in 200ms ease both',
        }}
      >
        <div
          style={{
            maxWidth: '72%',
            background: 'rgba(88, 28, 135, 0.22)',
            border: '1px solid rgba(88, 28, 135, 0.3)',
            borderRadius: '12px 12px 3px 12px',
            padding: '10px 14px',
            color: 'rgba(226,232,240,0.92)',
            fontSize: '0.875rem',
            lineHeight: 1.65,
          }}
        >
          {msg.content}
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div
      style={{
        marginBottom: 20,
        animation: 'atlas-fade-in 200ms ease both',
      }}
    >
      {/* Atlas label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            border: '1px solid rgba(201,162,39,0.4)',
            background: 'radial-gradient(circle, rgba(88,28,135,0.4) 0%, transparent 70%)',
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: '0.625rem', fontWeight: 600, letterSpacing: '0.12em', color: 'rgba(201,162,39,0.7)', textTransform: 'uppercase' }}>
          Atlas
        </span>
        {msg.durationMs && msg.durationMs > 0 && (
          <span style={{ fontSize: '0.6rem', color: 'rgba(226,232,240,0.2)' }}>
            {(msg.durationMs / 1000).toFixed(1)}s
          </span>
        )}
      </div>

      {/* Content */}
      <div
        style={{
          paddingLeft: 28,
          fontSize: '0.875rem',
          lineHeight: 1.75,
          color: 'rgba(226,232,240,0.88)',
        }}
        className={msg.isStreaming ? 'cursor-blink' : ''}
      >
        {msg.error ? (
          <div style={{ color: 'rgba(239,68,68,0.8)', fontSize: '0.8rem', padding: '8px 12px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6 }}>
            {msg.error}
          </div>
        ) : (
          <div className="atlas-prose">
            {msg.content ? renderContent(msg.content) : (
              <span style={{ color: 'rgba(226,232,240,0.25)', fontStyle: 'italic' }}>Thinking…</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Chamber ──────────────────────────────────────────────────────────

export default function AtlasChamber() {
  const store = useAtlasStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [thinkingState, setThinkingState] = useState<ThinkingState>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const streamingIdRef = useRef<string | null>(null);
  const activeThreadIdRef = useRef<string | null>(null);
  /** Debounced streaming content save interval handle. */
  const streamSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Hydrate: recover interrupted requests + load last thread from IndexedDB
  useEffect(() => {
    const uid = store.currentUser?.uid;
    if (!uid) return;
    void (async () => {
      const recovered = await recoverInterruptedRequests(uid);
      if (recovered > 0) {
        console.log(`[Atlas] recovered ${recovered} interrupted request(s) from IndexedDB`);
      }
    })();
  }, [store.currentUser?.uid]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Build conversation history for Ollama context
  const buildMessageHistory = useCallback((): OllamaMessage[] => {
    const systemPrompt = buildAtlasSystemPrompt(store);
    const history: OllamaMessage[] = [
      { role: 'system', content: systemPrompt },
    ];

    // Include last N messages for context
    const contextWindow = messages.slice(-20);
    for (const msg of contextWindow) {
      if (!msg.isStreaming && !msg.error && msg.content) {
        history.push({ role: msg.role, content: msg.content });
      }
    }

    return history;
  }, [store, messages]);

  const handleSubmit = useCallback(async () => {
    const text = inputValue.trim();
    if (!text) return;

    const seq = ++requestSeqRef.current;
    abortRef.current?.abort();

    if (isStreaming) {
      setThinkingState(null);
      setMessages((prev) =>
        prev.map((m) =>
          m.role === 'assistant' && m.isStreaming
            ? {
                ...m,
                isStreaming: false,
                content: m.content.trim(),
              }
            : m
        )
      );
    }

    const userMsgId = generateId();
    const assistantMsgId = generateId();
    streamingIdRef.current = assistantMsgId;

    const uid = store.currentUser?.uid ?? 'anon';

    // Ensure a thread exists for this session
    if (!activeThreadIdRef.current) {
      const thread = await createThread(uid, 'atlas-chamber', text.slice(0, 80));
      activeThreadIdRef.current = thread.threadId;
    }
    const tid = activeThreadIdRef.current;

    const userMessage: ChatMessage = {
      id: userMsgId,
      role: 'user',
      content: text,
      timestamp: nowISO(),
      requestState: 'idle',
    };

    const assistantMessage: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: nowISO(),
      isStreaming: true,
      requestState: 'submitting',
    };

    setInputValue('');
    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setIsStreaming(true);

    // Persist user message + placeholder assistant to IndexedDB
    const now = Date.now();
    void savePromptHistory(uid, text, 'atlas-chamber');
    void appendMessage({
      threadId: tid,
      userId: uid,
      role: 'user',
      content: text,
      requestState: 'idle',
      createdAt: now,
      updatedAt: now,
      isPartial: false,
    });
    const assistantDbId = await appendMessage({
      threadId: tid,
      userId: uid,
      role: 'assistant',
      content: '',
      requestState: 'submitting',
      createdAt: now,
      updatedAt: now,
      isPartial: true,
    });
    setMessages((prev) =>
      prev.map((m) =>
        m.id === assistantMsgId ? { ...m, dbId: assistantDbId } : m,
      ),
    );

    // Cycle thinking states for UX texture
    const thinkingStates: ThinkingState[] = ['RETRIEVING', 'WEIGHING CONTRADICTIONS', 'SYNTHESIZING'];
    let thinkingIdx = 0;
    setThinkingState(thinkingStates[0]);
    const thinkingInterval = setInterval(() => {
      thinkingIdx = (thinkingIdx + 1) % thinkingStates.length;
      setThinkingState(thinkingStates[thinkingIdx]);
    }, 1800);

    const history = buildMessageHistory();
    history.push({ role: 'user', content: text });

    const finishOk = (fullText: string, metrics?: { tokens?: number; duration?: number }) => {
      clearInterval(thinkingInterval);
      if (streamSaveTimerRef.current) {
        clearInterval(streamSaveTimerRef.current);
        streamSaveTimerRef.current = null;
      }
      if (seq !== requestSeqRef.current) return;
      setThinkingState(null);
      setIsStreaming(false);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                content: fullText,
                isStreaming: false,
                tokens: metrics?.tokens,
                durationMs: metrics?.duration,
                requestState: 'completed' as ChatRequestState,
              }
            : m
        )
      );

      void finalizeMessage(assistantDbId, 'completed', fullText, {
        tokens: metrics?.tokens,
        durationMs: metrics?.duration,
      });

      const question: UserQuestion = {
        id: userMsgId,
        text,
        timestamp: nowISO(),
        analysis: {
          style: 'diagnostic' as InquiryStyle,
          depth: store.activePosture.depth,
          dimensions: {},
        },
        response: {
          synthesis: fullText,
          latentPatterns: [],
          strategicImplications: [],
          suggestedChambers: [],
          epistemicStatus: 'inference',
          cognitiveSignatureImpact: '',
        },
      };
      store.addQuestion(question);
    };

    const finishErr = (err: OllamaError) => {
      clearInterval(thinkingInterval);
      if (streamSaveTimerRef.current) {
        clearInterval(streamSaveTimerRef.current);
        streamSaveTimerRef.current = null;
      }
      if (seq !== requestSeqRef.current) return;
      setThinkingState(null);
      setIsStreaming(false);

      let errorMsg = err.message;
      const terminalState: ChatRequestState =
        err.code === 'TIMEOUT' ? 'timed_out'
          : err.code === 'ABORTED' ? 'aborted'
          : 'failed';

      if (err.code === 'NETWORK') {
        errorMsg = 'Cannot reach the local model. Make sure Ollama is running: `ollama serve`';
      } else if (err.code === 'MODEL_NOT_FOUND') {
        errorMsg = `Model not found. Pull it with: ollama pull ${process.env.OLLAMA_MODEL ?? 'llama3.1:70b'}`;
      } else if (err.code === 'TIMEOUT') {
        errorMsg = 'Atlas stream timed out. Check backend and API keys.';
      } else if (err.code === 'ABORTED') {
        void finalizeMessage(assistantDbId, 'aborted', '', { error: 'Request cancelled' });
        return;
      }

      void finalizeMessage(assistantDbId, terminalState, '', { error: errorMsg });

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, isStreaming: false, error: errorMsg, content: '', requestState: terminalState }
            : m
        )
      );
    };

    if (atlasChatUseHttpBackend()) {
      const ac = new AbortController();
      abortRef.current = ac;
      const OMNI_STREAM_MS = 300_000;
      const STREAM_STALL_MS = 30_000;
      let timedOut = false;
      let stallAborted = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        ac.abort();
      }, OMNI_STREAM_MS);
      let stallTimer: ReturnType<typeof setTimeout> | null = null;
      const bumpStall = () => {
        if (stallTimer) clearTimeout(stallTimer);
        stallTimer = setTimeout(() => {
          stallAborted = true;
          ac.abort();
        }, STREAM_STALL_MS);
      };
      bumpStall();
      const t0 = performance.now();
      const posture = Math.min(5, Math.max(1, Math.round(Number(store.activePosture.depth) || 3))) as
        | 1
        | 2
        | 3
        | 4
        | 5;

      void (async () => {
        try {
          const res = await fetch(atlasApiUrl('/v1/chat/omni-stream'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
            credentials: 'include',
            signal: ac.signal,
            body: JSON.stringify({
              userId: atlasTraceUserId(store),
              messages: history,
              posture,
              lineOfInquiry: 'atlas-chamber',
            }),
          });
          if (!res.ok) {
            const errBody = await res.text().catch(() => '');
            throw new OllamaError(errBody || `HTTP ${res.status}`, 'SERVER_ERROR');
          }
          const reader = res.body?.getReader();
          if (!reader) throw new OllamaError('No response body', 'SERVER_ERROR');

          const dec = new TextDecoder();
          let buffer = '';
          let full = '';
          let streamError: string | null = null;

          // Periodically persist partial streaming content to IndexedDB
          streamSaveTimerRef.current = setInterval(() => {
            if (full.length > 0) {
              void saveStreamingChunk(assistantDbId, full);
            }
          }, 2000);

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            bumpStall();
            buffer += dec.decode(value, { stream: true });
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
                bumpStall();
                const piece = data.text;
                full += piece;
                setMessages((prev) =>
                  prev.map((m) => (m.id === assistantMsgId ? { ...m, content: m.content + piece } : m))
                );
              }
              if (eventName === 'done' && data && typeof data === 'object') {
                const d = data as { reply?: string };
                if (typeof d.reply === 'string' && !full.trim()) {
                  full = d.reply;
                  setMessages((prev) =>
                    prev.map((m) => (m.id === assistantMsgId ? { ...m, content: d.reply as string } : m))
                  );
                }
              }
              if (eventName === 'error') {
                streamError = String(data?.message ?? 'Atlas stream failed');
              }
            }
          }

          if (streamError) throw new OllamaError(streamError, 'SERVER_ERROR');
          if (!full.trim()) {
            throw new OllamaError(
              'Atlas returned no content. Confirm POST /api/v1/chat/omni-stream reaches the backend (proxy must forward /api).',
              'SERVER_ERROR',
            );
          }
          finishOk(full.trim(), { duration: performance.now() - t0 });
        } catch (e) {
          if (e instanceof DOMException && e.name === 'AbortError') {
            if (timedOut) {
              finishErr(new OllamaError('Atlas stream timed out. Check backend and API keys.', 'TIMEOUT'));
            } else if (stallAborted) {
              finishErr(
                new OllamaError(
                  'Stream stalled (no tokens for 30s). Check backend, model, or network.',
                  'TIMEOUT',
                ),
              );
            } else {
              finishErr(new OllamaError('Request was cancelled', 'ABORTED'));
            }
          } else if (e instanceof OllamaError) {
            finishErr(e);
          } else {
            const message = e instanceof Error ? e.message : String(e);
            const isNetwork =
              message.includes('fetch') ||
              message.includes('network') ||
              message.includes('ECONNREFUSED');
            finishErr(
              new OllamaError(
                isNetwork ? 'Cannot reach the Atlas API. Is the backend running?' : message,
                isNetwork ? 'NETWORK' : 'SERVER_ERROR',
              ),
            );
          }
        } finally {
          clearTimeout(timeout);
          if (stallTimer) clearTimeout(stallTimer);
          if (abortRef.current === ac) abortRef.current = null;
        }
      })();
      return;
    }

    abortRef.current = streamChat(history, {
      onToken: (token) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, content: m.content + token }
              : m
          )
        );
      },
      onDone: (fullText, metrics) => {
        finishOk(fullText, metrics);
      },
      onError: (err: OllamaError) => {
        finishErr(err);
      },
    });
  }, [inputValue, isStreaming, buildMessageHistory, store]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const handleAbort = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setThinkingState(null);
    setMessages((prev) =>
      prev.map((m) =>
        m.isStreaming ? { ...m, isStreaming: false } : m
      )
    );
  };

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  };

  const hasMessages = messages.length > 0;

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Messages area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: hasMessages ? '32px 40px 24px' : 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {!hasMessages ? (
          // Empty state
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 40px',
              gap: 24,
              animation: 'atlas-fade-in 400ms ease both',
            }}
          >
            {/* Sigil */}
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                border: '1.5px solid rgba(201,162,39,0.3)',
                background: 'radial-gradient(circle, rgba(88,28,135,0.2) 0%, transparent 70%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 40px -8px rgba(88,28,135,0.3)',
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(201,162,39,0.7)" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7v10l10 5 10-5V7L12 2z" />
                <path d="M12 22V12" />
                <path d="M2 7l10 5 10-5" />
              </svg>
            </div>

            <div style={{ textAlign: 'center', maxWidth: 480 }}>
              <h1
                style={{
                  fontSize: '1.4rem',
                  fontWeight: 400,
                  letterSpacing: '-0.03em',
                  color: 'rgba(226,232,240,0.9)',
                  margin: '0 0 10px',
                }}
              >
                What requires your attention?
              </h1>
              <p
                style={{
                  fontSize: '0.875rem',
                  color: 'rgba(226,232,240,0.35)',
                  margin: 0,
                  lineHeight: 1.7,
                }}
              >
                Ask anything. Think through anything. Atlas responds with depth calibrated to your posture.
              </p>
            </div>

            {/* Suggested entry points */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                justifyContent: 'center',
                maxWidth: 560,
              }}
            >
              {[
                'What should I be thinking about right now?',
                'Help me stress-test a belief I hold.',
                "What's the strongest argument against my current position?",
                'Map the system I\'m operating inside.',
                'What am I not seeing clearly?',
              ].map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => {
                    setInputValue(prompt);
                    inputRef.current?.focus();
                  }}
                  style={{
                    background: 'rgba(15,10,30,0.5)',
                    border: '1px solid rgba(88,28,135,0.2)',
                    borderRadius: 6,
                    padding: '7px 12px',
                    color: 'rgba(226,232,240,0.45)',
                    fontSize: '0.77rem',
                    cursor: 'pointer',
                    transition: 'all 140ms ease',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => {
                    (e.target as HTMLButtonElement).style.borderColor = 'rgba(201,162,39,0.3)';
                    (e.target as HTMLButtonElement).style.color = 'rgba(226,232,240,0.7)';
                    (e.target as HTMLButtonElement).style.background = 'rgba(88,28,135,0.1)';
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLButtonElement).style.borderColor = 'rgba(88,28,135,0.2)';
                    (e.target as HTMLButtonElement).style.color = 'rgba(226,232,240,0.45)';
                    (e.target as HTMLButtonElement).style.background = 'rgba(15,10,30,0.5)';
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div style={{ maxWidth: 'var(--atlas-workspace-max)', width: '100%', margin: '0 auto' }}>
              {messages.map((msg, i) => (
                <MessageBubble key={msg.id} msg={msg} isLast={i === messages.length - 1} />
              ))}
            </div>
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Thinking indicator */}
      {thinkingState && (
        <div
          style={{
            position: 'absolute',
            bottom: 120,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(15,10,30,0.85)',
            border: '1px solid rgba(88,28,135,0.25)',
            borderRadius: 20,
            padding: '5px 14px',
            fontSize: '0.6rem',
            fontWeight: 600,
            letterSpacing: '0.1em',
            color: 'rgba(201,162,39,0.7)',
            textTransform: 'uppercase',
            backdropFilter: 'blur(8px)',
            animation: 'atlas-pulse-slow 1.5s ease infinite',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {thinkingState}
        </div>
      )}

      {/* Input area */}
      <div
        style={{
          borderTop: '1px solid var(--border-structural)',
          background: 'var(--atlas-surface-shell)',
          backdropFilter: 'blur(12px)',
          padding: '16px 40px 20px',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            maxWidth: 'var(--atlas-workspace-max)',
            margin: '0 auto',
          }}
        >
          {/* Depth + controls row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 10,
            }}
          >
            <DepthControl />

            {messages.length > 0 && (
              <button
                onClick={() => setMessages([])}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'rgba(226,232,240,0.2)',
                  fontSize: '0.65rem',
                  letterSpacing: '0.08em',
                  cursor: 'pointer',
                  padding: '3px 6px',
                  borderRadius: 3,
                  transition: 'color 140ms ease',
                }}
                onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.color = 'rgba(226,232,240,0.45)'; }}
                onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.color = 'rgba(226,232,240,0.2)'; }}
              >
                CLEAR
              </button>
            )}
          </div>

          {/* Input row */}
          <div
            style={{
              display: 'flex',
              gap: 12,
              alignItems: 'flex-end',
            }}
          >
            <div
              style={{
                flex: 1,
                background: 'var(--atlas-surface-inset)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                transition: 'border-color 140ms ease, box-shadow 140ms ease',
                position: 'relative',
              }}
              onFocusCapture={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(201,162,39,0.3)';
                (e.currentTarget as HTMLDivElement).style.boxShadow = '0 0 0 2px rgba(201,162,39,0.08)';
              }}
              onBlurCapture={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-default)';
                (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
              }}
            >
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Ask Atlas anything…"
                rows={1}
                disabled={false}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  resize: 'none',
                  padding: '12px 14px',
                  color: 'rgba(226,232,240,0.9)',
                  fontSize: '0.875rem',
                  lineHeight: 1.6,
                  fontFamily: 'inherit',
                  minHeight: 44,
                  maxHeight: 220,
                  overflow: 'auto',
                }}
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore — placeholder color via CSS
                className="atlas-textarea"
              />
            </div>

            {/* Send / Stop button */}
            {isStreaming ? (
              <button
                onClick={handleAbort}
                title="Stop generation"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 8,
                  background: 'rgba(239,68,68,0.12)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  color: 'rgba(239,68,68,0.8)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'all 140ms ease',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              </button>
            ) : (
              <button
                onClick={() => void handleSubmit()}
                disabled={!inputValue.trim()}
                title="Send (Enter)"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 8,
                  background: inputValue.trim()
                    ? 'rgba(201,162,39,0.15)'
                    : 'transparent',
                  border: '1px solid',
                  borderColor: inputValue.trim()
                    ? 'rgba(201,162,39,0.4)'
                    : 'rgba(88,28,135,0.2)',
                  color: inputValue.trim()
                    ? 'rgba(201,162,39,0.9)'
                    : 'rgba(226,232,240,0.2)',
                  cursor: inputValue.trim() ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'all 140ms ease',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 2L11 13" />
                  <path d="M22 2L15 22l-4-9-9-4 20-7z" />
                </svg>
              </button>
            )}
          </div>

          {/* Footer hint */}
          <div
            style={{
              marginTop: 8,
              display: 'flex',
              gap: 16,
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: '0.6rem', color: 'rgba(226,232,240,0.18)', letterSpacing: '0.06em' }}>
              Enter to send · Shift+Enter for newline
            </span>
          </div>
        </div>
      </div>

      {/* Textarea placeholder color */}
      <style>{`
        .atlas-textarea::placeholder {
          color: rgba(226,232,240,0.2);
        }
        .atlas-textarea:focus {
          outline: none;
        }
      `}</style>
    </div>
  );
}
