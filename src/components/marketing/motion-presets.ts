// Pure module (no hooks, no framer import) — serializable motion presets so
// Server Components can spread them onto client motion elements. The actual
// animation machinery lives in ./motion-system.tsx ("use client"); it
// re-exports these constants for backward compatibility.

/** Viewport triggers for whileInView animations. */
export const VIEWPORT = {
  gentle: { once: true, margin: "0px 0px 80px 0px", amount: 0.12 },
  tight: { once: true, margin: "-60px" },
  hero: { once: true, margin: "0px" },
} as const;

/** Easing curves — plain cubic-bezier arrays, serializable across the
 *  RSC boundary. */
export const EASE = {
  // Smooth deceleration — the default for scroll-reveals
  // Matches --ds-ease-out: cubic-bezier(0.22, 1, 0.36, 1)
  out: [0.22, 1, 0.36, 1] as const,
  // Snappy spring-like
  spring: [0.21, 0.5, 0.27, 1] as const,
  // Dramatic entrance
  // Matches --ds-ease-emphasized: cubic-bezier(0.2, 0, 0, 1) (close approximation)
  dramatic: [0.16, 1, 0.3, 1] as const,
  // Smooth — matches --ds-ease-smooth: cubic-bezier(0.33, 1, 0.68, 1)
  smooth: [0.33, 1, 0.68, 1] as const,
  // Standard — matches --ds-ease-standard: cubic-bezier(0.4, 0, 0.2, 1)
  standard: [0.4, 0, 0.2, 1] as const,
  // Emphasized — matches --ds-ease-emphasized: cubic-bezier(0.2, 0, 0, 1)
  emphasized: [0.2, 0, 0, 1] as const,
  // Panel — matches --ds-ease-panel: cubic-bezier(0.22, 1, 0.36, 1)
  panel: [0.22, 1, 0.36, 1] as const,
} as const;

/** Section/card scroll-reveal preset — subtle scale + Y for depth. */
export const REVEAL = {
  initial: { opacity: 0, y: 24, scale: 0.98 },
  whileInView: { opacity: 1, y: 0, scale: 1 },
  viewport: VIEWPORT.gentle,
  transition: { duration: 0.5, ease: EASE.out },
} as const;
