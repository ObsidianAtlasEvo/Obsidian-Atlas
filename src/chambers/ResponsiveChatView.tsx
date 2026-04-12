/**
 * ResponsiveChatView.tsx
 * Chat interface for Obsidian Atlas — responsive across all breakpoints.
 *
 * Desktop  (≥1024px):  Two-column. Left = message list. Right = context/settings sidebar (280px).
 * Tablet   (768–1023px): Single column, context sidebar hidden, accessible via a toggle button.
 * Mobile   (<768px):   Single column, input fixed to bottom with iOS safe-area insets.
 *                      Keyboard-aware layout. Model selector as bottom sheet.
 *
 * No external dependencies. Zustand store shape assumed — adapt import paths to your setup.
 */

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useBreakpoint } from '../layout/ResponsiveShell';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  streaming?: boolean;
}

export interface ModelOption {
  id: string;
  label: string;
  description: string;
  provider: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Default model options (replace with Zustand store data in production)
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_MODELS: ModelOption[] = [
  {
    id: 'full-orchestration',
    label: 'Full Orchestration',
    description: 'All models, optimal routing',
    provider: 'Atlas',
  },
  {
    id: 'gpt-4o',
    label: 'GPT-4o',
    description: 'Fast, versatile reasoning',
    provider: 'OpenAI',
  },
  {
    id: 'claude-3-5-sonnet',
    label: 'Claude 3.5 Sonnet',
    description: 'Deep analysis and long context',
    provider: 'Anthropic',
  },
  {
    id: 'gemini-2-pro',
    label: 'Gemini 2 Pro',
    description: 'Multimodal with broad knowledge',
    provider: 'Google',
  },
  {
    id: 'llama-3-70b',
    label: 'Llama 3 70B',
    description: 'Open-source, sovereign deployment',
    provider: 'Meta',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Minimal markdown → HTML converter
// (avoids the dangerouslySetInnerHTML XSS footgun by sanitising before render)
// ─────────────────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function markdownToHtml(md: string): string {
  let html = escapeHtml(md);

  // Fenced code blocks
  html = html.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_m, _lang, code) =>
      `<pre class="atlas-code-block"><code>${code}</code></pre>`,
  );

  // Inline code
  html = html.replace(
    /`([^`\n]+)`/g,
    (_m, code) => `<code class="atlas-inline-code">${code}</code>`,
  );

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3 class="atlas-h3">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="atlas-h2">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="atlas-h1">$1</h1>');

  // Bold + italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Bullet lists
  html = html.replace(
    /^[-*] (.+)$/gm,
    '<li class="atlas-li">$1</li>',
  );
  html = html.replace(
    /(<li class="atlas-li">.*<\/li>\n?)+/g,
    (block) => `<ul class="atlas-ul">${block}</ul>`,
  );

  // Paragraphs — double newlines
  html = html.replace(/\n\n(?!<[uo]l|<pre|<h[1-3])/g, '</p><p class="atlas-p">');
  html = `<p class="atlas-p">${html}</p>`;

  // Single newlines inside paragraphs
  html = html.replace(/(?<!>)\n(?!<)/g, '<br>');

  return html;
}

// ─────────────────────────────────────────────────────────────────────────────
// Message bubble
// ─────────────────────────────────────────────────────────────────────────────

const PREVIEW_CHAR_LIMIT = 300;

interface MessageBubbleProps {
  message: ChatMessage;
}

function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [holdTimer, setHoldTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const shouldTruncate =
    !isUser && message.content.length > PREVIEW_CHAR_LIMIT && !expanded;
  const displayContent = shouldTruncate
    ? message.content.slice(0, PREVIEW_CHAR_LIMIT) + '…'
    : message.content;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }, [message.content]);

  // Long-press to copy on mobile
  const handleTouchStart = useCallback(() => {
    const t = setTimeout(handleCopy, 600);
    setHoldTimer(t);
  }, [handleCopy]);

  const handleTouchEnd = useCallback(() => {
    if (holdTimer) {
      clearTimeout(holdTimer);
      setHoldTimer(null);
    }
  }, [holdTimer]);

  const timeStr = message.timestamp.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      className={[
        'flex w-full mb-4',
        isUser ? 'justify-end' : 'justify-start',
      ].join(' ')}
    >
      <div
        className={[
          'group relative max-w-[85%] md:max-w-[70%] rounded-2xl px-4 py-3',
          isUser
            ? [
                'border border-[#c9a84c]/30',
                'bg-[#1a0a2e]',
                'rounded-br-sm',
              ].join(' ')
            : [
                'border border-[#2d1b4e]/60',
                'bg-[#0f0a18]',
                'rounded-bl-sm',
              ].join(' '),
        ].join(' ')}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onContextMenu={(e) => {
          e.preventDefault();
          handleCopy();
        }}
      >
        {/* Streaming indicator */}
        {message.streaming && (
          <div className="flex gap-1 items-center mb-2">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-[#4a9eff]"
                style={{
                  animation: `atlas-pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                }}
              />
            ))}
          </div>
        )}

        {/* Message content */}
        {isUser ? (
          <p
            className="text-sm text-white/90 leading-relaxed whitespace-pre-wrap break-words"
            style={{ fontFamily: 'system-ui, Inter, sans-serif' }}
          >
            {message.content}
          </p>
        ) : (
          <div
            className="atlas-md text-sm text-white/85 leading-relaxed"
            style={{ fontFamily: 'system-ui, Inter, sans-serif' }}
            dangerouslySetInnerHTML={{ __html: markdownToHtml(displayContent) }}
          />
        )}

        {/* Expand/collapse for long Atlas messages */}
        {!isUser && message.content.length > PREVIEW_CHAR_LIMIT && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className={[
              'mt-2 text-xs font-medium',
              'text-[#4a9eff] hover:text-[#7ab8ff]',
              'transition-colors',
            ].join(' ')}
            style={{ fontFamily: 'system-ui, Inter, sans-serif' }}
          >
            {expanded ? 'Show less ↑' : 'Read more ↓'}
          </button>
        )}

        {/* Footer: timestamp + copy */}
        <div className="flex items-center justify-between mt-2 gap-3">
          <span
            className="text-[10px] text-[#4b5563]"
            style={{ fontFamily: 'system-ui, Inter, sans-serif' }}
          >
            {timeStr}
          </span>

          {/* Copy button — visible on hover (desktop) always on mobile after long press */}
          <button
            onClick={handleCopy}
            aria-label="Copy message"
            className={[
              'opacity-0 group-hover:opacity-100 focus:opacity-100',
              'transition-opacity duration-150',
              'text-[#4b5563] hover:text-[#9ca3af]',
              'flex items-center gap-1 text-[10px]',
            ].join(' ')}
            style={{ fontFamily: 'system-ui, Inter, sans-serif' }}
          >
            {copied ? (
              <>
                <svg viewBox="0 0 16 16" fill="none" width={12} height={12} aria-hidden="true">
                  <path
                    d="M3 8l3 3 7-7"
                    stroke="#00d4aa"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="text-[#00d4aa]">Copied</span>
              </>
            ) : (
              <>
                <svg viewBox="0 0 16 16" fill="none" width={12} height={12} aria-hidden="true">
                  <rect x="5" y="5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                  <path
                    d="M11 5V3.5A1.5 1.5 0 009.5 2h-6A1.5 1.5 0 002 3.5v6A1.5 1.5 0 003.5 11H5"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                  />
                </svg>
                Copy
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Typing indicator
// ─────────────────────────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex justify-start mb-4">
      <div className="flex items-center gap-1.5 px-4 py-3 rounded-2xl rounded-bl-sm border border-[#2d1b4e]/60 bg-[#0f0a18]">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-[#4a9eff]/60"
            style={{
              animation: `atlas-pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Model selector bottom sheet (mobile) / popover (desktop)
// ─────────────────────────────────────────────────────────────────────────────

interface ModelSelectorProps {
  models: ModelOption[];
  selectedModel: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  mode: 'sheet' | 'popover';
}

function ModelSelector({
  models,
  selectedModel,
  onSelect,
  onClose,
  mode,
}: ModelSelectorProps) {
  const [pending, setPending] = useState(selectedModel);

  if (mode === 'sheet') {
    return (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 z-40 bg-black/60"
          onClick={onClose}
          aria-hidden="true"
        />
        {/* Sheet */}
        <div
          className={[
            'fixed left-0 right-0 bottom-0 z-50',
            'bg-[#0f0a1a] border-t border-[#2d1b4e]/80',
            'rounded-t-2xl',
            'atlas-drawer-open',
          ].join(' ')}
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          role="dialog"
          aria-label="Select model"
        >
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-[#2d1b4e]" />
          </div>

          <div className="px-4 pt-2 pb-4">
            <h2
              className="text-base font-semibold text-white mb-4"
              style={{ fontFamily: 'system-ui, Inter, sans-serif' }}
            >
              Select Model
            </h2>

            <div className="space-y-2 mb-5">
              {models.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setPending(m.id)}
                  className={[
                    'w-full flex items-start gap-3 px-3 py-3 rounded-xl border',
                    'transition-all duration-150 text-left',
                    pending === m.id
                      ? 'border-[#c9a84c]/50 bg-[#2d1b4e]/60'
                      : 'border-[#2d1b4e]/40 bg-[#1a0a2e]/40 hover:border-[#2d1b4e]',
                  ].join(' ')}
                  style={{ touchAction: 'manipulation' }}
                >
                  <div
                    className={[
                      'w-4 h-4 mt-0.5 rounded-full border-2 flex-shrink-0',
                      'flex items-center justify-center',
                      pending === m.id
                        ? 'border-[#c9a84c]'
                        : 'border-[#4b5563]',
                    ].join(' ')}
                  >
                    {pending === m.id && (
                      <div className="w-2 h-2 rounded-full bg-[#c9a84c]" />
                    )}
                  </div>
                  <div>
                    <div
                      className="text-sm font-medium text-white"
                      style={{ fontFamily: 'system-ui, Inter, sans-serif' }}
                    >
                      {m.label}
                    </div>
                    <div
                      className="text-xs text-[#6b7280] mt-0.5"
                      style={{ fontFamily: 'system-ui, Inter, sans-serif' }}
                    >
                      {m.provider} — {m.description}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={() => { onSelect(pending); onClose(); }}
              className={[
                'w-full py-3 rounded-xl',
                'bg-[#c9a84c] text-[#0a0a0f]',
                'text-sm font-semibold',
                'transition-opacity hover:opacity-90 active:opacity-80',
              ].join(' ')}
              style={{ fontFamily: 'system-ui, Inter, sans-serif', touchAction: 'manipulation' }}
            >
              Confirm
            </button>
          </div>
        </div>
      </>
    );
  }

  // Popover (desktop/tablet)
  return (
    <div
      className={[
        'absolute bottom-full left-0 mb-2 z-50 w-72',
        'bg-[#0f0a1a] border border-[#2d1b4e] rounded-xl',
        'shadow-2xl shadow-black/50',
        'overflow-hidden',
      ].join(' ')}
      role="dialog"
      aria-label="Select model"
    >
      <div className="px-3 pt-3 pb-1">
        <div
          className="text-xs font-semibold tracking-wider text-[#4b5563] uppercase mb-2"
          style={{ fontFamily: 'system-ui, Inter, sans-serif' }}
        >
          Select Model
        </div>
        {models.map((m) => (
          <button
            key={m.id}
            onClick={() => { onSelect(m.id); onClose(); }}
            className={[
              'w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left',
              'transition-colors duration-100',
              selectedModel === m.id
                ? 'bg-[#2d1b4e]/70 text-[#c9a84c]'
                : 'text-[#9ca3af] hover:bg-white/5 hover:text-white',
            ].join(' ')}
          >
            <span className="flex-1">
              <span
                className="block text-xs font-medium"
                style={{ fontFamily: 'system-ui, Inter, sans-serif' }}
              >
                {m.label}
              </span>
              <span
                className="block text-[10px] text-[#4b5563] mt-0.5"
                style={{ fontFamily: 'system-ui, Inter, sans-serif' }}
              >
                {m.description}
              </span>
            </span>
            {selectedModel === m.id && (
              <svg viewBox="0 0 16 16" fill="none" width={14} height={14} aria-hidden="true">
                <path
                  d="M3 8l3.5 3.5L13 5"
                  stroke="#c9a84c"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat input bar
// ─────────────────────────────────────────────────────────────────────────────

interface InputBarProps {
  onSend: (text: string) => void;
  onAbort: () => void;
  isStreaming: boolean;
  selectedModel: string;
  onModelChange: (id: string) => void;
  models: ModelOption[];
  /** When true, fix bar to bottom of viewport (mobile) */
  fixed: boolean;
}

function InputBar({
  onSend,
  onAbort,
  isStreaming,
  selectedModel,
  onModelChange,
  models,
  fixed,
}: InputBarProps) {
  const [text, setText] = useState('');
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const breakpoint = useBreakpoint();
  const isMobile = breakpoint === 'mobile';

  // Auto-resize textarea
  useLayoutEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const maxH = 5 * 24; // ~5 lines
    ta.style.height = Math.min(ta.scrollHeight, maxH) + 'px';
  }, [text]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    setText('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }, [text, isStreaming, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !isMobile) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend, isMobile],
  );

  const activeModel = models.find((m) => m.id === selectedModel) ?? models[0];

  const barClasses = [
    'z-20',
    fixed
      ? 'fixed left-0 right-0 bottom-0'
      : 'sticky bottom-0',
    'bg-[#0a0a0f]/95 backdrop-blur-md',
    'border-t border-[#1a0a2e]/80',
    'px-3 pt-3',
  ].join(' ');

  return (
    <div
      className={barClasses}
      style={
        fixed
          ? {
              paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
            }
          : { paddingBottom: '12px' }
      }
    >
      {/* Model pill */}
      <div className="relative mb-2 flex items-center">
        <button
          onClick={() => setModelPickerOpen((v) => !v)}
          className={[
            'flex items-center gap-1.5 px-2.5 py-1 rounded-full',
            'border border-[#2d1b4e]/60',
            'bg-[#1a0a2e]/80',
            'text-[10px] text-[#9ca3af] hover:text-white',
            'transition-colors',
          ].join(' ')}
          style={{ fontFamily: 'system-ui, Inter, sans-serif', touchAction: 'manipulation' }}
          aria-label="Change model"
          aria-haspopup="dialog"
        >
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ background: '#4a9eff' }}
          />
          {activeModel.label}
          <svg viewBox="0 0 10 10" fill="none" width={8} height={8} aria-hidden="true">
            <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>

        {/* Model picker */}
        {modelPickerOpen && (
          <ModelSelector
            models={models}
            selectedModel={selectedModel}
            onSelect={onModelChange}
            onClose={() => setModelPickerOpen(false)}
            mode={isMobile ? 'sheet' : 'popover'}
          />
        )}
      </div>

      {/* Textarea row */}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Atlas anything..."
          rows={1}
          className={[
            'flex-1 resize-none rounded-xl',
            'bg-[#1a0a2e]/80 border border-[#2d1b4e]/60',
            'text-white text-sm placeholder-[#4b5563]',
            'px-4 py-3',
            'focus:outline-none focus:border-[#c9a84c]/30',
            'transition-colors',
            'leading-6',
          ].join(' ')}
          style={{
            fontFamily: 'system-ui, Inter, sans-serif',
            minHeight: '48px',
            maxHeight: '120px',
            overflowY: 'auto',
          }}
          autoComplete="off"
          autoCorrect="off"
          spellCheck
        />

        {/* Abort button during streaming */}
        {isStreaming ? (
          <button
            onClick={onAbort}
            aria-label="Stop generation"
            className={[
              'w-11 h-11 flex-shrink-0 rounded-full',
              'bg-red-600/80 hover:bg-red-600',
              'flex items-center justify-center',
              'transition-colors',
            ].join(' ')}
            style={{ touchAction: 'manipulation' }}
          >
            <svg viewBox="0 0 16 16" fill="none" width={14} height={14} aria-hidden="true">
              <rect x="4" y="4" width="8" height="8" rx="1" fill="white" />
            </svg>
          </button>
        ) : (
          /* Send button */
          <button
            onClick={handleSend}
            disabled={!text.trim()}
            aria-label="Send message"
            className={[
              'w-11 h-11 flex-shrink-0 rounded-full',
              'flex items-center justify-center',
              'transition-all duration-150',
              text.trim()
                ? 'bg-[#c9a84c] hover:bg-[#d4b563] active:scale-95'
                : 'bg-[#1a0a2e] border border-[#2d1b4e]/40 opacity-50 cursor-not-allowed',
            ].join(' ')}
            style={{ touchAction: 'manipulation' }}
          >
            <svg viewBox="0 0 16 16" fill="none" width={16} height={16} aria-hidden="true">
              <path
                d="M8 13V3M3 8l5-5 5 5"
                stroke={text.trim() ? '#0a0a0f' : '#9ca3af'}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Desktop hint */}
      {!isMobile && (
        <p
          className="text-[10px] text-[#4b5563] mt-1.5 text-center"
          style={{ fontFamily: 'system-ui, Inter, sans-serif' }}
        >
          Enter to send — Shift+Enter for new line
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Context sidebar (desktop only)
// ─────────────────────────────────────────────────────────────────────────────

interface ContextSidebarProps {
  visible: boolean;
  onClose: () => void;
}

function ContextSidebar({ visible, onClose }: ContextSidebarProps) {
  if (!visible) return null;

  return (
    <aside
      className={[
        'w-[280px] flex-shrink-0',
        'border-l border-[#1a0a2e]/80',
        'bg-[#09090e]',
        'flex flex-col',
        'overflow-hidden',
      ].join(' ')}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a0a2e]/60">
        <span
          className="text-xs font-semibold tracking-wider text-[#4b5563] uppercase"
          style={{ fontFamily: 'system-ui, Inter, sans-serif' }}
        >
          Context
        </span>
        <button
          onClick={onClose}
          aria-label="Hide context panel"
          className="w-7 h-7 flex items-center justify-center rounded text-[#4b5563] hover:text-white hover:bg-white/5 transition-colors"
        >
          <svg viewBox="0 0 16 16" fill="none" width={14} height={14} aria-hidden="true">
            <path
              d="M4 8h8M10 5l3 3-3 3"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {/* Active memory fragments */}
      <div className="flex-1 overflow-y-auto atlas-scroll p-4 space-y-4">
        <div>
          <div
            className="text-[10px] font-semibold tracking-wider text-[#4b5563] uppercase mb-2"
            style={{ fontFamily: 'system-ui, Inter, sans-serif' }}
          >
            Active Memory
          </div>
          <div className="space-y-2">
            {['Recent conversations', 'Project context', 'User preferences'].map((item) => (
              <div
                key={item}
                className={[
                  'px-3 py-2 rounded-lg',
                  'bg-[#1a0a2e]/40 border border-[#2d1b4e]/30',
                  'text-xs text-[#9ca3af]',
                ].join(' ')}
                style={{ fontFamily: 'system-ui, Inter, sans-serif' }}
              >
                {item}
              </div>
            ))}
          </div>
        </div>

        <div>
          <div
            className="text-[10px] font-semibold tracking-wider text-[#4b5563] uppercase mb-2"
            style={{ fontFamily: 'system-ui, Inter, sans-serif' }}
          >
            Session Stats
          </div>
          <div className="space-y-1.5">
            {[
              ['Messages', '0'],
              ['Tokens used', '0'],
              ['Model', 'Full Orch.'],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between items-center">
                <span
                  className="text-xs text-[#4b5563]"
                  style={{ fontFamily: 'system-ui, Inter, sans-serif' }}
                >
                  {label}
                </span>
                <span
                  className="text-xs text-[#9ca3af] font-medium"
                  style={{ fontFamily: 'system-ui, Inter, sans-serif' }}
                >
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main ResponsiveChatView
// ─────────────────────────────────────────────────────────────────────────────

export interface ResponsiveChatViewProps {
  /** Messages to render — from your Zustand store */
  messages?: ChatMessage[];
  /** Whether Atlas is currently generating */
  isStreaming?: boolean;
  /** Whether we're waiting for the first token */
  isTyping?: boolean;
  /** Called when user submits a message */
  onSend?: (text: string) => void;
  /** Called when user aborts streaming */
  onAbort?: () => void;
  /** Available models */
  models?: ModelOption[];
  /** Currently selected model id */
  selectedModel?: string;
  /** Called when model changes */
  onModelChange?: (id: string) => void;
}

export function ResponsiveChatView({
  messages = [],
  isStreaming = false,
  isTyping = false,
  onSend = () => undefined,
  onAbort = () => undefined,
  models = DEFAULT_MODELS,
  selectedModel = 'full-orchestration',
  onModelChange = () => undefined,
}: ResponsiveChatViewProps) {
  const breakpoint = useBreakpoint();
  const isMobile = breakpoint === 'mobile';
  const isDesktop = breakpoint === 'desktop';

  const [contextVisible, setContextVisible] = useState(isDesktop);
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Sync context sidebar with breakpoint
  useEffect(() => {
    setContextVisible(isDesktop);
  }, [isDesktop]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isTyping]);

  // Chat header
  const Header = (
    <div
      className={[
        'flex items-center justify-between',
        'px-4 py-3',
        'border-b border-[#1a0a2e]/60',
        'bg-[#0a0a0f]/95 backdrop-blur-md',
        isMobile ? 'sticky top-0 z-10' : '',
      ].join(' ')}
    >
      <div className="flex items-center gap-2">
        {/* Connection status indicator */}
        <span
          className="w-1.5 h-1.5 rounded-full bg-[#00d4aa]"
          title="Connected"
          aria-label="Atlas is connected"
        />
        <span
          className="text-xs text-[#6b7280]"
          style={{ fontFamily: 'system-ui, Inter, sans-serif' }}
        >
          Atlas Intelligence
        </span>
      </div>

      {/* Context toggle — only desktop */}
      {isDesktop && (
        <button
          onClick={() => setContextVisible((v) => !v)}
          aria-label={contextVisible ? 'Hide context panel' : 'Show context panel'}
          className={[
            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs',
            'border transition-colors',
            contextVisible
              ? 'border-[#c9a84c]/30 text-[#c9a84c] bg-[#2d1b4e]/30'
              : 'border-[#2d1b4e]/40 text-[#6b7280] hover:text-white hover:border-[#2d1b4e]',
          ].join(' ')}
          style={{ fontFamily: 'system-ui, Inter, sans-serif' }}
        >
          <svg viewBox="0 0 16 16" fill="none" width={12} height={12} aria-hidden="true">
            <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
            <path d="M10 3v10" stroke="currentColor" strokeWidth="1.2" />
          </svg>
          Context
        </button>
      )}
    </div>
  );

  // Message list
  const MessageList = (
    <div
      ref={listRef}
      className="flex-1 overflow-y-auto atlas-scroll px-4 py-4"
      style={{
        WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'],
        // On mobile, leave room for fixed input bar
        paddingBottom: isMobile ? '160px' : undefined,
      }}
    >
      {messages.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center">
          <svg
            viewBox="0 0 48 48"
            fill="none"
            width={48}
            height={48}
            aria-hidden="true"
            className="mb-4 opacity-20"
          >
            <polygon
              points="24,4 44,16 44,32 24,44 4,32 4,16"
              stroke="#c9a84c"
              strokeWidth="2"
            />
            <circle cx="24" cy="24" r="6" fill="#c9a84c" opacity="0.5" />
          </svg>
          <p
            className="text-[#4b5563] text-sm"
            style={{ fontFamily: 'system-ui, Inter, sans-serif' }}
          >
            Begin your session with Atlas
          </p>
        </div>
      )}

      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}

      {isTyping && <TypingIndicator />}

      {/* Scroll anchor */}
      <div ref={bottomRef} aria-hidden="true" />
    </div>
  );

  // Input bar props
  const inputBarProps = {
    onSend,
    onAbort,
    isStreaming,
    selectedModel,
    onModelChange,
    models,
    fixed: isMobile,
  };

  // ── Desktop layout ───────────────────────────────────────────────────────
  if (isDesktop) {
    return (
      <div className="flex h-full">
        {/* Chat column */}
        <div className="flex flex-col flex-1 min-w-0 h-full">
          {Header}
          {MessageList}
          <InputBar {...inputBarProps} />
        </div>

        {/* Context sidebar */}
        <ContextSidebar
          visible={contextVisible}
          onClose={() => setContextVisible(false)}
        />
      </div>
    );
  }

  // ── Tablet layout ────────────────────────────────────────────────────────
  if (breakpoint === 'tablet') {
    return (
      <div className="flex flex-col h-full">
        {Header}
        {MessageList}
        <InputBar {...inputBarProps} />
      </div>
    );
  }

  // ── Mobile layout ────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {Header}
      {MessageList}
      {/* Input bar is position:fixed on mobile, so it renders outside normal flow */}
      <InputBar {...inputBarProps} />
    </div>
  );
}

export default ResponsiveChatView;
