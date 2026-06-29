// Product-line landing pages. This codebase serves Subsumio only:
// AI legal software for law firms in Austria, Germany and Switzerland.

import { type Lang, deepMerge, applyReplacements } from "./site";
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

const _deProducts: Record<ProductSlug, ProductContent> = {
  subsumio: {
    slug: "subsumio",
    vertical: "legal",
    industry: "legal",
    name: "Subsumio",
    claim: "Das Kanzlei-Brain.",
    poweredBy: "KI-Kanzleisoftware für AT · DE · CH",
    metaTitle: "Subsumio — KI-Kanzleisoftware für Rechtsanwälte | AT · DE · CH",
    metaDesc:
      "KI-Kanzleisoftware für Kanzleien in AT, DE & CH: Akten, Fristen nach ZPO/BGB/ABGB, belegte KI-Antworten mit Fundstellen, DATEV-Export, Kollisionsprüfung. DSGVO-konform.",
  },
};

const _enProducts: Record<ProductSlug, ProductContent> = {
  subsumio: {
    slug: "subsumio",
    vertical: "legal",
    industry: "legal",
    name: "Subsumio",
    claim: "The law firm's brain.",
    poweredBy: "AI legal software for AT · DE · CH",
    metaTitle: "Subsumio — AI Legal Software for Law Firms in AT · DE · CH",
    metaDesc:
      "AI legal software for law firms in AT, DE & CH: matters, deadlines per ZPO/BGB/ABGB, cited AI answers with page-level sources, DATEV export, conflict check.",
  },
};

export const PRODUCTS: Record<Lang, Record<ProductSlug, ProductContent>> = {
  en: _enProducts,
  de: _deProducts,
  at: deepMerge(_deProducts, {
    subsumio: {
      metaTitle: "Subsumio — KI-Kanzleisoftware für Rechtsanwälte in Österreich | AT · DE · CH",
      metaDesc:
        "KI-Kanzleisoftware für Kanzleien in Österreich: Akten, Fristen nach ZPO/ABGB, belegte KI-Antworten mit Fundstellen, ADATEV-Export, Kollisionsprüfung (§ 10 RAO).",
    },
  }),
  ch: deepMerge(_deProducts, {
    subsumio: {
      metaTitle: "Subsumio — KI-Kanzleisoftware für Rechtsanwälte in der Schweiz | AT · DE · CH",
      metaDesc:
        "KI-Kanzleisoftware für Kanzleien in der Schweiz: Akten, Fristen nach ZPO/ZGB, belegte KI-Antworten mit Fundstellen, Kollisionsprüfung (BGFA). DSGVO-konform.",
    },
  }),
  it: applyReplacements(JSON.parse(JSON.stringify(_enProducts)), {
    "The law firm's brain.": "Il cervello dello studio legale.",
    "AI legal software for AT · DE · CH": "Software legale AI per IT · DE · CH",
    "Subsumio — AI Legal Software for Law Firms in AT · DE · CH":
      "Subsumio — Software Legale AI per Studi Legali in IT · DE · CH",
    "AI legal software for law firms in AT, DE & CH: matters, deadlines per ZPO/BGB/ABGB, cited AI answers with page-level sources, DATEV export, conflict check.":
      "Software legale AI per studi legali in IT, DE & CH: pratiche, scadenze per ZPO/BGB/ABGB, risposte AI citate con fonti a livello di pagina, export DATEV, controllo conflitti.",
  }),
  es: applyReplacements(JSON.parse(JSON.stringify(_enProducts)), {
    "The law firm's brain.": "El cerebro del bufete.",
    "AI legal software for AT · DE · CH": "Software legal IA para ES · DE · CH",
    "Subsumio — AI Legal Software for Law Firms in AT · DE · CH":
      "Subsumio — Software Legal IA para Bufetes en ES · DE · CH",
    "AI legal software for law firms in AT, DE & CH: matters, deadlines per ZPO/BGB/ABGB, cited AI answers with page-level sources, DATEV export, conflict check.":
      "Software legal IA para bufetes en ES, DE & CH: asuntos, plazos según ZPO/BGB/ABGB, respuestas IA citadas con fuentes a nivel de página, export DATEV, control de conflictos.",
  }),
  pl: applyReplacements(JSON.parse(JSON.stringify(_enProducts)), {
    "The law firm's brain.": "Mózg kancelarii.",
    "AI legal software for AT · DE · CH": "Oprogramowanie prawne AI dla PL · DE · CH",
    "Subsumio — AI Legal Software for Law Firms in AT · DE · CH":
      "Subsumio — Oprogramowanie Prawne AI dla Kancelarii w PL · DE · CH",
    "AI legal software for law firms in AT, DE & CH: matters, deadlines per ZPO/BGB/ABGB, cited AI answers with page-level sources, DATEV export, conflict check.":
      "Oprogramowanie prawne AI dla kancelarii w PL, DE & CH: sprawy, terminy według ZPO/BGB/ABGB, odpowiedzi AI z cytatami i źródłami na poziomie strony, eksport DATEV, kontrola konfliktów.",
  }),
  fr: applyReplacements(JSON.parse(JSON.stringify(_enProducts)), {
    "The law firm's brain.": "Le cerveau du cabinet.",
    "AI legal software for AT · DE · CH": "Logiciel juridique IA pour FR · DE · CH",
    "Subsumio — AI Legal Software for Law Firms in AT · DE · CH":
      "Subsumio — Logiciel Juridique IA pour Cabinets en FR · DE · CH",
    "AI legal software for law firms in AT, DE & CH: matters, deadlines per ZPO/BGB/ABGB, cited AI answers with page-level sources, DATEV export, conflict check.":
      "Logiciel juridique IA pour cabinets en FR, DE & CH: dossiers, délais selon ZPO/BGB/ABGB, réponses IA citées avec sources au niveau de la page, export DATEV, contrôle des conflits.",
  }),
  nl: applyReplacements(JSON.parse(JSON.stringify(_enProducts)), {
    "The law firm's brain.": "Het brein van het advocatenkantoor.",
    "AI legal software for AT · DE · CH": "AI juridische software voor NL · DE · CH",
    "Subsumio — AI Legal Software for Law Firms in AT · DE · CH":
      "Subsumio — AI Juridische Software voor Advocatenkantoren in NL · DE · CH",
    "AI legal software for law firms in AT, DE & CH: matters, deadlines per ZPO/BGB/ABGB, cited AI answers with page-level sources, DATEV export, conflict check.":
      "AI juridische software voor advocatenkantoren in NL, DE & CH: zaken, termijnen volgens ZPO/BGB/ABGB, geciteerde AI-antwoorden met paginaniveau-bronvermelding, DATEV-export, conflictencontrole.",
  }),
};
