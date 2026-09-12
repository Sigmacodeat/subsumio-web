// Subsumio legal product content.

import type { Lang } from "./site";
import type { VerticalSlug } from "./verticals";
import type { ProductBrand } from "@/components/marketing/vertical";

export interface ProductContent extends ProductBrand {
  slug: "subsumio";
  vertical: VerticalSlug;
  metaTitle: string;
  metaDesc: string;
}

export const PRODUCT_SLUGS = ["subsumio"] as const;
export type ProductSlug = (typeof PRODUCT_SLUGS)[number];
type ProductMap = Record<ProductSlug, ProductContent>;

const de: ProductContent = {
  slug: "subsumio",
  vertical: "legal",
  industry: "legal",
  name: "Subsumio",
  claim: "Das Kanzlei-Brain.",
  poweredBy: "KI-Kanzleisoftware für AT · DE · CH",
  metaTitle: "Subsumio — KI-Kanzleisoftware für Rechtsanwälte | AT · DE · CH",
  metaDesc:
    "KI-Kanzleisoftware für Kanzleien in AT, DE & CH: Akten, Fristen nach ZPO/BGB/ABGB, belegte KI-Antworten mit Fundstellen, DATEV-Export und Kollisionsprüfung.",
};

const en: ProductContent = {
  ...de,
  claim: "The law firm's brain.",
  poweredBy: "AI legal software for AT · DE · CH",
  metaTitle: "Subsumio — AI Legal Software for Law Firms in AT · DE · CH",
  metaDesc:
    "AI legal software for law firms in AT, DE & CH: matters, deadlines, cited AI answers, DATEV export and conflict checks.",
};

const at: ProductContent = {
  ...de,
  metaTitle: "Subsumio — KI-Kanzleisoftware für Rechtsanwälte in Österreich",
  metaDesc:
    "KI-Kanzleisoftware für Kanzleien in Österreich: Akten, Fristen nach ZPO/ABGB, belegte KI-Antworten, ADATEV-Export und Kollisionsprüfung nach § 10 RAO.",
};

const ch: ProductContent = {
  ...de,
  metaTitle: "Subsumio — KI-Kanzleisoftware für Rechtsanwälte in der Schweiz",
  metaDesc:
    "KI-Kanzleisoftware für Kanzleien in der Schweiz: Akten, Fristen nach ZPO/ZGB, belegte KI-Antworten und Kollisionsprüfung nach BGFA.",
};

function product(content: ProductContent): ProductMap {
  return { subsumio: content };
}

export const PRODUCTS: Record<Lang, ProductMap> = {
  de: product(de),
  at: product(at),
  ch: product(ch),
  en: product(en),
};
