import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAtlasStore } from '../store/useAtlasStore';
import { streamChat, OllamaError, type OllamaMessage } from '../lib/ollama';
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const thinkingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const request = useChatRequestState();

  // Restore conversation history from persisted store on mount
  useEffect(() => {
    const activeConv = store.conversations.find(
      (c) => c.id === store.activeConversationId
    );
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
        }))
      );
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Cleanup watchdog and thinking interval on unmount
  useEffect(() => {
    return () => {
      request.clearWatchdog();
      if (thinkingIntervalRef.current) clearInterval(thinkingIntervalRef.current);
    };
  }, [request]);

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

  // Helper: finalize the assistant message in a terminal state
  const finalizeMessage = useCallback(
    (
      assistantMsgId: string,
      patch: Partial<ChatMessage>,
    ) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId ? { ...m, ...patch, isStreaming: false } : m,
        ),
      );
    },
    [],
  );

  // Debounced persistence for streaming tokens: write to store at most every 500ms
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingContentRef = useRef<string>('');

  const handleSubmit = useCallback(async () => {
    const text = inputValue.trim();
    if (!text) return;

    // If already in flight, abort the old request first (prevents concurrency corruption)
    if (request.stateRef.current.status === 'submitting' || request.stateRef.current.status === 'streaming') {
      request.abortCurrent();
      // Mark the old assistant message as aborted
      const oldId = request.stateRef.current.assistantMsgId;
      if (oldId) {
        finalizeMessage(oldId, { requestStatus: 'aborted' });
      }
    }

    const userMsgId = generateId();
    const assistantMsgId = generateId();

    const userMessage: ChatMessage = {
      id: userMsgId,
      role: 'user',
      content: text,
      timestamp: nowISO(),
    };

    const assistantMessage: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: nowISO(),
      isStreaming: true,
      requestStatus: 'submitting',
    };

    setInputValue('');
    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setIsStreaming(true);

    // Ensure a conversation thread exists for persistence
    let convId = store.activeConversationId;
    if (!convId) {
      convId = store.createConversation();
    }
    // Persist user message immediately
    store.addConversationMessage(convId, {
      id: userMsgId,
      role: 'user',
      content: text,
      timestamp: nowISO(),
    });
    // Persist assistant placeholder
    store.addConversationMessage(convId, {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: nowISO(),
      requestStatus: 'submitting',
    });

    pendingContentRef.current = '';

    // FSM: begin → submitting
    const controller = request.begin(assistantMsgId);

    // Cycle thinking states for UX texture
    const thinkingStates: ThinkingState[] = ['RETRIEVING', 'WEIGHING CONTRADICTIONS', 'SYNTHESIZING'];
    let thinkingIdx = 0;
    setThinkingState(thinkingStates[0]);
    if (thinkingIntervalRef.current) clearInterval(thinkingIntervalRef.current);
    thinkingIntervalRef.current = setInterval(() => {
      thinkingIdx = (thinkingIdx + 1) % thinkingStates.length;
      setThinkingState(thinkingStates[thinkingIdx]);
    }, 1800);

    const cleanupThinking = () => {
      if (thinkingIntervalRef.current) {
        clearInterval(thinkingIntervalRef.current);
        thinkingIntervalRef.current = null;
      }
      setThinkingState(null);
    };

    // Watchdog timeout handler — fires if 30s pass with no token
    const handleWatchdogTimeout = () => {
      controller.abort();
      cleanupThinking();
      setIsStreaming(false);
      request.transition('timed_out');
      finalizeMessage(assistantMsgId, {
        requestStatus: 'timed_out',
        error: 'Request timed out — no response received within 30 seconds.',
      });
    };

    // Start watchdog
    request.startWatchdog(handleWatchdogTimeout);

    const history = buildMessageHistory();
    history.push({ role: 'user', content: text });

    // Schedule a debounced write of partial content to the store
    const flushToStore = (content: string) => {
      if (convId) {
        store.updateConversationMessage(convId, assistantMsgId, {
          content,
          requestStatus: 'streaming',
        });
      }
    };

    try {
      streamChat(history, {
        onToken: (token) => {
          // FSM: submitting → streaming (on first token)
          if (request.stateRef.current.status === 'submitting') {
            request.transition('streaming');
          }
          // Reset watchdog on each token
          request.resetWatchdog(handleWatchdogTimeout);

          pendingContentRef.current += token;

          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, content: m.content + token, requestStatus: 'streaming' }
                : m,
            ),
          );

          // Debounced persistence: write partial content every 500ms
          if (!persistTimerRef.current) {
            persistTimerRef.current = setTimeout(() => {
              persistTimerRef.current = null;
              flushToStore(pendingContentRef.current);
            }, 500);
          }
        },
        onDone: (fullText, metrics) => {
          if (persistTimerRef.current) {
            clearTimeout(persistTimerRef.current);
            persistTimerRef.current = null;
          }
          cleanupThinking();
          setIsStreaming(false);
          request.transition('completed');
          finalizeMessage(assistantMsgId, {
            content: fullText,
            requestStatus: 'completed',
            tokens: metrics?.tokens,
            durationMs: metrics?.duration,
          });

          // Persist final state
          if (convId) {
            store.updateConversationMessage(convId, assistantMsgId, {
              content: fullText,
              requestStatus: 'completed',
              tokens: metrics?.tokens,
              durationMs: metrics?.duration,
            });
          }

          // Record in store's recent questions
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

          // Wire resonance observations from completed responses
          if (store.resonance?.isLearning !== false) {
            store.addResonanceObservation({
              timestamp: nowISO(),
              signal: fullText.slice(0, 200),
              dimension: 'inquiry',
              strength: 0.5,
              context: text.slice(0, 100),
              sessionId: convId ?? undefined,
            });

            store.addResonanceGraphNode({
              label: text.slice(0, 40),
              type: 'concept',
              weight: 1,
            });
          }
        },
        onError: (err: OllamaError) => {
          if (persistTimerRef.current) {
            clearTimeout(persistTimerRef.current);
            persistTimerRef.current = null;
          }
          cleanupThinking();
          setIsStreaming(false);

          if (err.code === 'ABORTED') {
            request.transition('aborted');
            finalizeMessage(assistantMsgId, { requestStatus: 'aborted' });
            if (convId) {
              store.updateConversationMessage(convId, assistantMsgId, {
                content: pendingContentRef.current,
                requestStatus: 'aborted',
              });
            }
            return;
          }

          if (err.code === 'TIMEOUT') {
            request.transition('timed_out');
            finalizeMessage(assistantMsgId, {
              requestStatus: 'timed_out',
              error: 'Request timed out.',
              content: '',
            });
            if (convId) {
              store.updateConversationMessage(convId, assistantMsgId, {
                requestStatus: 'timed_out',
                error: 'Request timed out.',
              });
            }
            return;
          }

          request.transition('failed');

          let errorMsg = err.message;
          if (err.code === 'NETWORK') {
            errorMsg = 'Cannot reach the local model. Make sure Ollama is running: `ollama serve`';
          } else if (err.code === 'MODEL_NOT_FOUND') {
            errorMsg = `Model not found. Pull it with: ollama pull ${process.env.OLLAMA_MODEL ?? 'llama3.1:70b'}`;
          }

          finalizeMessage(assistantMsgId, {
            requestStatus: 'failed',
            error: errorMsg,
            content: '',
          });
          if (convId) {
            store.updateConversationMessage(convId, assistantMsgId, {
              requestStatus: 'failed',
              error: errorMsg,
              content: '',
            });
          }
        },
      });
    } catch {
      // Catch any synchronous throw from streamChat setup
      cleanupThinking();
      setIsStreaming(false);
      request.transition('failed');
      finalizeMessage(assistantMsgId, {
        requestStatus: 'failed',
        error: 'Unexpected error starting chat request.',
        content: '',
      });
      if (convId) {
        store.updateConversationMessage(convId, assistantMsgId, {
          requestStatus: 'failed',
          error: 'Unexpected error starting chat request.',
          content: '',
        });
      }
    }
  }, [inputValue, buildMessageHistory, store, request, finalizeMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const handleAbort = () => {
    request.abortCurrent();
    setIsStreaming(false);
    setThinkingState(null);
    if (thinkingIntervalRef.current) {
      clearInterval(thinkingIntervalRef.current);
      thinkingIntervalRef.current = null;
    }
    setMessages((prev) =>
      prev.map((m) =>
        m.isStreaming ? { ...m, isStreaming: false, requestStatus: 'aborted' as ChatRequestStatus } : m,
      ),
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

            {/* Recent sessions */}
            {store.conversations.length > 0 && (
              <div style={{ marginTop: 32, width: '100%', maxWidth: 560 }}>
                <p
                  style={{
                    fontSize: '0.6rem',
                    color: 'rgba(226,232,240,0.2)',
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    fontWeight: 600,
                    marginBottom: 10,
                  }}
                >
                  Recent Sessions
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[...store.conversations]
                    .sort(
                      (a, b) =>
                        new Date(b.updatedAt ?? b.createdAt).getTime() -
                        new Date(a.updatedAt ?? a.createdAt).getTime(),
                    )
                    .slice(0, 5)
                    .map((conv) => (
                      <button
                        key={conv.id}
                        onClick={() => {
                          store.setActiveConversationId(conv.id);
                          setMessages(
                            conv.messages.map((m) => ({
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
                        }}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '10px 14px',
                          borderRadius: 6,
                          background: 'rgba(15,10,30,0.5)',
                          border: '1px solid rgba(88,28,135,0.15)',
                          cursor: 'pointer',
                          transition: 'all 140ms ease',
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(201,162,39,0.25)';
                          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(88,28,135,0.08)';
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(88,28,135,0.15)';
                          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(15,10,30,0.5)';
                        }}
                      >
                        <p
                          style={{
                            fontSize: '0.8rem',
                            color: 'rgba(226,232,240,0.55)',
                            margin: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {conv.messages[0]?.content?.slice(0, 80) ?? 'Untitled session'}
                        </p>
                        <p
                          style={{
                            fontSize: '0.6rem',
                            color: 'rgba(226,232,240,0.2)',
                            margin: '4px 0 0',
                          }}
                        >
                          {conv.messages.length} messages
                        </p>
                      </button>
                    ))}
                </div>
              </div>
            )}
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
