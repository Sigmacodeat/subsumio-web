/**
 * Crypto Auto-Detection — Automatische Wallet-Extraktion aus Fall-Akten.
 *
 * Scannt alle Dokumente eines Falls nach Krypto-Wallet-Adressen und
 * schlägt forensische Analyse vor.
 *
 * Funktionen:
 *   - scanCaseForWallets(caseSlug, headers): ScanResult — scannt alle Fall-Dokumente
 *   - shouldSuggestForensics(scanResult): boolean — Heuristik für Vorschlag
 *   - extractWalletsFromText(text): FoundWallet[] — mit Checksum-Validierung
 */

import { ENGINE_URL } from "@/lib/engine";
import { detectAndValidateWallets, type FoundWallet } from "@/lib/crypto-wallet-detector";
import type { BlockchainType } from "@/lib/rciid-client";

// ── Types ────────────────────────────────────────────────────────────────────

export interface CaseScanSuggestion {
  address: string;
  blockchain: BlockchainType;
  documentSlug: string;
  documentTitle: string;
  context: string;
  checksumValid: boolean;
  confidence: number;
}

export interface CaseScanResult {
  wallets: FoundWallet[];
  documentsScanned: number;
  suggestions: CaseScanSuggestion[];
  totalAddressesFound: number;
  validAddressesFound: number;
}

interface CaseDocument {
  slug: string;
  name: string;
  url?: string;
  kind?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function encodeSlug(slug: string): string {
  return slug.split("/").map(encodeURIComponent).join("/");
}

async function fetchCasePage(
  headers: Record<string, string>,
  caseSlug: string
): Promise<{ frontmatter?: Record<string, unknown>; body?: string; title?: string }> {
  const res = await fetch(`${ENGINE_URL}/api/pages/${encodeSlug(caseSlug)}`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`case_fetch_failed_${res.status}`);
  return (await res.json()) as {
    frontmatter?: Record<string, unknown>;
    body?: string;
    title?: string;
  };
}

async function fetchDocumentContent(
  headers: Record<string, string>,
  docSlug: string
): Promise<string> {
  const res = await fetch(`${ENGINE_URL}/api/pages/${encodeSlug(docSlug)}`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return "";
  const page = (await res.json()) as { body?: string; frontmatter?: Record<string, unknown> };
  // Combine body + frontmatter values for scanning
  const fmText = page.frontmatter
    ? Object.entries(page.frontmatter)
        .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
        .join("\n")
    : "";
  return `${page.body ?? ""}\n${fmText}`;
}

// ── Main Functions ───────────────────────────────────────────────────────────

/**
 * Scan all documents of a case for crypto wallet addresses.
 * Returns found wallets, suggestions, and scan statistics.
 */
export async function scanCaseForWallets(
  caseSlug: string,
  headers: Record<string, string>
): Promise<CaseScanResult> {
  // 1. Fetch case page to get document list
  const casePage = await fetchCasePage(headers, caseSlug);
  const documents = Array.isArray(casePage.frontmatter?.documents)
    ? (casePage.frontmatter!.documents as CaseDocument[])
    : [];

  // 2. Also scan the case page body itself
  const caseBody = casePage.body ?? "";
  const caseTitle = casePage.title ?? caseSlug;

  const allWallets: FoundWallet[] = [];
  const suggestions: CaseScanSuggestion[] = [];
  let documentsScanned = 0;

  // Scan case body
  if (caseBody.length > 0) {
    const found = detectAndValidateWallets(caseBody);
    if (found.length > 0) {
      allWallets.push(...found);
      for (const w of found) {
        suggestions.push({
          address: w.address,
          blockchain: w.blockchain,
          documentSlug: caseSlug,
          documentTitle: caseTitle,
          context: w.context ?? "",
          checksumValid: w.checksumValid ?? false,
          confidence: w.confidence,
        });
      }
    }
    documentsScanned++;
  }

  // 3. Scan each document
  for (const doc of documents) {
    try {
      const content = await fetchDocumentContent(headers, doc.slug);
      if (!content || content.length === 0) continue;

      const found = detectAndValidateWallets(content);
      if (found.length > 0) {
        allWallets.push(...found);
        for (const w of found) {
          suggestions.push({
            address: w.address,
            blockchain: w.blockchain,
            documentSlug: doc.slug,
            documentTitle: doc.name ?? doc.slug,
            context: w.context ?? "",
            checksumValid: w.checksumValid ?? false,
            confidence: w.confidence,
          });
        }
      }
      documentsScanned++;
    } catch {
      // Skip documents that can't be fetched
      continue;
    }
  }

  // 4. Deduplicate wallets by address
  const seen = new Set<string>();
  const uniqueWallets = allWallets.filter((w) => {
    if (seen.has(w.address)) return false;
    seen.add(w.address);
    return true;
  });

  const uniqueSuggestions = suggestions.filter((s) => {
    const key = `${s.address}:${s.documentSlug}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const validAddressesFound = uniqueWallets.filter((w) => w.checksumValid).length;

  return {
    wallets: uniqueWallets,
    documentsScanned,
    suggestions: uniqueSuggestions,
    totalAddressesFound: uniqueWallets.length,
    validAddressesFound,
  };
}

/**
 * Heuristic: Should we suggest forensic analysis for this scan result?
 * Returns true if at least 1 valid wallet address was found.
 */
export function shouldSuggestForensics(result: CaseScanResult): boolean {
  return result.validAddressesFound >= 1;
}

/**
 * Extract wallets from a text with checksum validation.
 * Convenience wrapper around detectAndValidateWallets.
 */
export function extractWalletsFromText(text: string): FoundWallet[] {
  return detectAndValidateWallets(text);
}

/**
 * Generate a human-readable summary of scan results for notifications.
 */
export function formatScanSummary(result: CaseScanResult): string {
  if (result.totalAddressesFound === 0) {
    return `Keine Krypto-Adressen in ${result.documentsScanned} Dokument(en) gefunden.`;
  }

  const valid = result.validAddressesFound;
  const total = result.totalAddressesFound;

  if (valid === 0) {
    return `${total} Adresse(n) gefunden, aber keine mit gültiger Prüfsumme. Bitte Adressen manuell prüfen.`;
  }

  return `${valid} gültige Krypto-Adresse(n) in ${result.documentsScanned} Dokument(en) gefunden. Forensische Analyse empfohlen.`;
}
