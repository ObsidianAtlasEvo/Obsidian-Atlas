import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAtlasStore } from '../store/useAtlasStore';
import { atlasApiUrl, sanitizeAtlasError } from '../lib/atlasApi';
import { buildAtlasSystemPrompt } from '../lib/atlasPrompt';
import { generateId, nowISO } from '../lib/persistence';
import { useChatRequestState, type ChatRequestStatus } from '../hooks/useChatRequestState';
import type { UserQuestion, AnswerDepthTier, InquiryStyle } from '@/types';

// ── Types ─────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  isStreaming?: boolean;
  requestStatus?: ChatRequestStatus;
  error?: string;
  tokens?: number;
  durationMs?: number;
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

  function renderContent(text: string) {
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
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16, animation: 'atlas-fade-in 200ms ease both' }}>
        <div style={{ maxWidth: '72%', background: 'rgba(88, 28, 135, 0.22)', border: '1px solid rgba(88, 28, 135, 0.3)', borderRadius: '12px 12px 3px 12px', padding: '10px 14px', color: 'rgba(226,232,240,0.92)', fontSize: '0.875rem', lineHeight: 1.65 }}>
          {msg.content}
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 20, animation: 'atlas-fade-in 200ms ease both' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ width: 20, height: 20, borderRadius: '50%', border: '1px solid rgba(201,162,39,0.4)', background: 'radial-gradient(circle, rgba(88,28,135,0.4) 0%, transparent 70%)', flexShrink: 0 }} />
        <span style={{ fontSize: '0.625rem', fontWeight: 600, letterSpacing: '0.12em', color: 'rgba(201,162,39,0.7)', textTransform: 'uppercase' }}>
          Atlas
        </span>
        {msg.durationMs && msg.durationMs > 0 && (
          <span style={{ fontSize: '0.6rem', color: 'rgba(226,232,240,0.2)' }}>
            {(msg.durationMs / 1000).toFixed(1)}s
          </span>
        )}
      </div>
      <div style={{ paddingLeft: 28, fontSize: '0.875rem', lineHeight: 1.75, color: 'rgba(226,232,240,0.88)' }} className={msg.isStreaming ? 'cursor-blink' : ''}>
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

// ── SSE streaming helper ───────────────────────────────────────────────────

interface StreamCallbacks {
  onToken: (token: string) => void;
  onDone: (fullText: string, metrics?: { tokens?: number; duration?: number }) => void;
  onError: (message: string, code: string) => void;
}

async function streamOmniChat(
  messages: { role: string; content: string }[],
  userId: string,
  posture: number,
  callbacks: StreamCallbacks,
  signal: AbortSignal,
): Promise<void> {
  const url = atlasApiUrl('/v1/chat/omni-stream');
  let response: Response;

  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, messages, posture }),
      signal,
    });
  } catch (err: unknown) {
    if (signal.aborted) {
      callbacks.onError('Request was cancelled', 'ABORTED');
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    callbacks.onError(
      msg.includes('fetch') || msg.includes('network') || msg.includes('Failed to fetch')
        ? 'Cannot reach Atlas backend. Check your connection.'
        : msg,
      'NETWORK',
    );
    return;
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      callbacks.onError('Authentication required. Please sign in to continue.', 'AUTH');
    } else {
      callbacks.onError(`Server error ${response.status}`, 'SERVER_ERROR');
    }
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    callbacks.onError('No response stream', 'SERVER_ERROR');
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let startTime = Date.now();
  let totalTokens = 0;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';

      for (const part of parts) {
        const lines = part.split('\n');
        let eventType = 'message';
        let dataStr = '';

        for (const line of lines) {
          if (line.startsWith('event: ')) eventType = line.slice(7).trim();
          else if (line.startsWith('data: ')) dataStr = line.slice(6).trim();
        }

        if (!dataStr) continue;

        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(dataStr) as Record<string, unknown>;
        } catch {
          continue;
        }

        if (eventType === 'delta' && typeof payload.text === 'string') {
          fullText += payload.text;
          callbacks.onToken(payload.text);
        } else if (eventType === 'done') {
          const tokens = typeof payload.tokens === 'number' ? payload.tokens : undefined;
          const duration = Date.now() - startTime;
          callbacks.onDone(fullText, { tokens, duration });
          return;
        } else if (eventType === 'error') {
          const msg = typeof payload.message === 'string' ? sanitizeAtlasError(payload.message) : 'Unknown server error';
          const code = typeof payload.code === 'string' ? payload.code : 'SERVER_ERROR';
          callbacks.onError(msg, code);
          return;
        }
        // Ignore: status, routing, route, swarm_ticker, overseer_annotation, clarity_terminal
      }
    }

    // Stream ended without a 'done' event — treat accumulated text as complete
    if (fullText) {
      callbacks.onDone(fullText, { duration: Date.now() - startTime });
    } else {
      callbacks.onError('Stream ended without a response.', 'SERVER_ERROR');
    }
  } catch (err: unknown) {
    if (signal.aborted) {
      callbacks.onError('Request was cancelled', 'ABORTED');
    } else {
      callbacks.onError(err instanceof Error ? err.message : 'Stream read error', 'NETWORK');
    }
  } finally {
    reader.releaseLock();
  }
}

// ── Main Chamber ──────────────────────────────────────────────────────────

export default function AtlasChamber() {
  const store = useAtlasStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [thinkingState, setThinkingState] = useState<ThinkingState>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const thinkingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const request = useChatRequestState();

  useEffect(() => {
    const activeConv = store.conversations.find((c) => c.id === store.activeConversationId);
    if (activeConv && activeConv.messages && activeConv.messages.length > 0) {
      setMessages(
        activeConv.messages.map((m) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          timestamp: m.timestamp,
          requestStatus: (m.requestStatus ?? 'completed') as ChatRequestStatus,
          error: m.error,
          tokens: m.tokens,
          durationMs: m.durationMs,
        })),
      );
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    return () => {
      request.clearWatchdog();
      if (thinkingIntervalRef.current) clearInterval(thinkingIntervalRef.current);
    };
  }, [request]);

  const buildMessageHistory = useCallback((): { role: string; content: string }[] => {
    const systemPrompt = buildAtlasSystemPrompt(store);
    const history: { role: string; content: string }[] = [{ role: 'system', content: systemPrompt }];
    const contextWindow = messages.slice(-20);
    for (const msg of contextWindow) {
      if (!msg.isStreaming && !msg.error && msg.content) {
        history.push({ role: msg.role, content: msg.content });
      }
    }
    return history;
  }, [store, messages]);

  const finalizeMessage = useCallback((assistantMsgId: string, patch: Partial<ChatMessage>) => {
    setMessages((prev) => prev.map((m) => m.id === assistantMsgId ? { ...m, ...patch, isStreaming: false } : m));
  }, []);

  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingContentRef = useRef<string>('');

  const handleSubmit = useCallback(async () => {
    const text = inputValue.trim();
    if (!text) return;

    if (request.stateRef.current.status === 'submitting' || request.stateRef.current.status === 'streaming') {
      request.abortCurrent();
      const oldId = request.stateRef.current.assistantMsgId;
      if (oldId) finalizeMessage(oldId, { requestStatus: 'aborted' });
    }

    const userMsgId = generateId();
    const assistantMsgId = generateId();

    const userMessage: ChatMessage = { id: userMsgId, role: 'user', content: text, timestamp: nowISO() };
    const assistantMessage: ChatMessage = { id: assistantMsgId, role: 'assistant', content: '', timestamp: nowISO(), isStreaming: true, requestStatus: 'submitting' };

    setInputValue('');
    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setIsStreaming(true);

    let convId = store.activeConversationId;
    if (!convId) convId = store.createConversation();
    store.addConversationMessage(convId, { id: userMsgId, role: 'user', content: text, timestamp: nowISO() });
    store.addConversationMessage(convId, { id: assistantMsgId, role: 'assistant', content: '', timestamp: nowISO(), requestStatus: 'submitting' });

    pendingContentRef.current = '';
    const controller = request.begin(assistantMsgId);

    const thinkingStates: ThinkingState[] = ['RETRIEVING', 'WEIGHING CONTRADICTIONS', 'SYNTHESIZING'];
    let thinkingIdx = 0;
    setThinkingState(thinkingStates[0]);
    if (thinkingIntervalRef.current) clearInterval(thinkingIntervalRef.current);
    thinkingIntervalRef.current = setInterval(() => {
      thinkingIdx = (thinkingIdx + 1) % thinkingStates.length;
      setThinkingState(thinkingStates[thinkingIdx]);
    }, 1800);

    const cleanupThinking = () => {
      if (thinkingIntervalRef.current) { clearInterval(thinkingIntervalRef.current); thinkingIntervalRef.current = null; }
      setThinkingState(null);
    };

    const handleWatchdogTimeout = () => {
      controller.abort();
      cleanupThinking();
      setIsStreaming(false);
      request.transition('timed_out');
      finalizeMessage(assistantMsgId, { requestStatus: 'timed_out', error: 'Request timed out — no response received within 30 seconds.' });
    };

    request.startWatchdog(handleWatchdogTimeout);

    const history = buildMessageHistory();
    history.push({ role: 'user', content: text });

    const userId = store.currentUser?.uid ?? store.currentUser?.email ?? 'anonymous';
    const posture = store.activePosture.depth ?? 3;

    const flushToStore = (content: string) => {
      if (convId) store.updateConversationMessage(convId, assistantMsgId, { content, requestStatus: 'streaming' });
    };

    await streamOmniChat(
      history,
      userId,
      posture,
      {
        onToken: (token) => {
          if (request.stateRef.current.status === 'submitting') request.transition('streaming');
          request.resetWatchdog(handleWatchdogTimeout);
          pendingContentRef.current += token;
          setMessages((prev) => prev.map((m) => m.id === assistantMsgId ? { ...m, content: m.content + token, requestStatus: 'streaming' } : m));
          if (!persistTimerRef.current) {
            persistTimerRef.current = setTimeout(() => {
              persistTimerRef.current = null;
              flushToStore(pendingContentRef.current);
            }, 500);
          }
        },
        onDone: (fullText, metrics) => {
          if (persistTimerRef.current) { clearTimeout(persistTimerRef.current); persistTimerRef.current = null; }
          cleanupThinking();
          setIsStreaming(false);
          request.transition('completed');
          finalizeMessage(assistantMsgId, { content: fullText, requestStatus: 'completed', tokens: metrics?.tokens, durationMs: metrics?.duration });
          if (convId) store.updateConversationMessage(convId, assistantMsgId, { content: fullText, requestStatus: 'completed', tokens: metrics?.tokens, durationMs: metrics?.duration });

          const question: UserQuestion = {
            id: userMsgId,
            text,
            timestamp: nowISO(),
            analysis: { style: 'diagnostic' as InquiryStyle, depth: store.activePosture.depth, dimensions: {} },
            response: { synthesis: fullText, latentPatterns: [], strategicImplications: [], suggestedChambers: [], epistemicStatus: 'inference', cognitiveSignatureImpact: '' },
          };
          store.addQuestion(question);

          if (store.resonance?.isLearning !== false) {
            store.addResonanceObservation({ timestamp: nowISO(), signal: fullText.slice(0, 200), dimension: 'inquiry', strength: 0.5, context: text.slice(0, 100), sessionId: convId ?? undefined });
            store.addResonanceGraphNode({ label: text.slice(0, 40), type: 'concept', weight: 1 });
          }
        },
        onError: (message, code) => {
          if (persistTimerRef.current) { clearTimeout(persistTimerRef.current); persistTimerRef.current = null; }
          cleanupThinking();
          setIsStreaming(false);

          if (code === 'ABORTED') {
            request.transition('aborted');
            finalizeMessage(assistantMsgId, { requestStatus: 'aborted' });
            if (convId) store.updateConversationMessage(convId, assistantMsgId, { content: pendingContentRef.current, requestStatus: 'aborted' });
            return;
          }

          if (code === 'TIMEOUT') {
            request.transition('timed_out');
            finalizeMessage(assistantMsgId, { requestStatus: 'timed_out', error: 'Request timed out.', content: '' });
            if (convId) store.updateConversationMessage(convId, assistantMsgId, { requestStatus: 'timed_out', error: 'Request timed out.' });
            return;
          }

          request.transition('failed');
          finalizeMessage(assistantMsgId, { requestStatus: 'failed', error: message, content: '' });
          if (convId) store.updateConversationMessage(convId, assistantMsgId, { requestStatus: 'failed', error: message, content: '' });
        },
      },
      controller.signal,
    );
  }, [inputValue, buildMessageHistory, store, request, finalizeMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSubmit(); }
  };

  const handleAbort = () => {
    request.abortCurrent();
    setIsStreaming(false);
    setThinkingState(null);
    if (thinkingIntervalRef.current) { clearInterval(thinkingIntervalRef.current); thinkingIntervalRef.current = null; }
    setMessages((prev) => prev.map((m) => m.isStreaming ? { ...m, isStreaming: false, requestStatus: 'aborted' as ChatRequestStatus } : m));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  };

  const hasMessages = messages.length > 0;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}>
      {/* Messages area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: hasMessages ? '32px 40px 24px' : 0, display: 'flex', flexDirection: 'column' }}>
        {!hasMessages ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 40px', gap: 24, animation: 'atlas-fade-in 400ms ease both' }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', border: '1.5px solid rgba(201,162,39,0.3)', background: 'radial-gradient(circle, rgba(88,28,135,0.2) 0%, transparent 70%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 40px -8px rgba(88,28,135,0.3)' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(201,162,39,0.7)" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7v10l10 5 10-5V7L12 2z" />
                <path d="M12 22V12" />
                <path d="M2 7l10 5 10-5" />
              </svg>
            </div>
            <div style={{ textAlign: 'center', maxWidth: 480 }}>
              <h1 style={{ fontSize: '1.4rem', fontWeight: 400, letterSpacing: '-0.03em', color: 'rgba(226,232,240,0.9)', margin: '0 0 10px' }}>What requires your attention?</h1>
              <p style={{ fontSize: '0.875rem', color: 'rgba(226,232,240,0.35)', margin: 0, lineHeight: 1.7 }}>Ask anything. Think through anything. Atlas responds with depth calibrated to your posture.</p>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 560 }}>
              {[
                'What should I be thinking about right now?',
                'Help me stress-test a belief I hold.',
                "What's the strongest argument against my current position?",
                'Map the system I\'m operating inside.',
                'What am I not seeing clearly?',
              ].map((prompt) => (
                <button key={prompt} onClick={() => { setInputValue(prompt); inputRef.current?.focus(); }}
                  style={{ background: 'rgba(15,10,30,0.5)', border: '1px solid rgba(88,28,135,0.2)', borderRadius: 6, padding: '7px 12px', color: 'rgba(226,232,240,0.45)', fontSize: '0.77rem', cursor: 'pointer', transition: 'all 140ms ease', textAlign: 'left' }}
                  onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.borderColor = 'rgba(201,162,39,0.3)'; (e.target as HTMLButtonElement).style.color = 'rgba(226,232,240,0.7)'; (e.target as HTMLButtonElement).style.background = 'rgba(88,28,135,0.1)'; }}
                  onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.borderColor = 'rgba(88,28,135,0.2)'; (e.target as HTMLButtonElement).style.color = 'rgba(226,232,240,0.45)'; (e.target as HTMLButtonElement).style.background = 'rgba(15,10,30,0.5)'; }}>
                  {prompt}
                </button>
              ))}
            </div>
            {store.conversations.length > 0 && (
              <div style={{ marginTop: 32, width: '100%', maxWidth: 560 }}>
                <p style={{ fontSize: '0.6rem', color: 'rgba(226,232,240,0.2)', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 10 }}>Recent Sessions</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[...store.conversations].sort((a, b) => new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime()).slice(0, 5).map((conv) => (
                    <button key={conv.id} onClick={() => { store.setActiveConversationId(conv.id); setMessages(conv.messages.map((m) => ({ id: m.id, role: m.role as 'user' | 'assistant', content: m.content, timestamp: m.timestamp, requestStatus: (m.requestStatus ?? 'completed') as ChatRequestStatus, error: m.error, tokens: m.tokens, durationMs: m.durationMs }))); }}
                      style={{ width: '100%', textAlign: 'left', padding: '10px 14px', borderRadius: 6, background: 'rgba(15,10,30,0.5)', border: '1px solid rgba(88,28,135,0.15)', cursor: 'pointer', transition: 'all 140ms ease' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(201,162,39,0.25)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(88,28,135,0.08)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(88,28,135,0.15)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(15,10,30,0.5)'; }}>
                      <div style={{ fontSize: '0.75rem', color: 'rgba(226,232,240,0.6)', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {conv.messages.find((m) => m.role === 'user')?.content?.slice(0, 80) ?? 'Session'}
                      </div>
                      <div style={{ fontSize: '0.62rem', color: 'rgba(226,232,240,0.22)' }}>
                        {new Date(conv.updatedAt ?? conv.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        {conv.messages.length > 0 && <> · {Math.floor(conv.messages.length / 2)} exchanges</>}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <MessageBubble key={msg.id} msg={msg} isLast={i === messages.length - 1} />
            ))}
            {thinkingState && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingLeft: 28, animation: 'atlas-fade-in 200ms ease both' }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[0, 1, 2].map((i) => (
                    <div key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(201,162,39,0.5)', animation: `atlas-pulse 1.2s ease ${i * 0.2}s infinite` }} />
                  ))}
                </div>
                <span style={{ fontSize: '0.62rem', color: 'rgba(226,232,240,0.25)', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600 }}>
                  {thinkingState}
                </span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input area */}
      <div style={{ padding: '0 40px 32px', flexShrink: 0 }}>
        {hasMessages && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingLeft: 2 }}>
            <DepthControl />
            {isStreaming && (
              <button onClick={handleAbort} style={{ background: 'transparent', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 5, padding: '3px 10px', color: 'rgba(239,68,68,0.5)', fontSize: '0.65rem', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.06em', transition: 'all 140ms ease' }}
                onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.borderColor = 'rgba(239,68,68,0.5)'; (e.target as HTMLButtonElement).style.color = 'rgba(239,68,68,0.8)'; }}
                onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.borderColor = 'rgba(239,68,68,0.25)'; (e.target as HTMLButtonElement).style.color = 'rgba(239,68,68,0.5)'; }}>
                STOP
              </button>
            )}
          </div>
        )}
        <div style={{ position: 'relative', background: 'rgba(10,7,20,0.7)', border: '1px solid rgba(88,28,135,0.2)', borderRadius: 10, transition: 'border-color 200ms ease' }}
          onFocusCapture={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(88,28,135,0.45)'; }}
          onBlurCapture={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(88,28,135,0.2)'; }}>
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask Atlas anything…"
            rows={1}
            style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', resize: 'none', padding: '14px 52px 14px 16px', color: 'rgba(226,232,240,0.9)', fontSize: '0.875rem', fontFamily: 'inherit', lineHeight: 1.65, minHeight: 52, maxHeight: 220, boxSizing: 'border-box' }}
          />
          <button
            onClick={() => void handleSubmit()}
            disabled={!inputValue.trim() || isStreaming}
            style={{ position: 'absolute', right: 10, bottom: 10, width: 32, height: 32, borderRadius: 7, background: inputValue.trim() && !isStreaming ? 'rgba(88,28,135,0.6)' : 'rgba(88,28,135,0.15)', border: '1px solid', borderColor: inputValue.trim() && !isStreaming ? 'rgba(88,28,135,0.8)' : 'rgba(88,28,135,0.2)', cursor: inputValue.trim() && !isStreaming ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 140ms ease' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={inputValue.trim() && !isStreaming ? 'rgba(226,232,240,0.9)' : 'rgba(226,232,240,0.25)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
        {!hasMessages && (
          <div style={{ marginTop: 10, display: 'flex', justifyContent: 'center' }}>
            <DepthControl />
          </div>
        )}
      </div>
    </div>
  );
}
