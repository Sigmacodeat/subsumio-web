"use client";

/**
 * Jump to a cited passage: a citation link carries the quote (`?hl=`), the
 * document page finds it in its rendered text, marks it and scrolls there.
 * Matching ignores whitespace and case, and falls back to ever shorter leading
 * parts of the quote when its tail differs from what the page renders.
 */
import { useEffect } from "react";

const HIGHLIGHT_NAME = "subsumio-citation";
/** Fired by the PDF viewer once its text layers are in place. */
const DOCUMENT_TEXT_READY_EVENT = "subsumio:document-text-ready";
const HIGHLIGHT_STYLE_ID = "subsumio-citation-highlight-style";

/** Injects the ::highlight() rule once (kept out of globals.css, see there). */
function ensureHighlightStyle(): void {
  if (document.getElementById(HIGHLIGHT_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = HIGHLIGHT_STYLE_ID;
  style.textContent = `::highlight(${HIGHLIGHT_NAME}) { background-color: var(--brand-glow); color: var(--ds-text); }`;
  document.head.appendChild(style);
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

interface IndexedText {
  text: string;
  /** For each character of `text`: its text node and offset. */
  at: Array<{ node: Text; offset: number }>;
}

function indexText(root: Element): IndexedText {
  const at: IndexedText["at"] = [];
  let text = "";
  let lastSpace = true;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const value = node.nodeValue ?? "";
    for (let i = 0; i < value.length; i++) {
      const ch = value[i]!;
      if (/\s/.test(ch)) {
        if (lastSpace) continue;
        text += " ";
        lastSpace = true;
      } else {
        text += ch.toLowerCase();
        lastSpace = false;
      }
      at.push({ node, offset: i });
    }
  }
  return { text, at };
}

/** The range of `quote` inside `root`, or null. */
export function findQuoteRange(root: Element, quote: string): Range | null {
  const target = normalize(quote);
  if (target.length < 8) return null;
  const indexed = indexText(root);
  // The full quote, then ever shorter leading word runs (the page may render
  // the tail of a chunk differently), never shorter than 20 characters.
  const words = target.split(" ");
  const candidates = [target, target.slice(0, 120)];
  for (let n = Math.min(words.length - 1, 16); n >= 4; n--) {
    candidates.push(words.slice(0, n).join(" "));
  }
  for (const needle of candidates) {
    if (needle.length < 20) continue;
    const start = indexed.text.indexOf(needle);
    if (start < 0) continue;
    const first = indexed.at[start];
    const last = indexed.at[start + needle.length - 1];
    if (!first || !last) continue;
    const range = document.createRange();
    range.setStart(first.node, first.offset);
    range.setEnd(last.node, last.offset + 1);
    return range;
  }
  return null;
}

/**
 * Marks and scrolls to `quote` inside #main-content once `ready` is true.
 * Returns nothing; a quote that cannot be found leaves the page as it is.
 */
export function useHighlightQuote(quote: string | null | undefined, ready: boolean): void {
  useEffect(() => {
    if (!quote || !ready) return;
    let found = false;
    const locate = () => {
      if (found) return;
      const root = document.getElementById("main-content");
      if (!root) return;
      const range = findQuoteRange(root, quote);
      if (!range) return;
      found = true;
      const highlights = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
      const HighlightCtor = (window as unknown as { Highlight?: new (r: Range) => unknown })
        .Highlight;
      if (highlights && HighlightCtor) {
        ensureHighlightStyle();
        highlights.set(HIGHLIGHT_NAME, new HighlightCtor(range));
      }
      const el = range.startContainer.parentElement;
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
    };
    const timer = window.setTimeout(locate, 150);
    // A PDF's text arrives later than the page (pdf-document-viewer.tsx).
    window.addEventListener(DOCUMENT_TEXT_READY_EVENT, locate);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(DOCUMENT_TEXT_READY_EVENT, locate);
      (CSS as unknown as { highlights?: Map<string, unknown> }).highlights?.delete(HIGHLIGHT_NAME);
    };
  }, [quote, ready]);
}

/** Same, with the quote from the page URL's `hl` parameter. */
export function useHighlightQuoteFromUrl(ready: boolean): void {
  const quote =
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("hl");
  useHighlightQuote(quote, ready);
}
