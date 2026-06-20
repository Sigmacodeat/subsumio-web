// Product-line landing pages. This codebase serves Subsumio only:
// AI legal software for law firms in Austria, Germany and Switzerland.

import type { Lang } from "./site";
import type { VerticalSlug } from "./verticals";
import type { ProductBrand } from "@/components/marketing/vertical";

export interface ProductContent extends ProductBrand {
  slug: string;
  vertical: VerticalSlug;
  metaTitle: string;
  metaDesc: string;
}

export const PRODUCT_SLUGS = ["subsumio"] as const;
export type ProductSlug = (typeof PRODUCT_SLUGS)[number];

export const PRODUCTS: Record<Lang, Record<ProductSlug, ProductContent>> = {
  en: {
    subsumio: {
      slug: "subsumio",
      vertical: "legal",
      industry: "legal",
      name: "Subsumio",
      claim: "The law firm's brain.",
      poweredBy: "Legal software for Austria & Germany",
      metaTitle: "Subsumio — AI case management software for law firms",
      metaDesc: "Subsumio is the AI legal software for lawyers in Austria & Germany: manage case files, automate deadlines per ZPO/BGB/ABGB, AI analysis with citations — GDPR-compliant, EU-hosted or self-hosted.",
    },
  },
  de: {
    subsumio: {
      slug: "subsumio",
      vertical: "legal",
      industry: "legal",
      name: "Subsumio",
      claim: "Das Kanzlei-Gehirn.",
      poweredBy: "Kanzleisoftware für Österreich & Deutschland",
      metaTitle: "Subsumio — KI-Kanzleisoftware für Rechtsanwälte in Österreich & Deutschland",
      metaDesc: "Subsumio ist die Kanzleisoftware für Rechtsanwälte: Akten & Dokumente verwalten, Fristen nach AVG/ABGB/ZPO automatisieren, KI-Analysen mit Zitaten — DSGVO-konform, EU-gehostet oder self-hosted.",
    },
  },
};
