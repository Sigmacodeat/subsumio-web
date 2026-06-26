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
      poweredBy: "Legal software for AT · DE · CH",
      metaTitle: "Subsumio — Law firm software AT · DE · CH",
      metaDesc:
        "AI legal software for law firms in Austria, Germany and Switzerland: case files, deadlines per ZPO/BGB/ABGB, cited AI answers. GDPR-compliant, EU-hosted or self-hosted.",
    },
  },
  de: {
    subsumio: {
      slug: "subsumio",
      vertical: "legal",
      industry: "legal",
      name: "Subsumio",
      claim: "Das Kanzlei-Gehirn.",
      poweredBy: "Kanzleisoftware für AT · DE · CH",
      metaTitle: "Subsumio — Kanzleisoftware AT · DE · CH",
      metaDesc:
        "KI-Kanzleisoftware für Rechtsanwälte in Österreich, Deutschland und der Schweiz: Akten verwalten, Fristen nach ZPO/ABGB/ZGB, KI-Analysen mit Zitaten. DSGVO-konform, EU-gehostet oder On-Premise.",
    },
  },
};
