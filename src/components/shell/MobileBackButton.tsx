import React from 'react';

/**
 * Small "< Back" button surfaced in the detail pane of two-pane chambers
 * when we fold into single-pane mode on mobile. Re-uses the existing rail
 * design tokens so it blends with every chamber without bespoke styling.
 *
 * Usage:
 *   {isMobile && <MobileBackButton onClick={clearSelection} />}
 */
export function MobileBackButton({
  onClick,
  label = 'Back',
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: 'transparent',
        border: '1px solid var(--border-structural, rgba(88,28,135,0.2))',
        borderRadius: 6,
        color: 'rgba(226,232,240,0.75)',
        padding: '6px 10px',
        fontSize: '0.75rem',
        fontFamily: 'inherit',
        cursor: 'pointer',
        minHeight: 32,
      }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <polyline points="15 18 9 12 15 6" />
      </svg>
      <span>{label}</span>
    </button>
  );
}

export default MobileBackButton;
