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
  const isDE = lang === "de";

  return (
    <>
      {/* Billing toggle */}
      <div className="flex items-center justify-center gap-3 mb-10">
        <button
          onClick={() => setBilling("annual")}
          className={`text-sm font-medium transition-colors ${billing === "annual" ? "brand-text" : "[color:var(--mk-text-muted)] hover:[color:var(--mk-text)]"}`}
          aria-pressed={billing === "annual"}
        >
          {isDE ? "Jährlich" : "Annual"}
          <span className="ml-1.5 text-xs brand-text brand-soft px-1.5 py-0.5 rounded-full">−20%</span>
        </button>
        <div className="relative w-12 h-6 rounded-full [background:var(--mk-border)] transition-colors">
          <button
            onClick={() => setBilling(billing === "annual" ? "monthly" : "annual")}
            role="switch"
            aria-checked={billing === "monthly"}
            aria-label={isDE ? "Abrechnung umschalten" : "Toggle billing"}
            className={`absolute top-0.5 w-5 h-5 rounded-full brand-bg shadow-sm transition-transform ${billing === "monthly" ? "translate-x-6" : "translate-x-0.5"}`}
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

      <StaggerContainer className={`grid md:grid-cols-2 gap-5 ${pricing.tiers.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3 max-w-5xl mx-auto"}`} stagger={0.1}>
        {pricing.tiers.map((tier) => {
          const displayPrice = billing === "monthly" && tier.priceMonthly ? tier.priceMonthly : tier.price;
          const displayPeriod = billing === "monthly" && tier.periodMonthly ? tier.periodMonthly : tier.period;
          return (
            <StaggerItem
              key={tier.id}
              className={`relative p-7 rounded-2xl border flex flex-col transition-all duration-200 ${
                tier.highlight
                  ? "border-[var(--brand-primary)]/50 bg-gradient-to-b from-[var(--brand-primary)]/10 to-[var(--mk-surface)] shadow-xl shadow-[var(--brand-primary)]/20"
                  : "[border-color:var(--mk-border)] [background:var(--mk-surface)] hover:[border-color:var(--mk-border-strong)]"
              }`}
            >
              {tier.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="brand-bg text-white text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap">
                    {isDE ? "Beliebteste Wahl" : "Most popular"}
                  </span>
                </div>
              )}
              <div className="mb-5">
                <p className="text-sm font-medium [color:var(--mk-text-muted)] mb-1">{tier.name}</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold [color:var(--mk-text)]">{displayPrice}</span>
                  <span className="text-xs [color:var(--mk-text-muted)]">{displayPeriod}</span>
                </div>
                <p className="text-xs [color:var(--mk-text-muted)] mt-2 leading-relaxed">{tier.blurb}</p>
              </div>
              <ul className="space-y-2.5 flex-1 mb-7">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs [color:var(--mk-text-muted)]">
                    <Check size={13} className="brand-text shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
              {tier.href.startsWith("http") || tier.href.startsWith("mailto") ? (
                <a href={tier.href} target={tier.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
                  <Button variant={tier.highlight ? "glow" : "secondary"} size="md" className="w-full">
                    {tier.cta} <ArrowRight size={13} />
                  </Button>
                </a>
              ) : (
                <Link href={p(lang, tier.href)}>
                  <Button variant={tier.highlight ? "glow" : "secondary"} size="md" className="w-full">
                    {tier.cta} <ArrowRight size={13} />
                  </Button>
                </Link>
              )}
            </StaggerItem>
          );
        })}
      </StaggerContainer>
      <p className="text-center text-xs [color:var(--mk-text-subtle)] mt-8 max-w-2xl mx-auto">{pricing.footnote}</p>
    </>
  );
}
