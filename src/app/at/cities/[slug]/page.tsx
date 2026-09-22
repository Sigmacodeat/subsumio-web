import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  JsonLd,
  breadcrumbLd,
  organizationLd,
  serviceLd,
  faqPageLd,
} from "@/components/seo/jsonld";
import { getCityBySlug, getAllCitySlugs, type CityPageContent } from "@/content/city-pages";
import { CityPage as CityPageView } from "@/components/marketing/city-pages";

const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://subsum.io";

export const dynamicParams = false;
export const dynamic = "force-static";

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
        languages: {
          "de-AT": `/at/cities/${city.slug}`,
          "de-DE": `/de/cities/${city.slug}`,
          "x-default": `/at/cities/${city.slug}`,
        },
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

export default async function CityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
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
      <CityPageView city={city} />
    </>
  );
}
