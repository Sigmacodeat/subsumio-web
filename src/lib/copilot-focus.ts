"use client";

/**
 * What the person is looking at, for the Copilot: a page that shows one
 * document (or another single item) announces it here, and the Copilot
 * sidebar reads it to ground its answers in that item. Only one focus is
 * active; a page clears its own focus when it unmounts.
 */
import { useEffect, useSyncExternalStore } from "react";

export interface CopilotFocus {
  /** Engine page slug of the item. */
  slug: string;
  title?: string;
  /** The matter the item belongs to, when known. */
  caseSlug?: string;
  kind?: "document" | "email" | "page";
}

let current: CopilotFocus | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function setCopilotFocus(focus: CopilotFocus | null): void {
  current = focus;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCopilotFocus(): CopilotFocus | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null
  );
}

/** Announce `focus` while the calling component is mounted. */
export function useProvideCopilotFocus(focus: CopilotFocus | null): void {
  const slug = focus?.slug;
  const title = focus?.title;
  const caseSlug = focus?.caseSlug;
  const kind = focus?.kind;
  useEffect(() => {
    if (!slug) return;
    setCopilotFocus({ slug, title, caseSlug, kind });
    return () => {
      if (current?.slug === slug) setCopilotFocus(null);
    };
  }, [slug, title, caseSlug, kind]);
}
