import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { privateOffers } from "@/content/audiences";
import { p, type Lang } from "@/content/site";
import { Button } from "@/components/ui/button";

export function PrivatePricingGrid({ lang }: { lang: Lang }) {
  const pricing = privateOffers(lang);

  return (
    <>
      <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
        {pricing.offers.map((offer) => (
          <article
            key={offer.id}
            className={`flex h-full flex-col rounded-2xl border p-6 ${
              offer.highlight
                ? "brand-border shadow-xl [background:color-mix(in_srgb,var(--brand-primary)_5%,var(--mk-surface))]"
                : "[border-color:var(--mk-border)] [background:var(--mk-surface)]"
            }`}
          >
            {offer.highlight && (
              <span className="brand-text brand-soft mb-4 w-fit rounded-full px-3 py-1 text-xs font-semibold">
                {lang === "en" ? "Most selected" : "Am häufigsten gewählt"}
              </span>
            )}
            <p className="text-sm font-medium [color:var(--mk-text-muted)]">{offer.name}</p>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-3xl font-bold [color:var(--mk-text)]">{offer.price}</span>
              <span className="text-sm [color:var(--mk-text-muted)]">{offer.period}</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed [color:var(--mk-text-muted)]">
              {offer.blurb}
            </p>
            <ul className="my-6 flex-1 space-y-2.5">
              {offer.features.map((feature) => (
                <li
                  key={feature}
                  className="flex items-start gap-2 text-sm [color:var(--mk-text-muted)]"
                >
                  <Check size={14} className="brand-text mt-0.5 shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>
            <Link href={p(lang, offer.href)}>
              <Button className="w-full" variant={offer.highlight ? "glow" : "secondary"}>
                {offer.cta} <ArrowRight size={14} />
              </Button>
            </Link>
          </article>
        ))}
      </div>
      <p className="mx-auto mt-7 max-w-3xl text-center text-xs leading-relaxed [color:var(--mk-text-subtle)]">
        {lang === "en"
          ? "Subsumio provides automated legal information and orientation. Results can be incomplete and do not replace advice from a qualified lawyer."
          : "Subsumio liefert automatisierte rechtliche Informationen und Orientierung. Ergebnisse können unvollständig sein und ersetzen keine Beratung durch eine qualifizierte Rechtsanwältin oder einen qualifizierten Rechtsanwalt."}
      </p>
    </>
  );
}
