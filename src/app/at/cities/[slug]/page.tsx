import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  JsonLd,
  breadcrumbLd,
  organizationLd,
  serviceLd,
  faqPageLd,
} from "@/components/seo/jsonld";
import { getCityBySlug, getAllCitySlugs, type CityPageContent } from "@/content/city-pages";

const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://subsum.io";

export function generateStaticParams() {
  return getAllCitySlugs().map((slug) => ({ slug }));
}

export function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  return params.then(({ slug }) => {
    const city = getCityBySlug(slug);
    if (!city) return { title: "Nicht gefunden" };
    return {
      title: city.metaTitle,
      description: city.metaDesc,
      alternates: {
        canonical: `/at/cities/${city.slug}`,
        languages: { "de-AT": `/at/cities/${city.slug}` },
      },
      openGraph: {
        title: city.metaTitle,
        description: city.metaDesc,
        url: `/at/cities/${city.slug}`,
        type: "website",
      },
    };
  });
}

// Honest structured data: Subsumio is a SaaS — the product SERVES lawyers in
// the city; it does not operate a physical office there. Claiming a fake
// PostalAddress/telephone per city would be misleading LocalBusiness markup
// (and is exactly the pattern Google's structured-data spam policy flags).
function CityServiceLd(city: CityPageContent) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: `Subsumio — KI-Kanzleisoftware für ${city.city}`,
    serviceType: "KI-Kanzleisoftware",
    url: `${BASE}/at/cities/${city.slug}`,
    provider: { "@type": "Organization", name: "Subsumio", url: BASE },
    areaServed: {
      "@type": "City",
      name: city.city,
      containedInPlace: { "@type": "Country", name: city.country },
    },
  };
}

export default function CityPage({ params }: { params: Promise<{ slug: string }> }) {
  return params.then(({ slug }) => {
    const city = getCityBySlug(slug);
    if (!city) notFound();

    return (
      <>
        <JsonLd data={organizationLd()} />
        <JsonLd data={CityServiceLd(city)} />
        <JsonLd
          data={serviceLd({
            name: city.title,
            description: city.metaDesc,
            url: `/at/cities/${city.slug}`,
            audience: `Rechtsanwälte in ${city.city}`,
          })}
        />
        <JsonLd data={faqPageLd(city.faq)} />
        <JsonLd
          data={breadcrumbLd([
            { name: "Subsumio", url: "/at" },
            { name: "Städte", url: "/at/cities" },
            { name: city.city, url: `/at/cities/${city.slug}` },
          ])}
        />
        <div data-tone="light" className="min-h-screen [background:var(--mk-bg)]">
          <article className="mx-auto max-w-3xl px-4 py-24 sm:px-6 lg:px-8">
            <div className="mb-10">
              <span
                className="mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold text-[color:var(--brand-text)]"
                style={{ background: "color-mix(in srgb, var(--brand-text) 10%, transparent)" }}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--brand-text)]" />
                {city.city} · {city.country}
              </span>
              <h1 className="mb-4 text-[clamp(2rem,5vw,3rem)] leading-[1.1] font-bold tracking-tight text-balance [color:var(--mk-text)]">
                {city.h1}
              </h1>
              <p className="text-lg text-pretty [color:var(--mk-text-muted)]">{city.intro}</p>
            </div>

            <section className="mb-10">
              <h2 className="mb-4 text-2xl font-bold [color:var(--mk-text)]">
                Rechtsordnung: {city.country}
              </h2>
              <p className="mb-4 leading-relaxed text-[color:var(--mk-text-muted)]">
                {city.jurisdictionNote}
              </p>
              <div className="mt-4">
                <h3 className="mb-2 text-lg font-semibold [color:var(--mk-text)]">Gerichte</h3>
                <ul className="ml-6 list-disc space-y-1 text-[color:var(--mk-text-muted)]">
                  {city.courts.map((court) => (
                    <li key={court}>{court}</li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="mb-10">
              <h2 className="mb-4 text-2xl font-bold [color:var(--mk-text)]">
                Features für {city.city}
              </h2>
              <div className="space-y-6">
                {city.features.map((f) => (
                  <div key={f.title}>
                    <h3 className="mb-2 text-lg font-semibold [color:var(--mk-text)]">{f.title}</h3>
                    <p className="text-[color:var(--mk-text-muted)]">{f.desc}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="mb-10">
              <h2 className="mb-4 text-2xl font-bold [color:var(--mk-text)]">FAQ</h2>
              <div className="space-y-4">
                {city.faq.map((item) => (
                  <div key={item.q} className="border-b border-[color:var(--mk-border)] pb-4">
                    <h3 className="mb-2 text-base font-semibold [color:var(--mk-text)]">
                      {item.q}
                    </h3>
                    <p className="text-sm leading-relaxed text-[color:var(--mk-text-muted)]">
                      {item.a}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="mb-10 rounded-2xl border border-[color:var(--mk-border)] bg-[color:var(--mk-surface)] p-8 text-center">
              <h2 className="mb-3 text-2xl font-bold [color:var(--mk-text)]">
                30 Tage kostenlos testen
              </h2>
              <p className="mb-6 text-[color:var(--mk-text-muted)]">
                Keine Kreditkarte. Kein IT-Aufwand. Wenn Subsumio nicht in Woche 1 Zeit spart —
                kündigen Sie.
              </p>
              <Link
                href="/at/signup"
                className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--brand-text)] px-6 py-3 font-semibold text-white transition-opacity hover:opacity-90"
              >
                30 Tage kostenlos testen
              </Link>
            </section>

            <div className="flex flex-wrap gap-4">
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
                href="/at/security"
                className="text-[color:var(--brand-text)] underline underline-offset-4 hover:text-[color:var(--mk-text)]"
              >
                Sicherheit
              </Link>
              <Link
                href="/at/blog"
                className="text-[color:var(--brand-text)] underline underline-offset-4 hover:text-[color:var(--mk-text)]"
              >
                Blog
              </Link>
            </div>
          </article>
        </div>
      </>
    );
  });
}
