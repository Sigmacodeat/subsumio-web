// Sigmabrain brand mark — the "Sigma Synapse".
//
// The letterform Σ drawn as a knowledge graph: five nodes joined by four
// edges trace the sigma's stroke path. It reads as the letter AND as the
// product (typed nodes + edges) in one glyph. This duality is the brand:
// nobody else can wear it.
//
// Usage: <SigmaMark size={32} /> for the tile, <SigmaLogo /> for mark+wordmark.

const NODES: [number, number, number][] = [
  // x, y, radius — stroke path: top-right → top-left → core → bottom-left → bottom-right
  [80, 19, 7],
  [27, 19, 7],
  [56, 50, 9.5], // the core node, slightly heavier — the "brain"
  [27, 81, 7],
  [80, 81, 7],
];

const EDGE_PATH = "M80 19 L27 19 L56 50 L27 81 L80 81";

export function SigmaMark({
  size = 32,
  tile = true,
  className,
}: {
  size?: number;
  /** true → violet rounded tile behind the glyph (app-icon look). false → bare glyph. */
  tile?: boolean;
  className?: string;
}) {
  const glyph = (
    <>
      <path
        d={EDGE_PATH}
        fill="none"
        stroke="currentColor"
        strokeWidth={9}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.55}
      />
      {NODES.map(([x, y, r]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="currentColor" />
      ))}
    </>
  );

  if (!tile) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        className={className}
        aria-hidden="true"
        focusable="false"
      >
        {glyph}
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="sb-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--brand-secondary, #20d3c2)" />
          <stop offset="52%" stopColor="var(--brand-primary, #2f6bff)" />
          <stop offset="100%" stopColor="var(--brand-tertiary, #8b5cf6)" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="100" height="100" rx="24" fill="url(#sb-tile)" />
      <g transform="translate(50 50) scale(0.72) translate(-53.5 -50)" color="#ffffff">
        {glyph}
      </g>
    </svg>
  );
}

/** Mark + wordmark lockup for nav and footer. */
export function SigmaLogo({
  size = 30,
  wordmarkClassName = "text-lg font-bold text-[#e8e8f0] tracking-tight",
}: {
  size?: number;
  wordmarkClassName?: string;
}) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <SigmaMark size={size} />
      <span className={`font-display ${wordmarkClassName}`}>
        Sigma<span className="text-[var(--brand-secondary)]">brain</span>
      </span>
    </span>
  );
}
