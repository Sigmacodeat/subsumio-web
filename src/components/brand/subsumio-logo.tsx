"use client";

// Subsumio brand lockup — "Fundstelle": the marked line in a file. A margin
// bar, three lines of text, the middle one highlighted in gold — exactly what
// the product delivers (the passage, not just the answer). The wordmark keeps
// the domain dot: Subsum•io = subsum.io.

import { motion, useReducedMotion } from "framer-motion";

const GOLD = "var(--accent-300, #d8b86a)";

export function SubsumioMark({
  size = 32,
  tile = true,
  animated = true,
  className = "",
}: {
  size?: number;
  tile?: boolean;
  /** The gold line draws in once and then breathes very slowly. */
  animated?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const move = animated && !reduce;
  const gradId = `sm-tile-${size}`;

  // Shared geometry on a 72 grid.
  const bar = tile ? "#ffffff" : "currentColor";
  const line = tile ? "rgba(255,255,255,0.5)" : "currentColor";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 72 72"
      role="img"
      aria-label="Subsumio"
      className={`shrink-0 ${tile ? "" : "text-[color:var(--brand-800,#1a3470)]"} ${className}`}
      style={
        tile
          ? {
              filter:
                "drop-shadow(0 2px 6px color-mix(in srgb, var(--brand-800, #1a3470) 35%, transparent))",
            }
          : undefined
      }
    >
      {tile && (
        <>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="var(--brand-500, #2a60df)" />
              <stop offset="1" stopColor="var(--brand-800, #1a3470)" />
            </linearGradient>
          </defs>
          <rect x="2" y="2" width="68" height="68" rx="17" fill={`url(#${gradId})`} />
          <rect
            x="2.5"
            y="2.5"
            width="67"
            height="67"
            rx="16.5"
            fill="none"
            stroke="rgba(255,255,255,0.16)"
          />
        </>
      )}
      {/* margin bar */}
      <rect x="16" y="19" width="7" height="34" rx="2.5" fill={bar} />
      {/* text lines */}
      <rect x="31" y="20" width="25" height="7" rx="3.5" fill={line} opacity={tile ? 1 : 0.3} />
      <rect x="31" y="46" width="17" height="7" rx="3.5" fill={line} opacity={tile ? 1 : 0.3} />
      {/* the Fundstelle */}
      <motion.rect
        x="31"
        y="33"
        width="25"
        height="7"
        rx="3.5"
        fill={GOLD}
        style={{ transformBox: "fill-box", transformOrigin: "left center" }}
        initial={move ? { scaleX: 0.2, opacity: 0.6 } : false}
        animate={
          move ? { scaleX: [0.2, 1, 1, 1], opacity: [0.6, 1, 0.78, 1] } : { scaleX: 1, opacity: 1 }
        }
        transition={
          move
            ? {
                scaleX: {
                  duration: 0.9,
                  ease: [0.22, 1, 0.36, 1],
                  delay: 0.25,
                  times: [0, 1, 1, 1],
                },
                opacity: {
                  duration: 6,
                  ease: "easeInOut",
                  repeat: Infinity,
                  repeatDelay: 2,
                  delay: 1.4,
                },
              }
            : { duration: 0 }
        }
      />
    </svg>
  );
}

export function SubsumioLogo({
  size = 32,
  subtitle = "KANZLEISOFTWARE MIT KI",
  className = "",
}: {
  size?: number;
  subtitle?: string;
  className?: string;
}) {
  const reduce = useReducedMotion();

  return (
    <span className={`group inline-flex items-center gap-2.5 ${className}`}>
      <SubsumioMark
        size={size}
        className="transition-[filter] duration-[var(--ds-duration-normal)] group-hover:[filter:drop-shadow(0_4px_14px_color-mix(in_srgb,var(--brand-primary)_45%,transparent))]"
      />
      <motion.span
        className="flex flex-col leading-none"
        initial={reduce ? false : { opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={
          reduce ? { duration: 0 } : { duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: 0.1 }
        }
      >
        <SubsumioWordmark className="text-[19px] [color:var(--mk-text,var(--ds-text))] min-[420px]:text-[21px]" />
        {subtitle && (
          <span className="mt-1 hidden text-[10px] font-semibold tracking-[0.16em] [color:var(--mk-text-subtle,var(--ds-text-subtle))] uppercase min-[420px]:block">
            {subtitle}
          </span>
        )}
      </motion.span>
    </span>
  );
}

/** "Subsum•io" — serif wordmark with the gold domain dot (subsum.io). */
export function SubsumioWordmark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`leading-none font-semibold tracking-[-0.015em] ${className}`}
      style={{ fontFamily: "var(--font-brand), Georgia, 'Times New Roman', serif" }}
    >
      Subsum
      <span
        aria-hidden
        className="mx-[0.04em] inline-block translate-y-[-0.02em]"
        style={{ color: GOLD }}
      >
        •
      </span>
      <span className="sr-only">.</span>
      io
    </span>
  );
}
