"use client";

// Shared pricing grid — used by the landing page section and /pricing page.
// Includes a monthly/annual billing toggle. Annual is default (−20%).

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { professionalPricing } from "@/content/audiences";
import { UI_STRINGS, p, type Lang } from "@/content/site";
import { StaggerContainer, StaggerItem } from "./motion-system";

export function PricingGrid({ lang }: { lang: Lang }) {
  const pricing = professionalPricing(lang);
  const ui = UI_STRINGS[lang];

  return (
    <>
      <StaggerContainer
        className={`grid gap-6 md:grid-cols-2 ${pricing.tiers.length >= 4 ? "lg:grid-cols-4" : "mx-auto max-w-5xl lg:grid-cols-3"}`}
        stagger={0.1}
      >
        {pricing.tiers.map((tier) => {
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
                    <span className="brand-bg rounded-full px-3 py-1.5 text-sm font-semibold whitespace-nowrap text-white">
                      {ui.mostPopular}
                    </span>
                  </div>
                )}
                <div className="mb-5">
                  <p className="mb-1 text-sm font-medium [color:var(--mk-text-muted)]">
                    {tier.name}
                  </p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold [color:var(--mk-text)]">{tier.price}</span>
                    <span className="text-sm [color:var(--mk-text-muted)]">{tier.period}</span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed [color:var(--mk-text-muted)]">
                    {tier.blurb}
                  </p>
                </div>
                <ul className="mb-6 flex-1 space-y-2.5">
                  {tier.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 text-sm [color:var(--mk-text-muted)]"
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
      <p className="mx-auto mt-8 max-w-2xl text-center text-sm [color:var(--mk-text-subtle)]">
        {pricing.footnote}
      </p>
    </>
  );
}
