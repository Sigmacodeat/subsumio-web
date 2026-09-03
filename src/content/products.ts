// Product-line landing pages. This codebase serves two products:
//   - Subsumio (legal) — AI legal software for law firms in AT · DE · CH
//   - Taxumio  (tax)    — AI tax software for tax advisors & accounting in AT · DE · CH
// Both share the same platform core but present distinct marketing surfaces.

import { type Lang, deepMerge, applyReplacements } from "./site";
import type { VerticalSlug } from "./verticals";
import type { ProductBrand } from "@/components/marketing/vertical";

export interface ProductContent extends ProductBrand {
  slug: string;
  vertical: VerticalSlug;
  metaTitle: string;
  metaDesc: string;
}

export const PRODUCT_SLUGS = ["subsumio", "taxumio"] as const;
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
  taxumio: {
    slug: "taxumio",
    vertical: "tax",
    industry: "tax",
    name: "Taxumio",
    claim: "Das Mandanten-Brain.",
    poweredBy: "KI-Steuerberatungssoftware für AT · DE · CH",
    metaTitle: "Taxumio — KI-Steuerberatungssoftware für Steuerberater | AT · DE · CH",
    metaDesc:
      "KI-Steuerberatungssoftware für Steuerberatung & Buchhaltung in AT, DE & CH: Steuererklärungen, Bescheide, AO-Fristen, StBVV-Gebührenrechner, GoBD-konform. DSGVO-konform.",
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
  taxumio: {
    slug: "taxumio",
    vertical: "tax",
    industry: "tax",
    name: "Taxumio",
    claim: "The tax advisor's brain.",
    poweredBy: "AI tax software for AT · DE · CH",
    metaTitle: "Taxumio — AI Tax Software for Tax Advisors in AT · DE · CH",
    metaDesc:
      "AI tax software for tax advisors & accounting in AT, DE & CH: tax returns, assessments, AO deadlines, StBVV fee calculator, GoBD-compliant. GDPR-compliant.",
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
    taxumio: {
      metaTitle:
        "Taxumio — KI-Steuerberatungssoftware für Steuerberater in Österreich | AT · DE · CH",
      metaDesc:
        "KI-Steuerberatungssoftware für Steuerberatung in Österreich: Steuererklärungen, Bescheide, AO-Fristen, StBVV-Gebührenrechner, GoBD-konform. DSGVO-konform.",
    },
  }),
  ch: deepMerge(_deProducts, {
    subsumio: {
      metaTitle: "Subsumio — KI-Kanzleisoftware für Rechtsanwälte in der Schweiz | AT · DE · CH",
      metaDesc:
        "KI-Kanzleisoftware für Kanzleien in der Schweiz: Akten, Fristen nach ZPO/ZGB, belegte KI-Antworten mit Fundstellen, Kollisionsprüfung (BGFA). DSGVO-konform.",
    },
    taxumio: {
      metaTitle:
        "Taxumio — KI-Steuerberatungssoftware für Steuerberater in der Schweiz | AT · DE · CH",
      metaDesc:
        "KI-Steuerberatungssoftware für Steuerberatung in der Schweiz: Steuererklärungen, Bescheide, AO-Fristen, StBVV-Gebührenrechner, GoBD-konform. DSGVO-konform.",
    },
  }),
  it: applyReplacements(JSON.parse(JSON.stringify(_enProducts)), {
    "The law firm's brain.": "Il cervello dello studio legale.",
    "AI legal software for AT · DE · CH": "Software legale AI per IT · DE · CH",
    "Subsumio — AI Legal Software for Law Firms in AT · DE · CH":
      "Subsumio — Software Legale AI per Studi Legali in IT · DE · CH",
    "AI legal software for law firms in AT, DE & CH: matters, deadlines per ZPO/BGB/ABGB, cited AI answers with page-level sources, DATEV export, conflict check.":
      "Software legale AI per studi legali in IT, DE & CH: pratiche, scadenze per ZPO/BGB/ABGB, risposte AI citate con fonti a livello di pagina, export DATEV, controllo conflitti.",
    "The tax advisor's brain.": "Il cervello del consulente fiscale.",
    "AI tax software for AT · DE · CH": "Software fiscale AI per IT · DE · CH",
    "Taxumio — AI Tax Software for Tax Advisors in AT · DE · CH":
      "Taxumio — Software Fiscale AI per Consulenti Fiscali in IT · DE · CH",
    "AI tax software for tax advisors & accounting in AT, DE & CH: tax returns, assessments, AO deadlines, StBVV fee calculator, GoBD-compliant. GDPR-compliant.":
      "Software fiscale AI per consulenti fiscali e contabilità in IT, DE & CH: dichiarazioni fiscali, avvisi, scadenze AO, calcolatore parcelle StBVV, conforme GoBD. Conforme GDPR.",
  }),
  es: applyReplacements(JSON.parse(JSON.stringify(_enProducts)), {
    "The law firm's brain.": "El cerebro del bufete.",
    "AI legal software for AT · DE · CH": "Software legal IA para ES · DE · CH",
    "Subsumio — AI Legal Software for Law Firms in AT · DE · CH":
      "Subsumio — Software Legal IA para Bufetes en ES · DE · CH",
    "AI legal software for law firms in AT, DE & CH: matters, deadlines per ZPO/BGB/ABGB, cited AI answers with page-level sources, DATEV export, conflict check.":
      "Software legal IA para bufetes en ES, DE & CH: asuntos, plazos según ZPO/BGB/ABGB, respuestas IA citadas con fuentes a nivel de página, export DATEV, control de conflictos.",
    "The tax advisor's brain.": "El cerebro del asesor fiscal.",
    "AI tax software for AT · DE · CH": "Software fiscal IA para ES · DE · CH",
    "Taxumio — AI Tax Software for Tax Advisors in AT · DE · CH":
      "Taxumio — Software Fiscal IA para Asesores Fiscales en ES · DE · CH",
    "AI tax software for tax advisors & accounting in AT, DE & CH: tax returns, assessments, AO deadlines, StBVV fee calculator, GoBD-compliant. GDPR-compliant.":
      "Software fiscal IA para asesores fiscales y contabilidad en ES, DE & CH: declaraciones fiscales, liquidaciones, plazos AO, calculador de honorarios StBVV, conforme GoBD. Conforme GDPR.",
  }),
  pl: applyReplacements(JSON.parse(JSON.stringify(_enProducts)), {
    "The law firm's brain.": "Mózg kancelarii.",
    "AI legal software for AT · DE · CH": "Oprogramowanie prawne AI dla PL · DE · CH",
    "Subsumio — AI Legal Software for Law Firms in AT · DE · CH":
      "Subsumio — Oprogramowanie Prawne AI dla Kancelarii w PL · DE · CH",
    "AI legal software for law firms in AT, DE & CH: matters, deadlines per ZPO/BGB/ABGB, cited AI answers with page-level sources, DATEV export, conflict check.":
      "Oprogramowanie prawne AI dla kancelarii w PL, DE & CH: sprawy, terminy według ZPO/BGB/ABGB, odpowiedzi AI z cytatami i źródłami na poziomie strony, eksport DATEV, kontrola konfliktów.",
    "The tax advisor's brain.": "Mózg doradcy podatkowego.",
    "AI tax software for AT · DE · CH": "Oprogramowanie podatkowe AI dla PL · DE · CH",
    "Taxumio — AI Tax Software for Tax Advisors in AT · DE · CH":
      "Taxumio — Oprogramowanie Podatkowe AI dla Doradców Podatkowych w PL · DE · CH",
    "AI tax software for tax advisors & accounting in AT, DE & CH: tax returns, assessments, AO deadlines, StBVV fee calculator, GoBD-compliant. GDPR-compliant.":
      "Oprogramowanie podatkowe AI dla doradców podatkowych i księgowości w PL, DE & CH: deklaracje podatkowe, decyzje, terminy AO, kalkulator opłat StBVV, zgodne z GoBD. Zgodne z GDPR.",
  }),
  fr: applyReplacements(JSON.parse(JSON.stringify(_enProducts)), {
    "The law firm's brain.": "Le cerveau du cabinet.",
    "AI legal software for AT · DE · CH": "Logiciel juridique IA pour FR · DE · CH",
    "Subsumio — AI Legal Software for Law Firms in AT · DE · CH":
      "Subsumio — Logiciel Juridique IA pour Cabinets en FR · DE · CH",
    "AI legal software for law firms in AT, DE & CH: matters, deadlines per ZPO/BGB/ABGB, cited AI answers with page-level sources, DATEV export, conflict check.":
      "Logiciel juridique IA pour cabinets en FR, DE & CH: dossiers, délais selon ZPO/BGB/ABGB, réponses IA citées avec sources au niveau de la page, export DATEV, contrôle des conflits.",
    "The tax advisor's brain.": "Le cerveau du conseiller fiscal.",
    "AI tax software for AT · DE · CH": "Logiciel fiscal IA pour FR · DE · CH",
    "Taxumio — AI Tax Software for Tax Advisors in AT · DE · CH":
      "Taxumio — Logiciel Fiscal IA pour Conseillers Fiscaux en FR · DE · CH",
    "AI tax software for tax advisors & accounting in AT, DE & CH: tax returns, assessments, AO deadlines, StBVV fee calculator, GoBD-compliant. GDPR-compliant.":
      "Logiciel fiscal IA pour conseillers fiscaux et comptabilité en FR, DE & CH: déclarations fiscales, avis, délais AO, calculateur d'honoraires StBVV, conforme GoBD. Conforme RGPD.",
  }),
  nl: applyReplacements(JSON.parse(JSON.stringify(_enProducts)), {
    "The law firm's brain.": "Het brein van het advocatenkantoor.",
    "AI legal software for AT · DE · CH": "AI juridische software voor NL · DE · CH",
    "Subsumio — AI Legal Software for Law Firms in AT · DE · CH":
      "Subsumio — AI Juridische Software voor Advocatenkantoren in NL · DE · CH",
    "AI legal software for law firms in AT, DE & CH: matters, deadlines per ZPO/BGB/ABGB, cited AI answers with page-level sources, DATEV export, conflict check.":
      "AI juridische software voor advocatenkantoren in NL, DE & CH: zaken, termijnen volgens ZPO/BGB/ABGB, geciteerde AI-antwoorden met paginaniveau-bronvermelding, DATEV-export, conflictencontrole.",
    "The tax advisor's brain.": "Het brein van de belastingadviseur.",
    "AI tax software for AT · DE · CH": "AI belastingsoftware voor NL · DE · CH",
    "Taxumio — AI Tax Software for Tax Advisors in AT · DE · CH":
      "Taxumio — AI Belastingsoftware voor Belastingadviseurs in NL · DE · CH",
    "AI tax software for tax advisors & accounting in AT, DE & CH: tax returns, assessments, AO deadlines, StBVV fee calculator, GoBD-compliant. GDPR-compliant.":
      "AI belastingsoftware voor belastingadviseurs en administratie in NL, DE & CH: belastingaangiften, aanslagen, AO-termijnen, StBVV-vergoedingcalculator, GoBD-conform. AVG-conform.",
  }),
};
