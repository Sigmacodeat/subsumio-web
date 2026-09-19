"use client";

/**
 * "Markieren & fragen": when the person marks text in the page's main
 * content, a small button appears next to it. It opens the Copilot with the
 * marked passage pinned above the input, so the next question is about it.
 */
import { useCallback, useEffect, useState } from "react";
import { MessageSquareQuote } from "lucide-react";

const MIN_CHARS = 3;
const MAX_CHARS = 4_000;

interface Anchor {
  text: string;
  top: number;
  left: number;
}

function markedPassage(): Anchor | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const text = selection.toString().trim();
  if (text.length < MIN_CHARS) return null;
  const range = selection.getRangeAt(0);
  const node =
    range.commonAncestorContainer instanceof Element
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
  // Only page content — not the Copilot itself, not form fields.
  if (!node?.closest("#main-content")) return null;
  if (node.closest("input, textarea, [contenteditable='true'], [data-copilot]")) return null;
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  const width = 170;
  return {
    text: text.slice(0, MAX_CHARS),
    top: Math.min(rect.bottom + 8, window.innerHeight - 48),
    left: Math.max(
      8,
      Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 8)
    ),
  };
}

export function SelectionAsk({ onAsk, label }: { onAsk: (text: string) => void; label: string }) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  useEffect(() => {
    let timer: number | undefined;
    const update = () => {
      window.clearTimeout(timer);
      // Let the browser settle the selection (double click, shift+arrows).
      timer = window.setTimeout(() => setAnchor(markedPassage()), 120);
    };
    const hide = () => setAnchor(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
      else if (e.shiftKey) update();
    };
    document.addEventListener("mouseup", update);
    document.addEventListener("keyup", onKey);
    document.addEventListener("scroll", hide, true);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mouseup", update);
      document.removeEventListener("keyup", onKey);
      document.removeEventListener("scroll", hide, true);
    };
  }, []);

  const ask = useCallback(() => {
    if (!anchor) return;
    onAsk(anchor.text);
    window.getSelection()?.removeAllRanges();
    setAnchor(null);
  }, [anchor, onAsk]);

  if (!anchor) return null;
  return (
    <button
      type="button"
      data-copilot
      // Keep the selection alive while the button is pressed.
      onMouseDown={(e) => e.preventDefault()}
      onClick={ask}
      style={{ top: anchor.top, left: anchor.left }}
      className="fixed z-[60] inline-flex items-center gap-1.5 rounded-full border border-[color:var(--brand-primary)] bg-[color:var(--ds-surface)] px-3 py-1.5 text-xs font-medium text-[color:var(--brand-primary)] shadow-lg transition-[background-color] hover:bg-[color:var(--ds-hover)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none"
    >
      <MessageSquareQuote size={13} aria-hidden="true" />
      {label}
    </button>
  );
}
