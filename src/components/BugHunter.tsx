/**
 * BugHunter.tsx
 * Floating bug report widget available to ALL authenticated Atlas users.
 * A gold lightning-bolt button fixed to bottom-right; opens a compact modal.
 * Submits to POST /api/bugs (public endpoint, session-required but not sovereign-only).
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAtlasStore } from '../store/useAtlasStore';
import { atlasTraceUserId } from '../lib/atlasTraceContext';
import { atlasApiUrl } from '../lib/atlasApi';

// ─── Types ────────────────────────────────────────────────────────────────────

type BugSeverity = 'low' | 'medium' | 'high' | 'critical';

interface BugSubmission {
  title: string;
  description: string;
  severity: BugSeverity;
}

// ─── Severity Auto-Detection ──────────────────────────────────────────────────

function detectSeverity(text: string): BugSeverity {
  const lower = text.toLowerCase();
  if (/crash|critical|data loss|security|broken|error|exception|fail|corrupt/.test(lower))
    return 'critical';
  if (/high|major|significant|important|urgent/.test(lower)) return 'high';
  if (/slow|wrong|incorrect|unexpected|glitch|freeze|laggy/.test(lower)) return 'medium';
  return 'low';
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────

function LightningBoltIcon({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M13 2L4.5 13.5H11L10 22L20.5 10H14L13 2Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M18 6L6 18M6 6L18 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M5 13L9 17L19 7"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Severity Badge ───────────────────────────────────────────────────────────

const SEVERITY_CONFIG: Record<BugSeverity, { label: string; color: string }> = {
  low: { label: 'Low', color: '#6b7280' },
  medium: { label: 'Medium', color: '#f59e0b' },
  high: { label: 'High', color: '#f97316' },
  critical: { label: 'Critical', color: '#ef4444' },
};

// ─── BugHunter Component ──────────────────────────────────────────────────────

export default function BugHunter() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<BugSeverity>('low');
  const [autoDetected, setAutoDetected] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titleRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Auto-detect severity from title + description
  useEffect(() => {
    if (autoDetected) {
      const detected = detectSeverity(`${title} ${description}`);
      setSeverity(detected);
    }
  }, [title, description, autoDetected]);

  // Focus title on open
  useEffect(() => {
    if (open) {
      setTimeout(() => titleRef.current?.focus(), 80);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) handleClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  // Click-outside to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        handleClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setError(null);
    // Reset form on close (not on success — success auto-closes)
    setTimeout(() => {
      setTitle('');
      setDescription('');
      setSeverity('low');
      setAutoDetected(true);
      setSuccess(false);
    }, 300);
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/bugs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          severity,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error || `Submission failed (${res.status})`);
      }

      const st = useAtlasStore.getState();
      const uid = atlasTraceUserId(st);
      void fetch(atlasApiUrl('/v1/diagnostics/report'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: uid,
          sessionId: 'bughunter-widget',
          type: 'scan',
          payload: { title: title.trim(), description: description.trim(), severity, source: 'BugHunter' },
          timestamp: new Date().toISOString(),
        }),
      }).catch(() => {});

      setSuccess(true);
      setTimeout(() => handleClose(), 2200);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }, [title, description, severity, handleClose]);

  return (
    <>
      {/* ── Floating Trigger Button ────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Report a bug"
        style={{
          position: 'fixed',
          bottom: '1.5rem',
          right: '1.5rem',
          zIndex: 9000,
          width: '2.75rem',
          height: '2.75rem',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #1a1208 0%, #2a1e08 100%)',
          border: '1.5px solid rgba(212, 175, 55, 0.45)',
          color: '#d4af37',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5), 0 0 12px rgba(212,175,55,0.15)',
          transition: 'transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease',
          animation: 'bugHunterPulse 3s ease-in-out infinite',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.1)';
          (e.currentTarget as HTMLButtonElement).style.boxShadow =
            '0 6px 24px rgba(0,0,0,0.6), 0 0 18px rgba(212,175,55,0.3)';
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(212,175,55,0.8)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
          (e.currentTarget as HTMLButtonElement).style.boxShadow =
            '0 4px 20px rgba(0,0,0,0.5), 0 0 12px rgba(212,175,55,0.15)';
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(212,175,55,0.45)';
        }}
      >
        <LightningBoltIcon size={18} />
      </button>

      {/* ── Backdrop ──────────────────────────────────────────────────────── */}
      {open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9001,
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'flex-end',
            padding: '1.5rem',
            animation: 'fadeIn 0.15s ease',
          }}
        >
          {/* ── Modal ────────────────────────────────────────────────────── */}
          <div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-label="Bug report"
            style={{
              width: '100%',
              maxWidth: '26rem',
              background: 'linear-gradient(160deg, #0d0d0f 0%, #111115 100%)',
              border: '1.5px solid rgba(212, 175, 55, 0.25)',
              borderRadius: '0.75rem',
              boxShadow: '0 24px 64px rgba(0,0,0,0.8), 0 0 32px rgba(212,175,55,0.06)',
              overflow: 'hidden',
              animation: 'slideUp 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '1rem 1.25rem 0.875rem',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(212,175,55,0.04)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <LightningBoltIcon size={16} className="" />
                <span
                  style={{
                    color: '#d4af37',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                  }}
                >
                  Report a Bug
                </span>
              </div>
              <button
                onClick={handleClose}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'rgba(255,255,255,0.4)',
                  cursor: 'pointer',
                  padding: '0.25rem',
                  borderRadius: '0.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'color 0.15s ease',
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.8)')
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.4)')
                }
                aria-label="Close"
              >
                <CloseIcon size={15} />
              </button>
            </div>

            {/* Body */}
            {success ? (
              /* Success State */
              <div
                style={{
                  padding: '2.5rem 1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.875rem',
                  animation: 'fadeIn 0.3s ease',
                }}
              >
                <div
                  style={{
                    width: '3rem',
                    height: '3rem',
                    borderRadius: '50%',
                    background: 'rgba(20, 184, 166, 0.12)',
                    border: '1.5px solid rgba(20, 184, 166, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#14b8a6',
                  }}
                >
                  <CheckIcon size={22} />
                </div>
                <p
                  style={{
                    color: '#e5e7eb',
                    fontSize: '0.9375rem',
                    fontWeight: 500,
                    margin: 0,
                    textAlign: 'center',
                  }}
                >
                  Bug reported.
                </p>
                <p
                  style={{
                    color: 'rgba(255,255,255,0.4)',
                    fontSize: '0.8125rem',
                    margin: 0,
                    textAlign: 'center',
                  }}
                >
                  Atlas will improve.
                </p>
              </div>
            ) : (
              /* Form */
              <form onSubmit={handleSubmit} style={{ padding: '1.25rem' }}>
                {/* Title */}
                <div style={{ marginBottom: '1rem' }}>
                  <label
                    htmlFor="bug-title"
                    style={{
                      display: 'block',
                      color: 'rgba(255,255,255,0.5)',
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      marginBottom: '0.375rem',
                    }}
                  >
                    Title <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    id="bug-title"
                    ref={titleRef}
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Brief summary of the issue..."
                    required
                    maxLength={120}
                    style={{
                      width: '100%',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '0.5rem',
                      padding: '0.625rem 0.75rem',
                      color: '#f9fafb',
                      fontSize: '0.875rem',
                      outline: 'none',
                      transition: 'border-color 0.15s ease',
                      boxSizing: 'border-box',
                    }}
                    onFocus={(e) =>
                      ((e.target as HTMLInputElement).style.borderColor = 'rgba(212,175,55,0.5)')
                    }
                    onBlur={(e) =>
                      ((e.target as HTMLInputElement).style.borderColor = 'rgba(255,255,255,0.1)')
                    }
                  />
                </div>

                {/* Description */}
                <div style={{ marginBottom: '1rem' }}>
                  <label
                    htmlFor="bug-description"
                    style={{
                      display: 'block',
                      color: 'rgba(255,255,255,0.5)',
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      marginBottom: '0.375rem',
                    }}
                  >
                    Description
                  </label>
                  <textarea
                    id="bug-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Steps to reproduce, what happened, what you expected..."
                    rows={4}
                    maxLength={1000}
                    style={{
                      width: '100%',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '0.5rem',
                      padding: '0.625rem 0.75rem',
                      color: '#f9fafb',
                      fontSize: '0.875rem',
                      outline: 'none',
                      resize: 'vertical',
                      fontFamily: 'inherit',
                      transition: 'border-color 0.15s ease',
                      boxSizing: 'border-box',
                      minHeight: '5.5rem',
                    }}
                    onFocus={(e) =>
                      ((e.target as HTMLTextAreaElement).style.borderColor =
                        'rgba(212,175,55,0.5)')
                    }
                    onBlur={(e) =>
                      ((e.target as HTMLTextAreaElement).style.borderColor =
                        'rgba(255,255,255,0.1)')
                    }
                  />
                </div>

                {/* Severity */}
                <div style={{ marginBottom: '1.25rem' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '0.375rem',
                    }}
                  >
                    <label
                      style={{
                        color: 'rgba(255,255,255,0.5)',
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                      }}
                    >
                      Severity
                    </label>
                    {autoDetected && (
                      <span
                        style={{
                          color: 'rgba(255,255,255,0.3)',
                          fontSize: '0.6875rem',
                        }}
                      >
                        auto-detected
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {(['low', 'medium', 'high', 'critical'] as BugSeverity[]).map((s) => {
                      const cfg = SEVERITY_CONFIG[s];
                      const selected = severity === s;
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => {
                            setSeverity(s);
                            setAutoDetected(false);
                          }}
                          style={{
                            flex: 1,
                            padding: '0.375rem 0',
                            borderRadius: '0.375rem',
                            border: selected
                              ? `1.5px solid ${cfg.color}`
                              : '1.5px solid rgba(255,255,255,0.08)',
                            background: selected
                              ? `${cfg.color}18`
                              : 'rgba(255,255,255,0.03)',
                            color: selected ? cfg.color : 'rgba(255,255,255,0.4)',
                            fontSize: '0.75rem',
                            fontWeight: selected ? 600 : 400,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            textAlign: 'center',
                          }}
                        >
                          {cfg.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <div
                    style={{
                      marginBottom: '1rem',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '0.375rem',
                      background: 'rgba(239,68,68,0.1)',
                      border: '1px solid rgba(239,68,68,0.25)',
                      color: '#f87171',
                      fontSize: '0.8125rem',
                    }}
                  >
                    {error}
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={submitting || !title.trim()}
                  style={{
                    width: '100%',
                    padding: '0.6875rem',
                    borderRadius: '0.5rem',
                    background:
                      submitting || !title.trim()
                        ? 'rgba(212,175,55,0.1)'
                        : 'linear-gradient(135deg, #d4af37 0%, #b8922e 100%)',
                    border: 'none',
                    color:
                      submitting || !title.trim()
                        ? 'rgba(212,175,55,0.4)'
                        : '#0d0d0f',
                    fontSize: '0.875rem',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    cursor: submitting || !title.trim() ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                  }}
                >
                  {submitting ? (
                    <>
                      <span
                        style={{
                          width: '0.875rem',
                          height: '0.875rem',
                          borderRadius: '50%',
                          border: '2px solid rgba(212,175,55,0.3)',
                          borderTopColor: '#d4af37',
                          animation: 'spin 0.7s linear infinite',
                          display: 'inline-block',
                        }}
                      />
                      Submitting...
                    </>
                  ) : (
                    'Submit'
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ── Keyframes ─────────────────────────────────────────────────────── */}
      <style>{`
        @keyframes bugHunterPulse {
          0%, 100% {
            box-shadow: 0 4px 20px rgba(0,0,0,0.5), 0 0 0 0 rgba(212,175,55,0.0);
          }
          50% {
            box-shadow: 0 4px 20px rgba(0,0,0,0.5), 0 0 0 6px rgba(212,175,55,0.12);
          }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(1rem) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
