// Subsumio brand lockup — scales of justice in a royal-blue app tile + the
// "Subsum•io" wordmark (the blue dot is the domain dot of subsum.io). A serious,
// legal-professional palette, distinct from the violet Subsumio platform mark.

import { Scale } from "lucide-react";

export function SubsumioMark({
  size = 32,
  tile = true,
  className = "",
}: {
  size?: number;
  tile?: boolean;
  className?: string;
}) {
  if (!tile) {
    return (
      <Scale
        size={size}
        className={`text-[color:var(--brand-primary)] ${className}`}
        strokeWidth={2}
        aria-hidden
      />
    );
  }

  return (
    <span
      className={`relative inline-flex shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      {/* soft outer halo */}
      <span
        aria-hidden
        className="absolute -inset-0.5 rounded-[34%] opacity-50 blur-md"
        style={{
          background:
            "radial-gradient(circle, color-mix(in srgb, var(--brand-primary) 55%, transparent), transparent 70%)",
        }}
      />
      <span
        className="relative inline-flex items-center justify-center rounded-[30%] shadow-lg ring-1 shadow-blue-950/50 ring-white/15"
        style={{
          width: size,
          height: size,
          background:
            "linear-gradient(150deg, var(--brand-gradient-from) 0%, var(--brand-gradient-via) 52%, var(--brand-gradient-to) 100%)",
        }}
      >
        <Scale size={Math.round(size * 0.56)} className="text-white" strokeWidth={2} aria-hidden />
      </span>
    </span>
  );
}

export function SubsumioLogo({
  size = 32,
  subtitle = "LEGAL INTELLIGENCE",
  className = "",
}: {
  size?: number;
  subtitle?: string;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <SubsumioMark size={size} />
      <span className="flex flex-col leading-none">
        <span className="font-display text-[19px] font-bold tracking-tight [color:var(--mk-text)]">
          Subsum<span className="brand-text">•</span>io
        </span>
        {subtitle && (
          <span className="mt-1 text-xs font-medium tracking-[0.22em] [color:var(--mk-text-subtle)]">
            {subtitle}
          </span>
        )}
      </span>
    </span>
  );
}
