import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  JsonLd,
  breadcrumbLd,
  organizationLd,
  serviceLd,
  faqPageLd,
} from "@/components/seo/jsonld";
import {
  getCityBySlugDe as getCityBySlug,
  getAllCitySlugsDe as getAllCitySlugs,
  type CityPageContent,
} from "@/content/city-pages-de";
import { CityPage as CityPageView } from "@/components/marketing/city-pages";

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
        canonical: `/de/cities/${city.slug}`,
        languages: { "de-DE": `/de/cities/${city.slug}` },
      },
      openGraph: {
        title: city.metaTitle,
        description: city.metaDesc,
        url: `/de/cities/${city.slug}`,
        type: "website",
      },
    };
  });
}

// Honest structured data: Subsumio is a SaaS — the product SbeAES lawyers in
// the city; it does not operate a physical office there. Claiming a fake
// PostalAddress/telephone per city would be misleading LocalBusiness markup
// (and is exactly the pattern Google's structured-data spam policy flags).
function CityServiceLd(city: CityPageContent) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: `Subsumio — KI-Kanzleisoftware für ${city.city}`,
    serviceType: "KI-Kanzleisoftware",
    url: `${BASE}/de/cities/${city.slug}`,
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
            url: `/de/cities/${city.slug}`,
            audience: `Rechtsanwälte in ${city.city}`,
          })}
        />
        <JsonLd data={faqPageLd(city.faq)} />
        <JsonLd
          data={breadcrumbLd([
            { name: "Subsumio", url: "/de" },
            { name: "Städte", url: "/de/cities" },
            { name: city.city, url: `/de/cities/${city.slug}` },
          ])}
        />
        <CityPageView market="de" city={city} />
      </>
    );
  });
}
