// Server-safe JSON-LD injection. Render inside any server page component.
// Data objects are built per page; keep claims consistent with visible copy.

import { ENGINE_REPO_URL, type Lang } from "@/content/site";

export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://subsum.eu";

export function organizationLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Subsumio",
    url: BASE,
    logo: `${BASE}/icon-512.png`,
    sameAs: [ENGINE_REPO_URL],
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
      lang === "de"
        ? "Das Company Brain für wissensintensive Teams: eine Antwort statt zehn Dokumente — aus euren Meetings, Mails, Deals und Akten. Self-hosted oder EU-Cloud, Open-Source-Engine."
        : "The company brain for knowledge-intensive teams: one answer instead of ten documents — from your meetings, emails, deals and files. Self-hosted or EU cloud, open-source engine.",
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
        price: "290",
        priceCurrency: "EUR",
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: "290",
          priceCurrency: "EUR",
          unitText: lang === "de" ? "pro Seat und Monat" : "per seat per month",
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
