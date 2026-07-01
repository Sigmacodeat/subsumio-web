"use client";

// Shared pricing grid — used by the landing page section and /pricing page.
// Includes a monthly/annual billing toggle. Annual is default (−20%).

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PRICING, p, type Lang } from "@/content/site";
import { StaggerContainer, StaggerItem } from "./motion-system";

type Billing = "annual" | "monthly";

export function PricingGrid({ lang }: { lang: Lang }) {
  const pricing = PRICING[lang];
  const [billing, setBilling] = useState<Billing>("annual");
  const isDE = lang !== "en";

  return (
    <>
      {/* Billing toggle */}
      <div className="mb-10 flex items-center justify-center gap-3">
        <button
          onClick={() => setBilling("annual")}
          className={`text-sm font-medium transition-colors ${billing === "annual" ? "brand-text" : "[color:var(--mk-text-muted)] hover:[color:var(--mk-text)]"}`}
          aria-pressed={billing === "annual"}
        >
          {isDE ? "Jährlich" : "Annual"}
          <span className="brand-text brand-soft ml-1.5 rounded-full px-1.5 py-0.5 text-xs">
            −20%
          </span>
        </button>
        <div className="relative h-6 w-12 rounded-full transition-colors [background:var(--mk-border-strong)]">
          <button
            onClick={() => setBilling(billing === "annual" ? "monthly" : "annual")}
            role="switch"
            aria-checked={billing === "monthly"}
            aria-label={isDE ? "Abrechnung umschalten" : "Toggle billing"}
            className={`brand-bg absolute top-0.5 h-5 w-5 rounded-full shadow-sm transition-transform ${billing === "monthly" ? "translate-x-6" : "translate-x-0.5"}`}
          />
        </div>
        <button
          onClick={() => setBilling("monthly")}
          className={`text-sm font-medium transition-colors ${billing === "monthly" ? "brand-text" : "[color:var(--mk-text-muted)] hover:[color:var(--mk-text)]"}`}
          aria-pressed={billing === "monthly"}
        >
          {isDE ? "Monatlich" : "Monthly"}
        </button>
      </div>

      <StaggerContainer
        className={`grid gap-5 md:grid-cols-2 ${pricing.tiers.length >= 4 ? "lg:grid-cols-4" : "mx-auto max-w-5xl lg:grid-cols-3"}`}
        stagger={0.1}
      >
        {pricing.tiers.map((tier) => {
          const displayPrice =
            billing === "monthly" && tier.priceMonthly ? tier.priceMonthly : tier.price;
          const displayPeriod =
            billing === "monthly" && tier.periodMonthly ? tier.periodMonthly : tier.period;
          return (
            <StaggerItem
              key={tier.id}
              className={`relative rounded-2xl transition-all duration-200 hover:-translate-y-1 ${
                tier.highlight
                  ? "gradient-border p-[2px] shadow-[var(--brand-primary)]/20 shadow-xl hover:shadow-[var(--brand-primary)]/30 hover:shadow-2xl"
                  : "hover:shadow-lg"
              }`}
            >
              <div
                data-tone={tier.highlight ? "dark" : undefined}
                className={`relative flex h-full flex-col rounded-2xl border p-6 ${
                  tier.highlight
                    ? "border-transparent"
                    : "[border-color:var(--mk-border)] [background:var(--mk-surface)] hover:[border-color:var(--mk-border-strong)]"
                }`}
                style={
                  tier.highlight
                    ? {
                        background:
                          "radial-gradient(ellipse 90% 55% at 50% -5%, color-mix(in srgb, var(--brand-primary) 18%, transparent) 0%, color-mix(in srgb, var(--brand-primary) 4%, transparent) 45%, transparent 70%), var(--mk-bg)",
                      }
                    : undefined
                }
              >
                {tier.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="brand-bg rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-white">
                      {isDE ? "Beliebteste Wahl" : "Most popular"}
                    </span>
                  </div>
                )}
                <div className="mb-5">
                  <p className="mb-1 text-sm font-medium [color:var(--mk-text-muted)]">
                    {tier.name}
                  </p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold [color:var(--mk-text)]">
                      {displayPrice}
                    </span>
                    <span className="text-xs [color:var(--mk-text-muted)]">{displayPeriod}</span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed [color:var(--mk-text-muted)]">
                    {tier.blurb}
                  </p>
                </div>
                <ul className="mb-7 flex-1 space-y-2.5">
                  {tier.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 text-xs [color:var(--mk-text-muted)]"
                    >
                      <Check
                        size={13}
                        className={`mt-0.5 shrink-0 ${tier.highlight ? "[color:var(--brand-text)]" : "brand-text"}`}
                      />
                      {f}
                    </li>
                  ))}
                </ul>
                {tier.href.startsWith("http") || tier.href.startsWith("mailto") ? (
                  <a
                    href={tier.href}
                    target={tier.href.startsWith("http") ? "_blank" : undefined}
                    rel="noreferrer"
                  >
                    <Button
                      variant={tier.highlight ? "glow" : "secondary"}
                      size="md"
                      className="w-full"
                    >
                      {tier.cta} <ArrowRight size={13} />
                    </Button>
                  </a>
                ) : (
                  <Link href={p(lang, tier.href)}>
                    <Button
                      variant={tier.highlight ? "glow" : "secondary"}
                      size="md"
                      className="w-full"
                    >
                      {tier.cta} <ArrowRight size={13} />
                    </Button>
                  </Link>
                )}
              </div>
            </StaggerItem>
          );
        })}
      </StaggerContainer>
      <p className="mx-auto mt-8 max-w-2xl text-center text-xs [color:var(--mk-text-subtle)]">
        {pricing.footnote}
      </p>
    </>
  );
}
