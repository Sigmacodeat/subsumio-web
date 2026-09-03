"use client";

// Scroll-scrubbed thesis section — the marketing site's answer to a "manifesto"
// interlude (the pattern juricratic.com uses between hero and product demo),
// but built from an honest claim about Subsumio rather than decorative myth.
// Lines build up cumulatively as the user scrolls through a pinned viewport;
// the last line is the punchline, rendered in the brass accent.
//
// Built on the shared PinnedScrollSection primitive (motion-system.tsx) —
// dvh-safe pinning on desktop, a plain stagger reveal on mobile/tablet (no
// scroll-jacking on touch), full static reveal under reduced-motion.

import { PinnedScrollSection, RedactionReveal } from "./motion-system";

interface ThesisScrollProps {
  lines: string[];
}

export default function ThesisScroll({ lines }: ThesisScrollProps) {
  return (
    <div data-tone="light">
      <PinnedScrollSection
        items={lines}
        className="py-24 [background:var(--mk-parchment)] md:py-0"
        itemsClassName="mx-auto max-w-3xl px-6"
        mobileMode="reveal"
        renderItem={(line, i, isLast) => (
          <p
            className={`font-editorial mb-3 text-3xl leading-snug text-balance md:text-4xl lg:text-5xl ${
              isLast ? "[color:var(--mk-accent-brass)]" : "[color:var(--mk-ink)]"
            }`}
          >
            {/* The punchline is the one place on the whole site this
                mechanic earns its keep: the thesis IS "nothing stays
                redacted", so the line that says so gets uncovered from
                behind an ink bar instead of just fading in. */}
            {isLast ? <RedactionReveal barColor="var(--mk-ink)">{line}</RedactionReveal> : line}
          </p>
        )}
      />
    </div>
  );
}
