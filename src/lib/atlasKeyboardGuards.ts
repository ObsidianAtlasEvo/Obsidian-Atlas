// Atlas-Audit: [PERF-P8] Verified — Shared editable-focus guard for ⌘/Ctrl+K so command palette does not hijack inputs, textareas, selects, or contenteditable surfaces.

/** True when focus is in a control where ⌘/Ctrl+K should not open/toggle the global palette. */
export function isEditableDocumentActiveElement(): boolean {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return el.isContentEditable;
}
