// Subsumio brand mark — scales of justice in a royal-blue app tile.
// This is the ONLY logo file for the subsumio-web codebase.
// Every component that previously imported SigmaMark/SigmaLogo now gets the
// Subsumio mark automatically, because we replace the exports here.

import { Scale } from "lucide-react";

/** Subsumio mark — scales of justice icon. */
export function SigmaMark({
  size = 32,
  tile = true,
  className,
}: {
  size?: number;
  tile?: boolean;
  className?: string;
}) {
  if (!tile) {
    return <Scale size={size} className={`text-[#3b82f6] ${className}`} strokeWidth={2} aria-hidden />;
  }

  return (
    <span className={`relative inline-flex shrink-0 ${className}`} style={{ width: size, height: size }}>
      <span
        aria-hidden
        className="absolute -inset-1 rounded-[34%] blur-md opacity-50"
        style={{ background: "radial-gradient(circle, rgba(37,99,235,0.55), transparent 70%)" }}
      />
      <span
        className="relative inline-flex items-center justify-center rounded-[30%] ring-1 ring-white/15 shadow-lg shadow-blue-950/50"
        style={{
          width: size,
          height: size,
          background: "linear-gradient(150deg, #1e3a8a 0%, #1d4ed8 52%, #0ea5e9 100%)",
        }}
      >
        <Scale size={Math.round(size * 0.56)} className="text-white" strokeWidth={2} aria-hidden />
      </span>
    </span>
  );
}

/** Mark + wordmark lockup for nav and footer. */
export function SigmaLogo({
  size = 30,
  wordmarkClassName = "text-lg font-bold text-[#e8e8f0] tracking-tight",
  subtitle,
}: {
  size?: number;
  wordmarkClassName?: string;
  subtitle?: string;
}) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <SigmaMark size={size} />
      <span className="flex flex-col leading-none">
        <span className={`font-display ${wordmarkClassName}`}>
          Subsum<span className="text-[#3b82f6]">•</span>io
        </span>
        {subtitle && (
          <span className="text-[8px] font-medium tracking-[0.22em] [color:var(--mk-text-subtle)] mt-1">{subtitle}</span>
        )}
      </span>
    </span>
  );
}
