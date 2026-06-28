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

const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://subsum.eu";

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
      alternates: { canonical: `/cities/${city.slug}`, languages: { de: `/cities/${city.slug}` } },
      openGraph: {
        title: city.metaTitle,
        description: city.metaDesc,
        url: `/cities/${city.slug}`,
        type: "website",
      },
    };
  });
}

function CityLocalBusinessLd(city: CityPageContent) {
  return {
    "@context": "https://schema.org",
    "@type": "LegalService",
    name: `Subsumio — KI-Kanzleisoftware für ${city.city}`,
    image: `${BASE}/icon-512.png`,
    url: `${BASE}/cities/${city.slug}`,
    telephone: "+43-1-934-6700",
    priceRange: "€€€",
    address: {
      "@type": "PostalAddress",
      streetAddress: city.address.street,
      addressLocality: city.city,
      addressRegion: city.address.region,
      postalCode: city.address.postalCode,
      addressCountry: city.countryCode,
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: city.geo.lat,
      longitude: city.geo.lng,
    },
    areaServed: city.city,
    sameAs: [BASE, `${BASE}/about`],
  };
}

export default function CityPage({ params }: { params: Promise<{ slug: string }> }) {
  return params.then(({ slug }) => {
    const city = getCityBySlug(slug);
    if (!city) notFound();

    return (
      <>
        <JsonLd data={organizationLd()} />
        <JsonLd data={CityLocalBusinessLd(city)} />
        <JsonLd
          data={serviceLd({
            name: city.title,
            description: city.metaDesc,
            url: `/cities/${city.slug}`,
            lang: "de",
            audience: `Rechtsanwälte in ${city.city}`,
          })}
        />
        <JsonLd data={faqPageLd(city.faq)} />
        <JsonLd
          data={breadcrumbLd([
            { name: "Subsumio", url: "/" },
            { name: "Städte", url: "/cities" },
            { name: city.city, url: `/cities/${city.slug}` },
          ])}
        />
        <article className="mx-auto max-w-3xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="mb-10">
            <span
              className="mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold text-[color:var(--brand-text)]"
              style={{ background: "color-mix(in srgb, var(--brand-text) 10%, transparent)" }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--brand-text)]" />
              {city.city} · {city.country}
            </span>
            <h1 className="mb-4 text-4xl font-black [color:var(--mk-text)]">{city.h1}</h1>
            <p className="text-lg [color:var(--mk-text-muted)]">{city.intro}</p>
          </div>

          <section className="mb-10">
            <h2 className="mb-4 text-2xl font-bold [color:var(--mk-text)]">
              Jurisdiktion: {city.country}
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
                  <h3 className="mb-2 text-base font-semibold [color:var(--mk-text)]">{item.q}</h3>
                  <p className="text-sm leading-relaxed text-[color:var(--mk-text-muted)]">
                    {item.a}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="mb-10 rounded-2xl border border-[color:var(--mk-border)] bg-[color:var(--mk-surface)] p-8 text-center">
            <h2 className="mb-3 text-2xl font-bold [color:var(--mk-text)]">
              14 Tage testen — in {city.city} und überall
            </h2>
            <p className="mb-6 text-[color:var(--mk-text-muted)]">
              Keine Kreditkarte. Kein IT-Aufwand. Wenn Subsumio nicht in Woche 1 Zeit spart —
              kündigen Sie.
            </p>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--brand-text)] px-6 py-3 font-semibold text-white transition-opacity hover:opacity-90"
            >
              14 Tage kostenlos testen
            </Link>
          </section>

          <div className="flex flex-wrap gap-4">
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
              href="/security"
              className="text-[color:var(--brand-text)] underline underline-offset-4 hover:text-[color:var(--mk-text)]"
            >
              Sicherheit
            </Link>
            <Link
              href="/blog"
              className="text-[color:var(--brand-text)] underline underline-offset-4 hover:text-[color:var(--mk-text)]"
            >
              Blog
            </Link>
          </div>
        </article>
      </>
    );
  });
}
