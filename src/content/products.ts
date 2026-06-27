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
      poweredBy: "AI legal software for AT · DE · CH",
      metaTitle: "Subsumio — AI Legal Software for Law Firms in AT · DE · CH",
      metaDesc:
        "AI legal software for law firms in Austria, Germany and Switzerland: matter management, deadline tracking per ZPO/BGB/ABGB, cited AI answers with page-level sources, DATEV export, conflict check. GDPR-ready, EU cloud or self-hosted.",
    },
  },
  de: {
    subsumio: {
      slug: "subsumio",
      vertical: "legal",
      industry: "legal",
      name: "Subsumio",
      claim: "Das Kanzlei-Gedächtnis.",
      poweredBy: "KI-Kanzleisoftware für AT · DE · CH",
      metaTitle: "Subsumio — KI-Kanzleisoftware für Rechtsanwälte | AT · DE · CH",
      metaDesc:
        "KI-Kanzleisoftware für Kanzleien in Österreich, Deutschland und der Schweiz: Aktenverwaltung, Fristenkontrolle nach ZPO/BGB/ABGB, belegte KI-Antworten mit Fundstellen, DATEV-Export, Kollisionsprüfung. DSGVO-konform, EU-Cloud oder On-Premise.",
    },
  },
};
