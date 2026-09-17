"use client";

// Shared page-building primitives for the marketing surface — Section,
// headings, cards, heroes, FAQ, comparison, pricing. Nav/footer/background
// live in ./chrome.tsx; the icon registry in ./icons.ts.

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { H1_CLASS, H2_CTA_CLASS, H3_CLASS } from "./typography";
import Link from "next/link";
import { ArrowRight, ChevronDown, ChevronRight, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EASE, ClipReveal, Reveal, GlowCard, AnimatedCounter } from "./motion-system";
import { SubsumioMark } from "@/components/brand/subsumio-logo";
import { type Tone, type IconProp, resolveIcon } from "./icons";

// Tone-scoped section wrapper. Sets data-tone so descendants resolve the
// --mk-* neutral tokens for that tone, and paints the section background.
// The public site stacks these light-dominant, with data-tone="dark" for
// the spotlight bands (live demo, copilot).
export function Section({
  tone = "light",
  id,
  className = "",
  noTopEdge = false,
  children,
  ...rest
}: {
  tone?: Tone;
  id?: string;
  className?: string;
  noTopEdge?: boolean;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLElement>) {
  // `...rest` forwards native section attributes (notably `aria-label`, which
  // callers pass for landmark labeling) onto the real <section> — previously
  // these were silently dropped, leaving the marketing landmarks unlabeled.
  return (
    <section
      id={id}
      data-tone={tone}
      className={`relative z-10 ${className}`}
      style={{ background: "var(--mk-bg)" }}
      {...rest}
    >
      {(tone === "dark" || tone === "slate") && !noTopEdge && (
        <>
          {/* Premium top edge — 1px hairline + subtle brand glow.
              Replaces cheap gradient strips with a clean, intentional
              boundary (Linear/Vercel pattern). */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px"
            style={{ background: "var(--mk-border-strong)" }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-40"
            style={{
              background:
                "radial-gradient(ellipse 70% 100% at 50% 0%, color-mix(in srgb, var(--brand-primary) 7%, transparent), transparent)",
            }}
          />
        </>
      )}
      {children}
    </section>
  );
}

export function SectionTransition({
  from = "var(--mk-bg)",
  to = "var(--mk-surface)",
  height = 80,
}: {
  from?: string;
  to?: string;
  height?: number;
}) {
  return (
    <div
      aria-hidden
      className="relative z-10 w-full"
      style={{
        height,
        background: `linear-gradient(to bottom, ${from}, ${to})`,
      }}
    />
  );
}

// --- Shared section primitives -------------------------------------------

export function SectionHeading({
  badge,
  title,
  sub,
  tone,
}: {
  badge?: string;
  title: string;
  sub?: string;
  tone?: Tone;
}) {
  // `tone` is optional: when set it makes the heading self-contained (resolves
  // its own --mk-* tokens), otherwise it inherits the surrounding section tone.
  return (
    <motion.div
      data-tone={tone}
      className="mb-14 text-center"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px 80px 0px", amount: 0.15 }}
      transition={{ duration: 0.55, ease: EASE.out }}
    >
      {badge && (
        <motion.span
          className="brand-soft brand-text brand-border mb-5 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold"
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "0px 0px 80px 0px" }}
          transition={{ duration: 0.4, delay: 0.05, ease: EASE.out }}
        >
          <span className="brand-bg h-1.5 w-1.5 rounded-full" />
          {badge}
        </motion.span>
      )}
      <h2 className={`mx-auto mb-4 max-w-3xl ${H2_CTA_CLASS}`}>{title}</h2>
      {sub && (
        <p className="mx-auto max-w-2xl text-base leading-relaxed text-pretty [color:var(--mk-text-muted)] md:text-lg">
          {sub}
        </p>
      )}
    </motion.div>
  );
}

/** Terminal-style demo window with a typewriter answer. */
export function DemoWindow({
  windowTitle,
  you,
  q,
  a,
  sourcesLabel,
  sources,
}: {
  windowTitle: string;
  you: string;
  q: string;
  a: string;
  sourcesLabel: string;
  sources: readonly string[];
}) {
  return (
    <div className="overflow-hidden rounded-2xl border [border-color:var(--mk-border)] text-left shadow-2xl shadow-black/20 [background:var(--mk-surface)]">
      <div className="flex items-center gap-2 border-b [border-color:var(--mk-border)] px-4 py-3 [background:var(--mk-bg)]">
        <div className="terminal-dots flex items-center gap-2">
          <span className="terminal-dot-red" />
          <span className="terminal-dot-amber" />
          <span className="terminal-dot-green" />
        </div>
        <div className="ml-4 flex-1 font-mono text-sm [color:var(--mk-text)] opacity-60">
          {windowTitle}
        </div>
      </div>
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--brand-primary)]/20 bg-[var(--brand-primary)]/15">
            <span className="brand-text text-sm font-semibold">{you}</span>
          </div>
          <p className="text-sm [color:var(--mk-text)]">{q}</p>
        </div>
      </div>
      <div className="px-6 pb-6">
        <div className="flex items-start gap-3">
          <SubsumioMark size={28} className="mt-0.5 shrink-0" />
          <div className="flex-1 text-sm leading-relaxed whitespace-pre-line [color:var(--mk-text-muted)]">
            <TypewriterText text={a} speed={8} />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t [border-color:var(--mk-border)] px-4 py-3 [background:var(--mk-bg)] sm:px-6 lg:px-8">
        <span className="text-sm [color:var(--mk-text)] opacity-60">{sourcesLabel}</span>
        {sources.map((slug) => (
          <span key={slug} className="brand-text brand-soft rounded px-2 py-0.5 font-mono text-sm">
            {slug}
          </span>
        ))}
      </div>
    </div>
  );
}

export function TypewriterText({ text, speed = 12 }: { text: string; speed?: number }) {
  const reduce = useReducedMotion();
  const [displayed, setDisplayed] = useState("");
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (reduce) {
      setDisplayed(text);
      setStarted(true);
      return;
    }
    const t = setTimeout(() => setStarted(true), 800);
    return () => clearTimeout(t);
  }, [reduce, text]);

  useEffect(() => {
    if (reduce || !started || displayed.length >= text.length) return;
    const t = setTimeout(() => setDisplayed(text.slice(0, displayed.length + 1)), speed);
    return () => clearTimeout(t);
  }, [reduce, displayed, started, text, speed]);

  return (
    <span>
      {displayed}
      {!reduce && displayed.length < text.length && started && (
        <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-[var(--brand-text)] align-text-bottom" />
      )}
    </span>
  );
}

// ════════════════════════════════════════════════════════════════════════
// SHARED PAGE PRIMITIVES — canonical building blocks for all marketing pages.
// Every sub-page MUST use these for H1, H2, hero, CTA, cards, badges, icons.
// This enforces typography consistency without per-page custom coding.
// ════════════════════════════════════════════════════════════════════════

// Typography constants live in ./typography (pure module) so Server
// Components can use them; re-exported here for existing client consumers.
export { H1_CLASS, H2_CTA_CLASS, H3_CLASS } from "./typography";

/** Standard badge pill — brand-soft, brand-text, brand-border. */
export function BadgePill({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`brand-soft brand-text brand-border mb-6 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold ${className}`}
    >
      <span className="brand-bg h-1.5 w-1.5 rounded-full" />
      {children}
    </span>
  );
}

/** Standard hero subtitle paragraph. */
export function HeroSub({ children }: { children: React.ReactNode }) {
  return (
    <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-pretty [color:var(--mk-text-muted)] md:text-lg">
      {children}
    </p>
  );
}

/** Standard icon tile — brand-soft, brand-border, brand-text. */
export function IconTile({
  icon,
  size = 22,
  className = "",
}: {
  icon: IconProp;
  size?: number;
  className?: string;
}) {
  const Icon = resolveIcon(icon);
  return (
    <div
      className={`brand-soft brand-border mb-4 flex h-12 w-12 items-center justify-center rounded-xl border transition-transform duration-[var(--ds-duration-normal)] hover:scale-110 ${className}`}
    >
      <Icon size={size} className="brand-text" />
    </div>
  );
}

/** Standard content card — GlowCard wrapper with consistent surface, border,
 *  hover, and shadow.  Uses IconTile + h3 + p pattern. */
export function ContentCard({
  icon,
  title,
  desc,
  iconSize = 22,
  className = "",
}: {
  icon: IconProp;
  title: string;
  desc: string;
  iconSize?: number;
  className?: string;
}) {
  return (
    <GlowCard
      className={`h-full rounded-2xl border [border-color:var(--mk-border)] p-6 transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-[var(--ds-duration-normal)] [background:var(--mk-surface)] hover:-translate-y-1 hover:[border-color:var(--mk-border-strong)] hover:shadow-xl motion-reduce:transition-none ${className}`}
    >
      <IconTile icon={icon} size={iconSize} />
      <h3 className={`mb-2 ${H3_CLASS}`}>{title}</h3>
      <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">{desc}</p>
    </GlowCard>
  );
}

/** Standard page hero — badge, two-part H1 (title + accent claim), subtitle,
 *  optional CTA actions, optional badge icon, optional visual (right column).
 *  Uses ClipReveal for the H1 and motion for badge + subtitle + actions.
 *  All sub-pages should use this instead of rolling their own hero markup.
 *
 *  When `visual` is provided, renders a two-column split (text center on mobile,
 *  text-left / visual-right on lg). When omitted, renders centered single-column. */
export function PageHero({
  badge,
  h1a,
  h1b,
  sub,
  tone = "light",
  accentVariant = "brand",
  icon,
  actions,
  visual,
}: {
  badge?: string;
  h1a: string;
  h1b?: string;
  sub: string;
  tone?: Tone;
  accentVariant?: "brand" | "gradient" | "gradient-premium";
  icon?: IconProp;
  actions?: React.ReactNode;
  visual?: React.ReactNode;
}) {
  const accentClass =
    accentVariant === "gradient"
      ? "gradient-text"
      : accentVariant === "gradient-premium"
        ? "gradient-text-premium glow-text"
        : "brand-text";

  const textCol = (
    <div className={visual ? "text-center lg:text-left" : "text-center"}>
      {badge && (
        <motion.span
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: EASE.out }}
          className={visual ? "inline-flex lg:mx-0" : "inline-flex"}
        >
          <BadgePill>
            {(() => {
              const BadgeIcon = icon ? resolveIcon(icon) : undefined;
              return BadgeIcon ? <BadgeIcon size={14} className="brand-text" /> : null;
            })()}
            {badge}
          </BadgePill>
        </motion.span>
      )}
      <ClipReveal delay={0.1} duration={0.7} direction="up" lcp>
        <h1 className={H1_CLASS}>
          {h1a}
          {h1b && (
            <>
              <br />
              <span className={accentClass}>{h1b}</span>
            </>
          )}
        </h1>
      </ClipReveal>
      {/* Transform-only entrance: hero text is the LCP candidate — it must be
          painted at FCP (no opacity gate). */}
      <motion.div
        initial={{ y: 20 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.55, delay: 0.1, ease: EASE.out }}
      >
        <HeroSub>{sub}</HeroSub>
      </motion.div>
      {actions && (
        <motion.div
          initial={{ y: 20 }}
          animate={{ y: 0 }}
          transition={{ duration: 0.55, delay: 0.2, ease: EASE.out }}
          className={`mt-8 flex flex-col items-center gap-3 sm:flex-row ${visual ? "lg:justify-start" : "justify-center"}`}
        >
          {actions}
        </motion.div>
      )}
    </div>
  );

  if (visual) {
    return (
      <Section tone={tone} className="px-4 pt-20 pb-20 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[55%_45%]">
          {textCol}
          <motion.div
            initial={{ scale: 0.96 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.6, ease: EASE.out, delay: 0.1 }}
            className="relative order-first lg:order-last"
          >
            {visual}
          </motion.div>
        </div>
      </Section>
    );
  }

  return (
    <Section tone={tone} className="px-4 pt-20 pb-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl text-center">{textCol}</div>
    </Section>
  );
}

/** Standard CTA close section — dark tone, logo, H2, subtitle, primary + optional secondary button.
 *  All sub-pages should close with this instead of custom CTA markup. */
export function CTASection({
  title,
  sub,
  href,
  label,
  secondaryHref,
  secondaryLabel,
  showLogo = true,
  tone = "dark",
}: {
  title: string;
  sub: string;
  href: string;
  label: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  showLogo?: boolean;
  tone?: "dark" | "light" | "slate";
}) {
  return (
    <Section tone={tone} className="px-4 py-28 text-center sm:px-6 lg:px-8">
      <Reveal variant="upLg" className="mx-auto max-w-3xl">
        {showLogo && <SubsumioMark size={56} className="mx-auto mb-6" />}
        <h2 className={H2_CTA_CLASS}>{title}</h2>
        <p className="mx-auto mb-8 max-w-xl text-base leading-relaxed text-pretty [color:var(--mk-text-muted)] md:text-lg">
          {sub}
        </p>
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button size="xl" variant="primary" className="group min-h-[48px]" asChild>
            <Link href={href}>
              {label}
              <ArrowRight
                size={18}
                className="transition-transform duration-[var(--ds-duration-normal)] group-hover:translate-x-0.5"
              />
            </Link>
          </Button>
          {secondaryHref && secondaryLabel && (
            <Button size="xl" variant="outline" className="min-h-[48px]" asChild>
              <Link href={secondaryHref}>{secondaryLabel}</Link>
            </Button>
          )}
        </div>
      </Reveal>
    </Section>
  );
}

/** Renders **bold** spans inside demo answers (simple, no markdown lib). */
export function FaqList({ items }: { items: readonly { q: string; a: string }[] }) {
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      {items.map((item) => (
        <details
          key={item.q}
          className="group rounded-xl border [border-color:var(--mk-border)] [background:var(--mk-surface)] open:[border-color:var(--mk-border-strong)]"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-sm font-medium [color:var(--mk-text)]">
            {item.q}
            <ChevronDown
              size={15}
              className="ml-4 shrink-0 [color:var(--mk-text-subtle)] transition-transform group-open:rotate-180"
            />
          </summary>
          <p className="px-5 pb-4 text-sm leading-relaxed [color:var(--mk-text-muted)]">{item.a}</p>
        </details>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// NEW PRIMITIVES — State-of-the-art 2026 SaaS components
// ════════════════════════════════════════════════════════════════════════

/** SplitHero — two-column hero with text left + visual right (55/45).
 *  2026 SaaS standard (Linear, Vercel, Datadog). Falls back to stack on mobile. */
export function SplitHero({
  badge,
  h1a,
  h1b,
  tagline,
  sub,
  h1bClassName = "gradient-text",
  children,
  visual,
  tone = "slate",
  id,
}: {
  badge?: React.ReactNode;
  h1a: string;
  h1b?: string;
  tagline?: string;
  sub: string;
  h1bClassName?: string;
  children?: React.ReactNode;
  visual: React.ReactNode;
  tone?: "light" | "slate" | "dark";
  id?: string;
}) {
  return (
    <Section tone={tone} id={id} className="px-4 pt-20 pb-16 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[55%_45%]">
        <div className="text-center lg:text-left">
          {badge && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, ease: EASE.out }}
              className="mb-6 flex justify-center lg:justify-start"
            >
              {badge}
            </motion.div>
          )}
          <ClipReveal delay={0.1} duration={0.7} direction="up">
            <h1 className={`${H1_CLASS} mb-2`}>
              {h1a}
              {h1b && (
                <>
                  <br />
                  <span className={h1bClassName}>{h1b}</span>
                </>
              )}
            </h1>
          </ClipReveal>
          {tagline && (
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2, ease: EASE.out }}
              className="mt-3 text-lg font-semibold [color:var(--mk-text)] md:text-xl"
            >
              {tagline}
            </motion.p>
          )}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.25, ease: EASE.out }}
          >
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-pretty [color:var(--mk-text-muted)] md:text-lg lg:mx-0">
              {sub}
            </p>
          </motion.div>
          {children && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.35, ease: EASE.out }}
              className="mt-8 flex flex-col items-center gap-6 sm:flex-row lg:justify-start"
            >
              {children}
            </motion.div>
          )}
        </div>
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.3, ease: EASE.out }}
          className="relative order-first lg:order-last"
        >
          {visual}
        </motion.div>
      </div>
    </Section>
  );
}

/** StatCard — animated counter stat with label and optional context line. */
export function StatCard({
  value,
  label,
  context,
  prefix,
  suffix,
  decimals,
}: {
  value: string;
  label: string;
  context?: string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}) {
  // Values are written de-AT ("99,8 %", "1.499 €"): dot groups thousands,
  // comma is the decimal separator. Parsing the comma away once rendered
  // "99,8 %" as "998 %".
  const numericPart = value.match(/[0-9][0-9.,]*/)?.[0] ?? "";
  const normalized = numericPart.replace(/\./g, "").replace(",", ".");
  const num = parseFloat(normalized);
  const extractedSuffix = suffix ?? value.slice(value.indexOf(numericPart) + numericPart.length);
  const extractedPrefix = prefix ?? (numericPart ? value.slice(0, value.indexOf(numericPart)) : "");
  const isNumeric = numericPart !== "" && !isNaN(num) && num > 0;
  const dec = decimals ?? (numericPart.includes(",") ? numericPart.split(",")[1].length : 0);

  return (
    <div className="text-center">
      <p className="mb-1 text-4xl font-bold [color:var(--brand-text)] md:text-5xl">
        {isNumeric ? (
          <AnimatedCounter
            to={num}
            prefix={extractedPrefix}
            suffix={extractedSuffix}
            decimals={dec}
          />
        ) : (
          value
        )}
      </p>
      <p className="text-sm font-semibold [color:var(--mk-text)]">{label}</p>
      {context && (
        <p className="mt-0.5 text-sm leading-relaxed [color:var(--mk-text-muted)]">{context}</p>
      )}
    </div>
  );
}

/** ComparisonTable — responsive comparison matrix (table on desktop, cards on mobile). */
export function ComparisonTable({
  columns,
  rows,
  highlightCol,
}: {
  columns: { label: string; highlight?: boolean }[];
  rows: { feature: string; values: (string | boolean)[] }[];
  highlightCol?: number;
}) {
  return (
    <>
      {/* Desktop: table */}
      <div className="hidden overflow-hidden rounded-2xl border [border-color:var(--mk-border)] md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="[background:var(--mk-surface)]">
              <th className="px-5 py-4 text-left font-semibold [color:var(--mk-text)]">{""}</th>
              {columns.map((col, i) => (
                <th
                  key={i}
                  className={`px-5 py-4 text-center font-semibold [color:var(--mk-text)] ${
                    col.highlight || highlightCol === i
                      ? "brand-text [background:var(--mk-surface-2)]"
                      : ""
                  }`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                className="border-t [border-color:var(--mk-border)] hover:[background:var(--mk-hover)]"
              >
                <td className="px-5 py-3.5 text-left text-[color:var(--mk-text-muted)]">
                  {row.feature}
                </td>
                {row.values.map((val, j) => (
                  <td
                    key={j}
                    className={`px-5 py-3.5 text-center ${
                      columns[j]?.highlight || highlightCol === j
                        ? "[background:var(--mk-surface-2)]"
                        : ""
                    }`}
                  >
                    {typeof val === "boolean" ? (
                      val ? (
                        <Check size={16} className="mx-auto [color:var(--ds-success-text)]" />
                      ) : (
                        <X size={16} className="mx-auto [color:var(--mk-text-subtle)]" />
                      )
                    ) : (
                      <span className="text-sm [color:var(--mk-text)]">{val}</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: cards */}
      <div className="space-y-4 md:hidden">
        {columns.map((col, colIdx) => (
          <div
            key={colIdx}
            className={`rounded-2xl border [border-color:var(--mk-border)] p-6 [background:var(--mk-surface)] ${
              col.highlight || highlightCol === colIdx
                ? "ring-2 ring-[color:var(--brand-text)]"
                : ""
            }`}
          >
            <h4 className="mb-3 font-semibold [color:var(--mk-text)]">{col.label}</h4>
            <dl className="space-y-2">
              {rows.map((row, rowIdx) => (
                <div key={rowIdx} className="flex items-center justify-between gap-3">
                  <dt className="text-sm [color:var(--mk-text-muted)]">{row.feature}</dt>
                  <dd className="text-sm">
                    {typeof row.values[colIdx] === "boolean" ? (
                      row.values[colIdx] ? (
                        <Check size={14} className="[color:var(--ds-success-text)]" />
                      ) : (
                        <X size={14} className="[color:var(--mk-text-subtle)]" />
                      )
                    ) : (
                      <span className="[color:var(--mk-text)]">{row.values[colIdx]}</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </>
  );
}

/** PricingCard — tier card with highlight, features list, and CTA. */
export function PricingCard({
  name,
  price,
  period,
  description,
  features,
  ctaLabel,
  ctaHref,
  highlighted = false,
  badge,
}: {
  name: string;
  price: string;
  period?: string;
  description: string;
  features: string[];
  ctaLabel: string;
  ctaHref: string;
  highlighted?: boolean;
  badge?: string;
}) {
  return (
    <div
      className={`relative flex h-full flex-col rounded-2xl border p-6 transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-[var(--ds-duration-normal)] motion-reduce:transition-none ${
        highlighted
          ? "border-[color:var(--brand-text)] shadow-lg [background:var(--mk-surface-2)] lg:scale-105"
          : "[border-color:var(--mk-border)] [background:var(--mk-surface)] hover:-translate-y-1 hover:shadow-md"
      }`}
    >
      {badge && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[var(--brand-primary)] px-4 py-1 text-sm font-semibold text-white">
          {badge}
        </span>
      )}
      <h3 className="mb-1 text-lg font-bold [color:var(--mk-text)]">{name}</h3>
      <p className="mb-4 text-sm leading-relaxed [color:var(--mk-text-muted)]">{description}</p>
      <div className="mb-5 flex items-baseline gap-1">
        <span className="text-3xl font-bold [color:var(--mk-text)]">{price}</span>
        {period && <span className="text-sm [color:var(--mk-text-muted)]">{period}</span>}
      </div>
      <ul className="mb-6 flex-1 space-y-2.5">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm [color:var(--mk-text-muted)]">
            <Check size={15} className="mt-0.5 shrink-0 [color:var(--ds-success-text)]" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <Link
        href={ctaHref}
        className={`block w-full rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition-[background-color,border-color,color] motion-reduce:transition-none ${
          highlighted
            ? "bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-primary-hover)]"
            : "border [border-color:var(--mk-border-strong)] [color:var(--mk-text)] hover:[background:var(--mk-hover)]"
        }`}
      >
        {ctaLabel}
      </Link>
    </div>
  );
}

/** TrustStrip — compact badge strip for compliance/security signals. */
export function TrustStrip({
  items,
  className = "",
}: {
  items: { label: string; icon?: IconProp }[];
  className?: string;
}) {
  return (
    <div
      className={`flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm [color:var(--mk-text-subtle)] ${className}`}
    >
      {items.map((item, i) => {
        const Icon = item.icon ? resolveIcon(item.icon) : undefined;
        return (
          <motion.span
            key={item.label}
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.3, delay: i * 0.06 }}
            className="inline-flex items-center gap-1.5 font-medium"
          >
            {Icon && <Icon size={14} className="opacity-70" />}
            {item.label}
          </motion.span>
        );
      })}
    </div>
  );
}

/** BreadcrumbNav — visible breadcrumbs for sub-pages. */
export function BreadcrumbNav({
  items,
  className = "",
}: {
  items: { label: string; href?: string }[];
  className?: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className={`flex items-center gap-1.5 text-sm ${className}`}>
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight size={14} className="[color:var(--mk-text-subtle)]" />}
          {item.href ? (
            <Link
              href={item.href}
              className="[color:var(--mk-text-muted)] hover:[color:var(--mk-text)]"
            >
              {item.label}
            </Link>
          ) : (
            <span className="font-medium [color:var(--mk-text)]">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

/** SectionSpacer — consistent section padding using design tokens. */
export function SectionSpacer({
  size = "default",
  className = "",
}: {
  size?: "sm" | "default" | "lg";
  className?: string;
}) {
  const heights = {
    sm: "h-16",
    default: "h-24",
    lg: "h-32",
  };
  return <div className={`${heights[size]} ${className}`} aria-hidden />;
}
