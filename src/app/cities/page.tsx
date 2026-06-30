import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd, breadcrumbLd, organizationLd } from "@/components/seo/jsonld";
import { CITIES } from "@/content/city-pages";
import { keywordsFor } from "@/lib/seo-keywords";

export const metadata: Metadata = {
  title: "Subsumio für DACH: Wien, Berlin, Zürich",
  description:
    "KI-Kanzleisoftware für Rechtsanwälte in Wien (ABGB/ZPO), Berlin (BGB/ZPO) und Zürich (ZGB/OR). DACH-spezifische Fristenberechnung, belegte KI-Antworten, Berufsgeheimnis per Architektur.",
  keywords: keywordsFor("cities"),
  alternates: { canonical: "/cities", languages: { de: "/cities" } },
  openGraph: {
    title: "Subsumio für DACH: Wien, Berlin, Zürich",
    description:
      "KI-Kanzleisoftware für DACH: ABGB, BGB, ZGB. Fristen, Fundstellen, Berufsgeheimnis.",
    url: "/cities",
    type: "website",
  },
};

export default function CitiesPage() {
  return (
    <>
      <JsonLd data={organizationLd()} />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/" },
          { name: "Städte", url: "/cities" },
        ])}
      />
      <div className="mx-auto max-w-3xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="mb-12">
          <span
            className="mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold text-[color:var(--brand-text)]"
            style={{ background: "color-mix(in srgb, var(--brand-text) 10%, transparent)" }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--brand-text)]" />
            Local SEO
          </span>
          <h1 className="mb-4 text-4xl font-black [color:var(--mk-text)]">
            KI-Kanzleisoftware für DACH-Städte
          </h1>
          <p className="text-lg [color:var(--mk-text-muted)]">
            Subsumio arbeitet mit dem jeweiligen nationalen Recht — ABGB in Wien, BGB in Berlin, ZGB
            in Zürich. Wähle deine Stadt:
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-3">
          {Object.values(CITIES).map((city) => (
            <Link
              key={city.slug}
              href={`/cities/${city.slug}`}
              className="group rounded-2xl border border-[color:var(--mk-border)] bg-[color:var(--mk-surface)] p-6 transition-all hover:-translate-y-1 hover:shadow-lg"
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
            href="/pricing"
            className="text-[color:var(--brand-text)] underline underline-offset-4 hover:text-[color:var(--mk-text)]"
          >
            Preise & Pläne
          </Link>
          <Link
            href="/features"
            className="text-[color:var(--brand-text)] underline underline-offset-4 hover:text-[color:var(--mk-text)]"
          >
            Features
          </Link>
          <Link
            href="/blog"
            className="text-[color:var(--brand-text)] underline underline-offset-4 hover:text-[color:var(--mk-text)]"
          >
            Blog
          </Link>
        </div>
      </div>
    </>
  );
}
