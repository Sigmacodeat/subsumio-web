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
        price: "290",
        priceCurrency: "EUR",
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: "290",
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
