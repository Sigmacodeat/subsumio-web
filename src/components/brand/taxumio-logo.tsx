"use client";

// Taxumio brand lockup — calculator icon in an emerald app tile + the
// "Taxum•io" wordmark. Uses --brand-* CSS variables which resolve to the
// tax emerald palette when the tax industry theme is active.

import { Calculator } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

export function TaxumioMark({
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
      <Calculator
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
      <span
        aria-hidden
        className="absolute -inset-0.5 rounded-[34%] opacity-50 blur-md"
        style={{
          background:
            "radial-gradient(circle, color-mix(in srgb, var(--brand-primary) 55%, transparent), transparent 70%)",
        }}
      />
      <span
        className="relative inline-flex items-center justify-center rounded-[30%] shadow-lg ring-1 shadow-emerald-950/50 ring-white/15"
        style={{
          width: size,
          height: size,
          background:
            "linear-gradient(150deg, var(--brand-gradient-from) 0%, var(--brand-gradient-via) 52%, var(--brand-gradient-to) 100%)",
        }}
      >
        <Calculator
          size={Math.round(size * 0.56)}
          className="text-white"
          strokeWidth={2}
          aria-hidden
        />
      </span>
    </span>
  );
}

export function TaxumioLogo({
  size = 32,
  subtitle = "TAX INTELLIGENCE",
  className = "",
}: {
  size?: number;
  subtitle?: string;
  className?: string;
}) {
  const reduce = useReducedMotion();

  return (
    <span className={`group inline-flex items-center gap-2.5 ${className}`}>
      <motion.span
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={reduce ? { duration: 0 } : { duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="relative inline-flex"
      >
        <TaxumioMark
          size={size}
          className="transition-shadow duration-300 group-hover:shadow-[0_0_18px_rgba(16,185,129,0.25)]"
        />
      </motion.span>
      <motion.span
        className="flex flex-col leading-none"
        initial={reduce ? false : { opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={
          reduce ? { duration: 0 } : { duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.15 }
        }
      >
        <span
          className="font-display text-[18px] font-bold tracking-tight [color:var(--mk-text)] min-[420px]:text-[20px]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Taxum
          <motion.span
            className="brand-text inline-block"
            animate={
              reduce
                ? undefined
                : {
                    opacity: [0.5, 1, 0.5],
                    scale: [1, 1.15, 1],
                  }
            }
            transition={{
              duration: 3.5,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            •
          </motion.span>
          io
        </span>
        {subtitle && (
          <span className="mt-1 hidden text-[10px] font-semibold tracking-[0.16em] [color:var(--mk-text-subtle)] uppercase min-[420px]:block">
            {subtitle}
          </span>
        )}
      </motion.span>
    </span>
  );
}
