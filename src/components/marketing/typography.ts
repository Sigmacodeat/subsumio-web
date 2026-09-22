// Typography constants — pure module (no "use client") so Server Components
// can interpolate them into className template literals. primitives.tsx
// re-exports them for existing client consumers.

/** Standard H1 class — used by PageHero, but also exported for pages that
 *  compose their own hero layout (superbrain, landing). */
export const H1_CLASS =
  "text-[clamp(2.5rem,7vw,4.25rem)] leading-[1.05] font-medium tracking-[-0.022em] text-balance [color:var(--mk-text)]";

/** Standard H2 class for CTA closers and inline section headings. */
export const H2_CTA_CLASS =
  "text-3xl leading-[1.12] font-medium tracking-[-0.018em] text-balance [color:var(--mk-text)] md:text-[2.625rem]";

/** Section eyebrow — small caps label with hairlines instead of a pill badge.
 *  Editorial, quiet, and reads as a chapter mark rather than a sticker. */
export const EYEBROW_CLASS =
  "inline-flex items-center gap-3 text-[0.75rem] font-semibold tracking-[0.16em] uppercase [color:var(--brand-text)] before:h-px before:w-6 before:bg-current before:opacity-50 before:content-['']";

/** Standard H3 class for card titles and feature headings. */
export const H3_CLASS =
  "text-xl font-semibold tracking-tight text-balance [color:var(--mk-text)] md:text-2xl";

// --- Vertical rhythm ---------------------------------------------------------
// One section rhythm site-wide: every section carries 96 px above and below
// (py-24) — 96 px to a tone edge, 192 px between two same-tone sections.
// FLUSH is only for a band that belongs to the block above it (the proof band
// right under a hero), where a second 96 px would tear the two apart.
export const SECTION_PAD = "px-4 py-24 sm:px-6 lg:px-8";
export const SECTION_PAD_FLUSH = "px-4 pb-24 sm:px-6 lg:px-8";
/** Content column — aligns section content with the hero and the navigation. */
export const SECTION_COLUMN = "mx-auto w-full max-w-7xl";
