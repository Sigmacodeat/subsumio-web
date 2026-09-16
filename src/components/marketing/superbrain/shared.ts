// Shared helpers for the SuperBrain marketing sections.

import { EASE, VIEWPORT } from "../motion-system";

/** Section/card scroll-reveal preset — subtle fade-up. */
export const reveal = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: VIEWPORT.gentle,
  transition: { duration: 0.5, ease: EASE.out },
} as const;

export type { SuperbrainCopyDe } from "../superbrain-content";
