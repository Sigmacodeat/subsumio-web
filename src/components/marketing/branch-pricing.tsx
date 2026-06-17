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
    return plan
      ? `/signup?industry=${industry}&plan=${plan}`
      : `/signup?industry=${industry}`;
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="text-center mb-12">
        <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium brand-soft brand-text border brand-border mb-4">
          Pricing
        </span>
        <h2 className="text-3xl md:text-4xl font-black [color:var(--mk-text)] mb-4">{title}</h2>
        <p className="text-lg [color:var(--mk-text-muted)] max-w-2xl mx-auto">{sub}</p>
      </div>

      <div className={`grid md:grid-cols-2 gap-5 ${tiers.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3 max-w-5xl mx-auto"}`}>
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
              className={`relative flex flex-col p-6 rounded-2xl border ${
                tier.highlight ? "brand-border-strong brand-soft" : "[border-color:var(--mk-border)] [background:var(--mk-surface)]"
              }`}
            >
              {tier.highlight && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full brand-bg text-white text-[10px] font-semibold">
                  {lang === "en" ? "Most popular" : "Beliebt"}
                </span>
              )}
              <p className="text-sm font-medium [color:var(--mk-text-muted)] mb-1">{tier.name}</p>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold [color:var(--mk-text)]">{tier.price}</span>
                <span className="text-xs [color:var(--mk-text-muted)]">{tier.period}</span>
              </div>
              <p className="text-xs [color:var(--mk-text-muted)] mt-2 leading-relaxed">{tier.blurb}</p>
              <ul className="space-y-2 my-5 flex-1">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-[#a8a8be] leading-relaxed">
                    <Check size={13} className="brand-text shrink-0 mt-0.5" /> {f}
                  </li>
                ))}
              </ul>
              {isExternal ? (
                <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">{btn}</a>
              ) : (
                <Link href={p(lang, href)}>{btn}</Link>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs [color:var(--mk-text-subtle)] mt-6">
        {PRICING[lang].footnote}{" "}
        <Link href={p(lang, "/pricing")} className="brand-text hover:underline">
          {lang === "en" ? "Full pricing & FAQ" : "Alle Preise & FAQ"}
        </Link>
      </p>
    </div>
  );
}
