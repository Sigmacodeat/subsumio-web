// Taxumio brand lockup — calculator/chart icon in an emerald app tile + the
// "Taxum•io" wordmark (the dot is the domain dot of taxum.io). A professional
// tax-accounting palette, distinct from the violet Sigmabrain platform mark.

import { Calculator } from "lucide-react";

export function TaxumioMark({ size = 36, tile = true, className = "" }: { size?: number; tile?: boolean; className?: string }) {
  if (!tile) {
    return <Calculator size={size} className={`text-[#10b981] ${className}`} strokeWidth={2} aria-hidden />;
  }

  return (
    <span className={`relative inline-flex shrink-0 ${className}`} style={{ width: size, height: size }}>
      {/* soft outer halo */}
      <span
        aria-hidden
        className="absolute -inset-1 rounded-[34%] blur-md opacity-50"
        style={{ background: "radial-gradient(circle, rgba(5,150,105,0.55), transparent 70%)" }}
      />
      <span
        className="relative inline-flex items-center justify-center rounded-[30%] ring-1 ring-white/15 shadow-lg shadow-emerald-950/50"
        style={{
          width: size,
          height: size,
          background: "linear-gradient(150deg, #064e3b 0%, #059669 52%, #10b981 100%)",
        }}
      >
        <Calculator size={Math.round(size * 0.56)} className="text-white" strokeWidth={2} aria-hidden />
      </span>
    </span>
  );
}

export function TaxumioLogo({
  size = 34,
  subtitle = "BY SIGMABRAIN",
  className = "",
}: {
  size?: number;
  subtitle?: string;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <TaxumioMark size={size} />
      <span className="flex flex-col leading-none">
        <span className="font-display text-[19px] font-extrabold tracking-tight [color:var(--mk-text)]">
          Taxum<span className="text-[#10b981]">•</span>io
        </span>
        {subtitle && (
          <span className="text-[8px] font-medium tracking-[0.22em] [color:var(--mk-text-subtle)] mt-1">{subtitle}</span>
        )}
      </span>
    </span>
  );
}
