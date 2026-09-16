import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd, breadcrumbLd, organizationLd } from "@/components/seo/jsonld";
import { CITIES } from "@/content/city-pages";
import { keywordsFor } from "@/lib/seo-keywords";

export const metadata: Metadata = {
  title: "KI-Kanzleisoftware Österreich — Subsumio für Anwälte",
  description:
    "KI-Kanzleisoftware für Rechtsanwälte in Österreich: österreichische Fristen nach ABGB und ZPO, belegte KI-Antworten und Berufsgeheimnis per Architektur — in Wien, Graz, Linz, Salzburg und Innsbruck.",
  keywords: keywordsFor("cities"),
  alternates: { canonical: "/at/cities", languages: { "de-AT": "/at/cities" } },
  openGraph: {
    title: "KI-Kanzleisoftware Österreich — Subsumio für Anwälte",
    description:
      "Österreichische Fristen, Fundstellen und Berufsgeheimnis für Kanzleien in ganz Österreich.",
    url: "/at/cities",
    type: "website",
  },
};

export default function CitiesPage() {
  return (
    <>
      <JsonLd data={organizationLd()} />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/at" },
          { name: "Städte", url: "/at/cities" },
        ])}
      />
      <div data-tone="light" className="min-h-screen [background:var(--mk-bg)]">
        <section className="mx-auto max-w-3xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="mb-12">
            <span
              className="mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold text-[color:var(--brand-text)]"
              style={{ background: "color-mix(in srgb, var(--brand-text) 10%, transparent)" }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--brand-text)]" />
              Österreich
            </span>
            <h1 className="mb-4 text-[clamp(2rem,5vw,3rem)] leading-[1.1] font-bold tracking-tight text-balance [color:var(--mk-text)]">
              KI-Kanzleisoftware für Österreich
            </h1>
            <p className="text-lg text-pretty [color:var(--mk-text-muted)]">
              Subsumio arbeitet mit österreichischem Recht — von ABGB und ZPO bis EO — und kennt die
              Landesfeiertage und Gerichtszüge jedes Bundeslands.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            {Object.values(CITIES).map((city) => (
              <Link
                key={city.slug}
                href={`/at/cities/${city.slug}`}
                className="group rounded-2xl border border-[color:var(--mk-border)] bg-[color:var(--mk-surface)] p-6 transition-[background-color,border-color,color,box-shadow,transform,opacity] hover:-translate-y-1 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none"
              >
                <h2 className="mb-2 text-xl font-bold [color:var(--mk-text)] group-hover:text-[color:var(--brand-text)]">
                  {city.city}
                </h2>
                <p className="text-sm text-[color:var(--mk-text-muted)]">{city.country}</p>
                <p className="mt-3 text-sm text-[color:var(--mk-text-subtle)]">{city.courts[0]}</p>
              </Link>
            ))}
          </div>

          <div className="mt-12 flex flex-wrap gap-4">
            <Link
              href="/at/pricing"
              className="text-[color:var(--brand-text)] underline underline-offset-4 hover:text-[color:var(--mk-text)]"
            >
              Preise & Pläne
            </Link>
            <Link
              href="/at/features"
              className="text-[color:var(--brand-text)] underline underline-offset-4 hover:text-[color:var(--mk-text)]"
            >
              Features
            </Link>
            <Link
              href="/at/blog"
              className="text-[color:var(--brand-text)] underline underline-offset-4 hover:text-[color:var(--mk-text)]"
            >
              Blog
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
