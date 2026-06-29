// Server-safe JSON-LD injection. Render inside any server page component.
// Data objects are built per page; keep claims consistent with visible copy.

import { ENGINE_REPO_URL, type Lang } from "@/content/site";

export function JsonLd({ data }: { data: object }) {
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
  );
}

const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://subsum.eu";

export function organizationLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Subsumio",
    alternateName: "Subsumio Legal AI",
    url: BASE,
    logo: `${BASE}/icon-512.png`,
    description:
      "Subsumio is AI legal software for law firms in Austria, Germany and Switzerland — cited answers with page-level sources, deadline tracking, conflict checks. Not affiliated with Sumsub (KYC provider).",
    foundingLocation: {
      "@type": "Place",
      name: "Vienna, Austria",
    },
    sameAs: [ENGINE_REPO_URL, "https://www.linkedin.com/company/subsumio", BASE],
  };
}

export function softwareApplicationLd(lang: Lang) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Subsumio",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, Self-hosted",
    description:
      lang === "en"
        ? "AI legal software for law firms in Austria, Germany and Switzerland: matter management, deadline tracking per ZPO/BGB/ABGB, cited AI answers with page-level sources, DATEV export, conflict check. Self-hosted or EU cloud."
        : "KI-Kanzleisoftware für Rechtsanwälte in Österreich, Deutschland und der Schweiz: Aktenverwaltung, Fristenkontrolle nach ZPO/BGB/ABGB, belegte KI-Antworten mit Fundstellen, DATEV-Export, Kollisionsprüfung. On-Premise oder EU-Cloud.",
    offers: [
      {
        "@type": "Offer",
        name: "Open Source",
        price: "0",
        priceCurrency: "EUR",
      },
      {
        "@type": "Offer",
        name: "Pro",
        price: "890",
        priceCurrency: "EUR",
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: "890",
          priceCurrency: "EUR",
          unitText: lang === "en" ? "per seat per month" : "pro Nutzer und Monat",
        },
      },
    ],
  };
}

/** Subsumio product JSON-LD for SEO. */
export function verticalSoftwareApplicationLd(opts: {
  name: string;
  description: string;
  url: string;
  price?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: opts.name,
    applicationCategory: "LegalService",
    operatingSystem: "Web, Self-hosted",
    url: opts.url.startsWith("http") ? opts.url : `${BASE}${opts.url}`,
    description: opts.description,
    isBasedOn: { "@type": "SoftwareApplication", name: "Subsumio", url: BASE },
    ...(opts.price
      ? { offers: { "@type": "Offer", price: opts.price, priceCurrency: "EUR" } }
      : {}),
  };
}

export function breadcrumbLd(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url.startsWith("http") ? item.url : `${BASE}${item.url}`,
    })),
  };
}

export function faqPageLd(faq: readonly { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}

export function howToLd(steps: readonly { title: string; desc: string }[], lang: Lang) {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name:
      lang === "en"
        ? "How Subsumio works: from document to cited answer"
        : "So funktioniert Subsumio: vom Dokument zur belegten Antwort",
    description:
      lang === "en"
        ? "Four steps from question to cited AI answer with page-level citations."
        : "Vier Schritte von der Frage zur belegten KI-Antwort mit Fundstellen.",
    step: steps.map((step, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: step.title,
      text: step.desc,
    })),
  };
}

export function serviceLd(opts: {
  name: string;
  description: string;
  url: string;
  lang: Lang;
  audience?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: opts.name,
    description: opts.description,
    url: opts.url.startsWith("http") ? opts.url : `${BASE}${opts.url}`,
    provider: { "@type": "Organization", name: "Subsumio", url: BASE },
    serviceType: opts.lang === "en" ? "AI legal software" : "KI-Kanzleisoftware",
    areaServed: ["AT", "DE", "CH"],
    audience: opts.audience ? { "@type": "BusinessAudience", name: opts.audience } : undefined,
  };
}

export function localBusinessLd() {
  return {
    "@context": "https://schema.org",
    "@type": "LegalService",
    name: "Subsumio",
    image: `${BASE}/icon-512.png`,
    url: BASE,
    telephone: "+43-1-934-6700",
    priceRange: "€€€",
    address: {
      "@type": "PostalAddress",
      streetAddress: "Schwarzenbergplatz 7",
      addressLocality: "Vienna",
      addressRegion: "Vienna",
      postalCode: "1030",
      addressCountry: "AT",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: 48.2028,
      longitude: 16.3746,
    },
    sameAs: [ENGINE_REPO_URL, "https://www.linkedin.com/company/subsumio"],
  };
}

export function productLd(opts: {
  name: string;
  description: string;
  url: string;
  offers: { name: string; price: string; priceCurrency: string; description?: string }[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: opts.name,
    description: opts.description,
    url: opts.url.startsWith("http") ? opts.url : `${BASE}${opts.url}`,
    brand: { "@type": "Brand", name: "Subsumio" },
    offers: opts.offers.map((o) => ({
      "@type": "Offer",
      name: o.name,
      price: o.price,
      priceCurrency: o.priceCurrency,
      ...(o.description ? { description: o.description } : {}),
    })),
  };
}

export function apiReferenceLd(opts: {
  name: string;
  description: string;
  url: string;
  endpoints?: { name: string; description: string; method: string; path: string }[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": "APIReference",
    name: opts.name,
    description: opts.description,
    url: opts.url.startsWith("http") ? opts.url : `${BASE}${opts.url}`,
    programmingLanguage: "REST",
    ...(opts.endpoints
      ? {
          subComponent: opts.endpoints.map((e) => ({
            "@type": "APIReference",
            name: e.name,
            description: e.description,
            httpMethod: e.method,
            url: e.path,
          })),
        }
      : {}),
  };
}

export function reviewLd(opts: { author: string; rating: number; body: string; date?: string }) {
  return {
    "@type": "Review",
    author: { "@type": "Person", name: opts.author },
    reviewRating: {
      "@type": "Rating",
      ratingValue: opts.rating,
      bestRating: 5,
      worstRating: 1,
    },
    reviewBody: opts.body,
    ...(opts.date ? { datePublished: opts.date } : {}),
  };
}

export function aggregateRatingLd(opts: {
  ratingValue: number;
  reviewCount: number;
  reviews: ReturnType<typeof reviewLd>[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": "AggregateRating",
    ratingValue: opts.ratingValue,
    reviewCount: opts.reviewCount,
    review: opts.reviews,
  };
}

export function videoObjectLd(opts: {
  name: string;
  description: string;
  thumbnailUrl: string;
  uploadDate: string;
  contentUrl?: string;
  embedUrl?: string;
  duration?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: opts.name,
    description: opts.description,
    thumbnailUrl: opts.thumbnailUrl.startsWith("http")
      ? opts.thumbnailUrl
      : `${BASE}${opts.thumbnailUrl}`,
    uploadDate: opts.uploadDate,
    ...(opts.contentUrl ? { contentUrl: opts.contentUrl } : {}),
    ...(opts.embedUrl ? { embedUrl: opts.embedUrl } : {}),
    ...(opts.duration ? { duration: opts.duration } : {}),
    publisher: {
      "@type": "Organization",
      name: "Subsumio",
      url: BASE,
    },
  };
}

export function blogLd(opts: {
  name: string;
  description: string;
  url: string;
  posts: { title: string; url: string; date: string }[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: opts.name,
    description: opts.description,
    url: opts.url.startsWith("http") ? opts.url : `${BASE}${opts.url}`,
    publisher: { "@type": "Organization", name: "Subsumio", url: BASE },
    blogPost: opts.posts.map((p) => ({
      "@type": "BlogPosting",
      headline: p.title,
      url: p.url.startsWith("http") ? p.url : `${BASE}${p.url}`,
      datePublished: p.date,
    })),
  };
}
