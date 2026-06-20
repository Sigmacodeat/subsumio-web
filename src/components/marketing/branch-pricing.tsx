"use client";

// Per-branch pricing section for the branded vertical pages. Shows the
// vertical's own tiers (vertical-pricing.ts) or the global PRICING fallback,
// with signup deep-links carrying ?industry= so the brain is provisioned for
// that vertical. Card style mirrors PricingGrid.

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PRICING, p, type Lang } from "@/content/site";
import { pricingForIndustry } from "@/content/vertical-pricing";

export default function BranchPricing({ lang, industry }: { lang: Lang; industry: string }) {
  const vp = pricingForIndustry(lang, industry);
  const title = vp?.title ?? PRICING[lang].title;
  const sub = vp?.sub ?? PRICING[lang].sub;
  const tiers = vp?.tiers ?? PRICING[lang].tiers;

  // Map a tier to its billable plan so the signup CTA can carry it; after
  // signup the user lands on billing with auto-checkout for that plan.
  // Only the platform self-serve plans (pro/team) auto-checkout. Premium
  // vertical tiers (e.g. Subsumio's per-seat plans) are sales/onboarding-assisted
  // — annual, seat minimums — so they route to signup WITHOUT a checkout intent
  // and must never inherit the platform's lower pro/team price.
  const PLAN_BY_TIER: Record<string, "pro" | "team"> = {
    pro: "pro",
    team: "team",
  };
  // signup hrefs carry the industry (provisioning pack) + plan (checkout intent).
  const hrefFor = (tier: { id: string; href: string }) => {
    if (tier.href !== "/signup") return tier.href;
    const plan = PLAN_BY_TIER[tier.id];
    return plan ? `/signup?industry=${industry}&plan=${plan}` : `/signup?industry=${industry}`;
  };

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-12 text-center">
        <span className="brand-soft brand-text brand-border mb-4 inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium">
          Pricing
        </span>
        <h2 className="mb-4 text-3xl font-black [color:var(--mk-text)] md:text-4xl">{title}</h2>
        <p className="mx-auto max-w-2xl text-lg [color:var(--mk-text-muted)]">{sub}</p>
      </div>

      <div
        className={`grid gap-5 md:grid-cols-2 ${tiers.length >= 4 ? "lg:grid-cols-4" : "mx-auto max-w-5xl lg:grid-cols-3"}`}
      >
        {tiers.map((tier) => {
          const href = hrefFor(tier);
          const isExternal = href.startsWith("http") || href.startsWith("mailto");
          const btn = (
            <Button variant={tier.highlight ? "glow" : "secondary"} size="md" className="w-full">
              {tier.cta} <ArrowRight size={13} />
            </Button>
          );
          return (
            <div
              key={tier.id}
              className={`relative flex flex-col rounded-2xl border p-6 ${
                tier.highlight
                  ? "brand-border-strong brand-soft"
                  : "[border-color:var(--mk-border)] [background:var(--mk-surface)]"
              }`}
            >
              {tier.highlight && (
                <span className="brand-bg absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full px-2.5 py-0.5 text-xs font-semibold text-white">
                  {lang === "en" ? "Most popular" : "Beliebt"}
                </span>
              )}
              <p className="mb-1 text-sm font-medium [color:var(--mk-text-muted)]">{tier.name}</p>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold [color:var(--mk-text)]">{tier.price}</span>
                <span className="text-xs [color:var(--mk-text-muted)]">{tier.period}</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed [color:var(--mk-text-muted)]">
                {tier.blurb}
              </p>
              <ul className="my-5 flex-1 space-y-2">
                {tier.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-2 text-xs leading-relaxed [color:var(--mk-text-muted)]"
                  >
                    <Check size={13} className="brand-text mt-0.5 shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              {isExternal ? (
                <a
                  href={href}
                  target={href.startsWith("http") ? "_blank" : undefined}
                  rel="noreferrer"
                >
                  {btn}
                </a>
              ) : (
                <Link href={p(lang, href)}>{btn}</Link>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-center text-xs [color:var(--mk-text-subtle)]">
        {PRICING[lang].footnote}{" "}
        <Link href={p(lang, "/pricing")} className="brand-text hover:underline">
          {lang === "en" ? "Full pricing & FAQ" : "Alle Preise & FAQ"}
        </Link>
      </p>
    </div>
  );
}
