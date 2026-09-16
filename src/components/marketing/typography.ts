// Typography constants — pure module (no "use client") so Server Components
// can interpolate them into className template literals. primitives.tsx
// re-exports them for existing client consumers.

/** Standard H1 class — used by PageHero, but also exported for pages that
 *  compose their own hero layout (superbrain, landing). */
export const H1_CLASS =
  "text-[clamp(2.5rem,7vw,4rem)] leading-[1.08] font-bold tracking-tight text-balance [color:var(--mk-text)]";

/** Standard H2 class for CTA closers and inline section headings. */
export const H2_CTA_CLASS =
  "text-3xl font-bold tracking-tight text-balance [color:var(--mk-text)] md:text-4xl";

/** Standard H3 class for card titles and feature headings. */
export const H3_CLASS =
  "text-xl font-semibold tracking-tight text-balance [color:var(--mk-text)] md:text-2xl";
