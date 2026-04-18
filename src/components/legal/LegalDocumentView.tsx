import React from 'react';
import type { LegalDocument } from '../../lib/legal/documents';

/**
 * Read-only rendering of a legal document. Converts the plaintext body into
 * paragraph / list blocks without relying on a markdown parser (the source
 * text has a narrow, predictable structure).
 *
 * Keeps styling neutral so it works inside both the first-run gate modal and
 * the standalone viewer opened from Settings.
 */
export function LegalDocumentView({ document }: { document: LegalDocument }) {
  const blocks = parseBody(document.body);

  return (
    <article className="text-sm text-stone leading-relaxed space-y-3">
      <header className="mb-4 pb-3 border-b border-titanium/10">
        <h1 className="text-base font-serif text-ivory uppercase tracking-widest">
          {document.title}
        </h1>
        <p className="text-[10px] text-stone/50 uppercase tracking-widest font-mono mt-1">
          Obsidian Atlas Tech · Effective {document.effectiveDate} · Last Updated {document.lastUpdated} · v{document.version}
        </p>
      </header>
      {blocks.map((block, idx) => {
        if (block.kind === 'heading') {
          return (
            <h2
              key={idx}
              className="text-xs font-bold text-gold uppercase tracking-widest mt-5 mb-1"
            >
              {block.text}
            </h2>
          );
        }
        if (block.kind === 'list') {
          return (
            <ul key={idx} className="list-disc pl-5 space-y-1 text-stone/90">
              {block.items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={idx} className="text-stone/90">
            {block.text}
          </p>
        );
      })}
    </article>
  );
}

// ─── Minimal body parser ───────────────────────────────────────────────
// The document bodies are authored as:
//   "1. Section Title\nparagraph\n- list item\n- list item\n\n2. Next Section..."
// We split on blank lines, then treat a line starting with "N." as a heading,
// consecutive "- " lines as a list, and everything else as a paragraph.

type Block =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: string[] };

function parseBody(raw: string): Block[] {
  const chunks = raw.split(/\n\s*\n/);
  const out: Block[] = [];

  for (const chunk of chunks) {
    const lines = chunk.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    const headingMatch = /^(\d+[A-Z]?\.\s+.+)$/.exec(lines[0]!);
    if (headingMatch && !lines[0]!.startsWith('- ')) {
      out.push({ kind: 'heading', text: lines[0]! });
      const rest = lines.slice(1);
      flushRest(rest, out);
      continue;
    }

    flushRest(lines, out);
  }

  return out;
}

function flushRest(lines: string[], out: Block[]): void {
  let i = 0;
  while (i < lines.length) {
    if (lines[i]!.startsWith('- ')) {
      const items: string[] = [];
      while (i < lines.length && lines[i]!.startsWith('- ')) {
        items.push(lines[i]!.slice(2).trim());
        i += 1;
      }
      out.push({ kind: 'list', items });
    } else {
      // Collect consecutive non-list, non-empty lines into a paragraph
      const paraLines: string[] = [];
      while (i < lines.length && !lines[i]!.startsWith('- ')) {
        paraLines.push(lines[i]!);
        i += 1;
      }
      out.push({ kind: 'paragraph', text: paraLines.join(' ') });
    }
  }
}
