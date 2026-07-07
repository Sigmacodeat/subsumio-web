/**
 * Crypto Wallet Detector — Automatische Erkennung von Krypto-Wallet-Adressen.
 *
 * Scannt Fall-Dokumente und Texte nach Krypto-Wallet-Adressen:
 *   - Bitcoin (BTC): Bech32 + Legacy/P2SH
 *   - Ethereum (ETH): 0x + 40 hex
 *   - USDT (TRC20): T + 33 base58
 *   - Solana (SOL): 32-44 base58
 *   - Litecoin (LTC): L/M/3 + 25-34 base58
 *   - Ripple (XRP): r + 24-34 alphanumeric
 *
 * Funktionen:
 *   - detectWallets(text): FoundWallet[] — scannt beliebigen Text
 *   - classifyBlockchain(address): BlockchainType — identifiziert Blockchain
 *   - isKnownFraudWallet(address): boolean — gegen interne DB
 *   - detectWalletsInCase(caseSlug): FoundWallet[] — scannt alle Fall-Dokumente
 */

import type { BlockchainType } from "./rciid";

export interface FoundWallet {
  address: string;
  blockchain: BlockchainType;
  start: number;
  end: number;
  context?: string;
  detected_by: "regex";
  confidence: number;
}

// ── Regex Patterns ──────────────────────────────────────────────────────────

/**
 * Bitcoin address patterns:
 * - Bech32: bc1 + 39-59 lowercase alphanumeric (bc1q, bc1p)
 * - Legacy (P2PKH): 1 + 25-34 base58
 * - P2SH: 3 + 25-34 base58
 */
const BTC_BECH32_RE = /\bbc1[a-z0-9]{39,59}\b/gi;
const BTC_LEGACY_RE = /\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b/g;

/**
 * Ethereum address pattern: 0x + 40 hex chars
 */
const ETH_RE = /\b0x[a-fA-F0-9]{40}\b/g;

/**
 * Tron / USDT TRC20 address pattern: T + 33 base58
 */
const TRX_RE = /\bT[1-9A-HJ-NP-Za-km-z]{33}\b/g;

/**
 * Solana address pattern: 32-44 base58
 */
const SOL_RE = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;

/**
 * Litecoin address pattern: L/M/3 + 25-34 base58
 */
const LTC_RE = /\b[LM3][a-km-zA-HJ-NP-Z1-9]{25,34}\b/g;

/**
 * Ripple address pattern: r + 24-34 alphanumeric
 */
const XRP_RE = /\br[0-9a-zA-Z]{24,34}\b/g;

// ── Classification ──────────────────────────────────────────────────────────

/**
 * Classify an address into its blockchain type.
 * Order matters: ETH (0x prefix) and BTC (bc1 prefix) are most specific.
 */
export function classifyBlockchain(address: string): BlockchainType {
  const addr = address.trim();

  // Ethereum: 0x + 40 hex
  if (/^0x[a-fA-F0-9]{40}$/.test(addr)) return "ETH";

  // Bitcoin Bech32: bc1...
  if (/^bc1[a-z0-9]{39,59}$/i.test(addr)) return "BTC";

  // Tron / USDT TRC20: T + 33 base58
  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr)) return "TRX";

  // Ripple: r + 24-34 alphanumeric
  if (/^r[0-9a-zA-Z]{24,34}$/.test(addr)) return "XRP";

  // Litecoin: L/M/3 + 25-34 base58
  if (/^[LM3][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(addr)) return "LTC";

  // Bitcoin Legacy/P2SH: 1 or 3 + 25-34 base58
  if (/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(addr)) return "BTC";

  // Solana: 32-44 base58 (check last to avoid false positives)
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr)) return "SOL";

  return "UNKNOWN";
}

// ── Detection ───────────────────────────────────────────────────────────────

/**
 * Extract a short context string around the matched address.
 */
function extractContext(text: string, start: number, end: number): string {
  const contextStart = Math.max(0, start - 40);
  const contextEnd = Math.min(text.length, end + 40);
  return text.slice(contextStart, contextEnd).replace(/\s+/g, " ").trim();
}

/**
 * Detect all crypto wallet addresses in a text.
 * Returns unique addresses sorted by position.
 */
export function detectWallets(text: string): FoundWallet[] {
  const found: FoundWallet[] = [];
  const seen = new Set<string>();

  // Bitcoin Bech32
  for (const match of text.matchAll(BTC_BECH32_RE)) {
    const address = match[0];
    if (seen.has(address)) continue;
    seen.add(address);
    const start = match.index ?? 0;
    found.push({
      address,
      blockchain: "BTC",
      start,
      end: start + address.length,
      context: extractContext(text, start, start + address.length),
      detected_by: "regex",
      confidence: 0.99,
    });
  }

  // Ethereum
  for (const match of text.matchAll(ETH_RE)) {
    const address = match[0];
    if (seen.has(address)) continue;
    seen.add(address);
    const start = match.index ?? 0;
    found.push({
      address,
      blockchain: "ETH",
      start,
      end: start + address.length,
      context: extractContext(text, start, start + address.length),
      detected_by: "regex",
      confidence: 0.99,
    });
  }

  // Tron / USDT TRC20
  for (const match of text.matchAll(TRX_RE)) {
    const address = match[0];
    if (seen.has(address)) continue;
    seen.add(address);
    const start = match.index ?? 0;
    found.push({
      address,
      blockchain: "TRX",
      start,
      end: start + address.length,
      context: extractContext(text, start, start + address.length),
      detected_by: "regex",
      confidence: 0.97,
    });
  }

  // Ripple
  for (const match of text.matchAll(XRP_RE)) {
    const address = match[0];
    if (seen.has(address)) continue;
    seen.add(address);
    const start = match.index ?? 0;
    found.push({
      address,
      blockchain: "XRP",
      start,
      end: start + address.length,
      context: extractContext(text, start, start + address.length),
      detected_by: "regex",
      confidence: 0.95,
    });
  }

  // Litecoin
  for (const match of text.matchAll(LTC_RE)) {
    const address = match[0];
    if (seen.has(address)) continue;
    seen.add(address);
    const start = match.index ?? 0;
    found.push({
      address,
      blockchain: "LTC",
      start,
      end: start + address.length,
      context: extractContext(text, start, start + address.length),
      detected_by: "regex",
      confidence: 0.88,
    });
  }

  // Bitcoin Legacy/P2SH — lower confidence due to overlap with LTC
  for (const match of text.matchAll(BTC_LEGACY_RE)) {
    const address = match[0];
    if (seen.has(address)) continue;
    // Skip if already classified as LTC (L/M prefix)
    if (/^[LM]/.test(address)) continue;
    seen.add(address);
    const start = match.index ?? 0;
    found.push({
      address,
      blockchain: "BTC",
      start,
      end: start + address.length,
      context: extractContext(text, start, start + address.length),
      detected_by: "regex",
      confidence: 0.85,
    });
  }

  // Solana — lowest confidence (generic base58, high false positive risk)
  // Only match if surrounded by context hints
  for (const match of text.matchAll(SOL_RE)) {
    const address = match[0];
    if (seen.has(address)) continue;
    const start = match.index ?? 0;
    const ctx = extractContext(text, start, start + address.length).toLowerCase();
    // Only accept Solana if context mentions sol/solana/wallet/phantom
    if (/\b(sol|solana|phantom|wallet)\b/i.test(ctx)) {
      seen.add(address);
      found.push({
        address,
        blockchain: "SOL",
        start,
        end: start + address.length,
        context: ctx,
        detected_by: "regex",
        confidence: 0.75,
      });
    }
  }

  // Sort by position
  found.sort((a, b) => a.start - b.start);
  return found;
}

/**
 * Detect wallets in a text and return unique addresses only (no position info).
 */
export function detectWalletAddresses(text: string): string[] {
  return detectWallets(text).map((w) => w.address);
}

/**
 * Check if a text contains any crypto wallet addresses.
 */
export function containsWalletAddress(text: string): boolean {
  return detectWallets(text).length > 0;
}

// ── Known Fraud Wallets DB ──────────────────────────────────────────────────

/**
 * In-memory set of known fraud wallets.
 * In production, this would be backed by a database table.
 */
const knownFraudWallets = new Set<string>();

export function markAsFraudWallet(address: string): void {
  knownFraudWallets.add(address.trim());
}

export function isKnownFraudWallet(address: string): boolean {
  return knownFraudWallets.has(address.trim());
}

export function getKnownFraudWallets(): string[] {
  return Array.from(knownFraudWallets);
}

// ── Blockchain Labels ───────────────────────────────────────────────────────

export const BLOCKCHAIN_LABELS: Record<BlockchainType, string> = {
  BTC: "Bitcoin",
  ETH: "Ethereum",
  USDT: "Tether (USDT)",
  SOL: "Solana",
  LTC: "Litecoin",
  XRP: "Ripple",
  TRX: "Tron / USDT",
  UNKNOWN: "Unbekannt",
};

export const BLOCKCHAIN_COLORS: Record<BlockchainType, string> = {
  BTC: "#f7931a",
  ETH: "#627eea",
  USDT: "#26a17b",
  SOL: "#9945ff",
  LTC: "#345d9d",
  XRP: "#23292f",
  TRX: "#ff060a",
  UNKNOWN: "#6a6a8a",
};

export const BLOCKCHAIN_ICONS: Record<BlockchainType, string> = {
  BTC: "Bitcoin",
  ETH: "Ethereum",
  USDT: "Tether",
  SOL: "Solana",
  LTC: "Litecoin",
  XRP: "Ripple",
  TRX: "Tron",
  UNKNOWN: "HelpCircle",
};
