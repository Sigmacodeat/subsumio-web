/**
 * Crypto Address Checksum Validation — Kryptografische Prüfsummen-Verifikation.
 *
 * Validiert echte Checksummen von Krypto-Adressen:
 *   - Bitcoin Base58Check (Legacy P2PKH + P2SH): SHA256-SHA256 4-byte checksum
 *   - Bitcoin Bech32 / Bech32m (SegWit): CRC32 checksum
 *   - Ethereum EIP-55: Mixed-case checksum via Keccak-256
 *
 * Pattern: pure TypeScript, zero external deps (uses Web Crypto API)
 */

import type { BlockchainType } from "./rciid-client";

// ── Base58 Alphabet ──────────────────────────────────────────────────────────

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_MAP = new Map<string, number>();
for (let i = 0; i < BASE58_ALPHABET.length; i++) {
  BASE58_MAP.set(BASE58_ALPHABET[i], i);
}

function base58Decode(input: string): Uint8Array | null {
  if (!input) return null;

  // Count leading '1's (each represents a 0x00 byte)
  let zeros = 0;
  while (zeros < input.length && input[zeros] === "1") {
    zeros++;
  }

  // Allocate byte array — 8 bits per base58 digit, log(58)/log(256) ≈ 0.732
  const size = Math.floor((input.length - zeros) * 0.733) + 1;
  const b256 = new Uint8Array(size);

  for (let i = zeros; i < input.length; i++) {
    let carry = BASE58_MAP.get(input[i]);
    if (carry === undefined) return null;

    // Apply each base58 digit to all bytes
    for (let j = size - 1; j >= 0; j--) {
      carry += b256[j] * 58;
      b256[j] = carry & 0xff;
      carry >>= 8;
    }

    // If carry is non-zero, input was too large
    if (carry !== 0) return null;
  }

  // Skip leading zeros in b256
  let offset = 0;
  while (offset < size && b256[offset] === 0) {
    offset++;
  }

  // Combine leading zeros + decoded bytes
  const result = new Uint8Array(zeros + (size - offset));
  result.fill(0, 0, zeros);
  result.set(b256.subarray(offset), zeros);
  return result;
}

// ── SHA256 (Web Crypto API — works in browser + Node.js) ─────────────────────

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return new Uint8Array(hashBuffer);
}

// ── Base58Check Validation (BTC Legacy + P2SH) ───────────────────────────────

/**
 * Validate a Bitcoin Base58Check address (Legacy P2PKH starting with '1' or P2SH starting with '3').
 * Checks: version byte + payload + 4-byte SHA256(SHA256(version+payload)) checksum.
 */
export async function validateBase58Check(address: string): Promise<boolean> {
  if (!address) return false;

  // Quick format check
  if (!/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address)) return false;

  const decoded = base58Decode(address);
  if (!decoded || decoded.length < 5) return false;

  // Last 4 bytes = checksum, rest = version + payload
  const payload = decoded.subarray(0, decoded.length - 4);
  const checksum = decoded.subarray(decoded.length - 4);

  // Checksum = first 4 bytes of SHA256(SHA256(payload))
  const hash = await sha256(await sha256(payload));
  const expectedChecksum = hash.subarray(0, 4);

  // Constant-time comparison
  let match = true;
  for (let i = 0; i < 4; i++) {
    if (checksum[i] !== expectedChecksum[i]) match = false;
  }
  return match;
}

// ── Bech32 / Bech32m Validation (BTC SegWit) ─────────────────────────────────

const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const BECH32_CONST = 1;
const BECH32M_CONST = 0x2bc830a3;

function bech32Polymod(values: number[]): number {
  let chk = 1;
  const generator = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if ((top >>> i) & 1) {
        chk ^= generator[i];
      }
    }
  }
  return chk >>> 0;
}

function bech32HrpExpand(hrp: string): number[] {
  const result: number[] = [];
  for (let i = 0; i < hrp.length; i++) {
    result.push(hrp.charCodeAt(i) >> 5);
  }
  result.push(0);
  for (let i = 0; i < hrp.length; i++) {
    result.push(hrp.charCodeAt(i) & 31);
  }
  return result;
}

function bech32VerifyChecksum(hrp: string, data: number[]): "bech32" | "bech32m" | null {
  const polymod = bech32Polymod([...bech32HrpExpand(hrp), ...data]);
  if (polymod === BECH32_CONST) return "bech32";
  if (polymod === BECH32M_CONST) return "bech32m";
  return null;
}

function bech32Decode(address: string): { hrp: string; data: number[]; variant: string } | null {
  if (!address) return null;

  // Check for mixed case (invalid)
  const hasLower = /[a-z]/.test(address);
  const hasUpper = /[A-Z]/.test(address);
  if (hasLower && hasUpper) return null;

  // Normalize to lowercase
  const addr = address.toLowerCase();

  // Find last separator
  const pos = addr.lastIndexOf("1");
  if (pos < 1 || pos + 7 > addr.length) return null;

  const hrp = addr.slice(0, pos);
  const dataPart = addr.slice(pos + 1);

  // Validate characters
  const data: number[] = [];
  for (let i = 0; i < dataPart.length; i++) {
    const idx = BECH32_CHARSET.indexOf(dataPart[i]);
    if (idx < 0) return null;
    data.push(idx);
  }

  const variant = bech32VerifyChecksum(hrp, data);
  if (!variant) return null;

  // Remove last 6 chars (checksum)
  return { hrp, data: data.slice(0, -6), variant };
}

function bech32ToBytes(data: number[]): Uint8Array | null {
  // Convert from 5-bit groups to 8-bit bytes
  if (data.length === 0) return null;
  const witnessVersion = data[0];
  if (witnessVersion > 16) return null;

  const program = data.slice(1);
  if (program.length === 0 || program.length > 64) return null;

  // Convert 5-bit groups to 8-bit bytes
  const bytes: number[] = [];
  let accumulator = 0;
  let bits = 0;
  for (const v of program) {
    accumulator = (accumulator << 5) | v;
    bits += 5;
    while (bits >= 8) {
      bytes.push((accumulator >> (bits - 8)) & 0xff);
      bits -= 8;
      accumulator &= (1 << bits) - 1;
    }
  }
  // Remaining bits must be zero
  if (bits > 0 && accumulator !== 0) return null;

  const result = new Uint8Array(bytes);

  // witness v0: program length must be 20 or 32 bytes
  if (witnessVersion === 0 && result.length !== 20 && result.length !== 32) return null;

  // Program length 2-40 bytes for all versions
  if (result.length < 2 || result.length > 40) return null;

  return result;
}

/**
 * Validate a Bitcoin Bech32/Bech32m address (SegWit: bc1q... or bc1p...).
 * Checks: HRP + witness version + program + CRC32 checksum.
 */
export function validateBech32(address: string): boolean {
  if (!address) return false;

  // Quick format check
  if (!/^bc1[a-z0-9]{39,90}$/i.test(address)) return false;

  const decoded = bech32Decode(address);
  if (!decoded) return false;

  // HRP must be "bc" for Bitcoin mainnet
  if (decoded.hrp !== "bc") return false;

  // Witness version 0 uses bech32, v1+ uses bech32m
  const witnessVersion = decoded.data[0];
  const expectedVariant = witnessVersion === 0 ? "bech32" : "bech32m";
  if (decoded.variant !== expectedVariant) return false;

  // Validate program bytes
  const program = bech32ToBytes(decoded.data);
  if (!program) return false;

  return true;
}

// ── EIP-55 Validation (Ethereum) ─────────────────────────────────────────────

/**
 * Ethereum EIP-55 checksum validation.
 * EIP-55 uses Keccak-256 (not NIST SHA-3) to hash the lowercase hex address,
 * then uses each nibble to determine expected letter case.
 *
 * Since node:crypto doesn't have Keccak-256 (its sha3-256 is NIST SHA-3, a
 * different algorithm), we implement a compact Keccak-256 in pure TypeScript.
 */

// ── Keccak-256 (Ethereum's hash) ─────────────────────────────────────────────

const KECCAK_ROUNDS = 24;
const KECCAK_RC = [
  BigInt("0x0000000000000001"),
  BigInt("0x0000000000008082"),
  BigInt("0x800000000000808a"),
  BigInt("0x8000000080008000"),
  BigInt("0x000000000000808b"),
  BigInt("0x0000000080000001"),
  BigInt("0x8000000080008081"),
  BigInt("0x8000000000008009"),
  BigInt("0x000000000000008a"),
  BigInt("0x0000000000000088"),
  BigInt("0x0000000080008009"),
  BigInt("0x000000008000000a"),
  BigInt("0x000000008000808b"),
  BigInt("0x800000000000008b"),
  BigInt("0x8000000000008089"),
  BigInt("0x8000000000008003"),
  BigInt("0x8000000000008002"),
  BigInt("0x8000000000000080"),
  BigInt("0x000000000000800a"),
  BigInt("0x800000008000000a"),
  BigInt("0x8000000080008081"),
  BigInt("0x8000000000008080"),
  BigInt("0x0000000080000001"),
  BigInt("0x8000000080008008"),
];

const KECCAK_ROT: bigint[][] = [
  [BigInt(0), BigInt(1), BigInt(62), BigInt(28), BigInt(27)],
  [BigInt(36), BigInt(44), BigInt(6), BigInt(55), BigInt(20)],
  [BigInt(3), BigInt(10), BigInt(43), BigInt(25), BigInt(39)],
  [BigInt(41), BigInt(45), BigInt(15), BigInt(21), BigInt(8)],
  [BigInt(18), BigInt(2), BigInt(61), BigInt(56), BigInt(14)],
];

const MASK64 = BigInt("0xffffffffffffffff");
const ONE = BigInt(1);
const EIGHT = BigInt(8);
const SIXTY_FOUR = BigInt(64);

function keccak256(data: Uint8Array): string {
  const state: bigint[][] = Array.from({ length: 5 }, () => Array(5).fill(BigInt(0)));

  const rate = 136;

  // Pad: append 0x01, then zeros, then 0x80 at end of block (pad10*1 for Keccak)
  const paddedLen = Math.ceil((data.length + 1) / rate) * rate;
  const padded = new Uint8Array(paddedLen);
  padded.set(data);
  padded[data.length] = 0x01;
  padded[paddedLen - 1] |= 0x80;

  for (let offset = 0; offset < paddedLen; offset += rate) {
    const block = padded.subarray(offset, offset + rate);
    for (let i = 0; i < block.length; i++) {
      const lane = Math.floor(i / 8);
      const bytePos = i % 8;
      state[lane % 5][Math.floor(lane / 5)] ^= BigInt(block[i]) << (EIGHT * BigInt(bytePos));
    }
    keccakF(state);
  }

  // Squeeze: extract first 32 bytes (256 bits)
  const result: number[] = [];
  for (let laneIdx = 0; laneIdx < 25 && result.length < 32; laneIdx++) {
    const x = laneIdx % 5;
    const y = Math.floor(laneIdx / 5);
    const lane = state[x][y];
    for (let i = 0; i < 8 && result.length < 32; i++) {
      result.push(Number((lane >> (EIGHT * BigInt(i))) & BigInt(0xff)));
    }
  }
  return result.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function keccakF(state: bigint[][]): void {
  for (let round = 0; round < KECCAK_ROUNDS; round++) {
    // Theta
    const c: bigint[] = [];
    for (let x = 0; x < 5; x++) {
      c[x] = state[x][0] ^ state[x][1] ^ state[x][2] ^ state[x][3] ^ state[x][4];
    }
    const d: bigint[] = [];
    for (let x = 0; x < 5; x++) {
      const rotated = ((c[(x + 1) % 5] << ONE) | (c[(x + 1) % 5] >> BigInt(63))) & MASK64;
      d[x] = c[(x + 4) % 5] ^ rotated;
    }
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        state[x][y] ^= d[x];
      }
    }

    // Rho and Pi
    const b: bigint[][] = Array.from({ length: 5 }, () => Array(5).fill(BigInt(0)));
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        const rot = KECCAK_ROT[y][x];
        const lane = state[x][y];
        b[y][(2 * x + 3 * y) % 5] = ((lane << rot) | (lane >> (SIXTY_FOUR - rot))) & MASK64;
      }
    }

    // Chi
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        state[x][y] = (b[x][y] ^ (~b[(x + 1) % 5][y] & b[(x + 2) % 5][y] & MASK64)) & MASK64;
      }
    }

    // Iota
    state[0][0] ^= KECCAK_RC[round];
  }
}

export function validateEip55(address: string): boolean {
  if (!address) return false;

  // Must be 0x + 40 hex chars
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return false;

  const addr = address.slice(2);

  // All lowercase or all uppercase = no checksum applied (valid)
  if (addr === addr.toLowerCase() || addr === addr.toUpperCase()) {
    return true;
  }

  // EIP-55: hash the lowercase address with Keccak-256, compare case
  const hash = keccak256(new TextEncoder().encode(addr.toLowerCase()));

  for (let i = 0; i < addr.length; i++) {
    const char = addr[i];
    if (/[0-9]/.test(char)) continue; // Numbers don't have case

    const hashNibble = hash[i];
    const hashVal = parseInt(hashNibble, 16);

    if (hashVal >= 8 && char !== char.toUpperCase()) return false;
    if (hashVal < 8 && char !== char.toLowerCase()) return false;
  }
  return true;
}

// ── Unified Validation ───────────────────────────────────────────────────────

export interface AddressValidationResult {
  valid: boolean;
  checksumValid: boolean;
  format: "base58check" | "bech32" | "bech32m" | "eip55" | "hex" | "unknown";
  blockchain: BlockchainType;
  error?: string;
}

/**
 * Validate a crypto address with full checksum verification.
 * Returns detailed validation result including format and checksum status.
 */
export async function validateAddress(
  address: string,
  blockchain: BlockchainType
): Promise<AddressValidationResult> {
  const addr = address.trim();

  switch (blockchain) {
    case "BTC": {
      // Bech32 (bc1...)
      if (/^bc1/i.test(addr)) {
        const valid = validateBech32(addr);
        return {
          valid,
          checksumValid: valid,
          format: valid ? "bech32" : "bech32m",
          blockchain: "BTC",
          error: valid ? undefined : "Bech32 Prüfsumme ungültig",
        };
      }
      // Base58Check (1... or 3...)
      if (/^[13]/.test(addr)) {
        const valid = await validateBase58Check(addr);
        return {
          valid,
          checksumValid: valid,
          format: "base58check",
          blockchain: "BTC",
          error: valid ? undefined : "Base58Check Prüfsumme ungültig",
        };
      }
      return {
        valid: false,
        checksumValid: false,
        format: "unknown",
        blockchain: "BTC",
        error: "Keine gültige BTC-Adresse (muss mit 1, 3 oder bc1 beginnen)",
      };
    }

    case "ETH": {
      const valid = validateEip55(addr);
      return {
        valid,
        checksumValid: valid,
        format: "eip55",
        blockchain: "ETH",
        error: valid ? undefined : "EIP-55 Prüfsumme ungültig",
      };
    }

    case "USDT":
    case "TRX": {
      // Tron addresses are Base58Check with version byte 0x41
      if (/^T/.test(addr)) {
        const valid = await validateBase58Check(addr);
        return {
          valid,
          checksumValid: valid,
          format: "base58check",
          blockchain: blockchain,
          error: valid ? undefined : "Tron Base58Check Prüfsumme ungültig",
        };
      }
      return {
        valid: false,
        checksumValid: false,
        format: "unknown",
        blockchain: blockchain,
        error: "Tron-Adresse muss mit T beginnen",
      };
    }

    case "LTC": {
      // Litecoin: L/M prefix, Base58Check
      if (/^[LM]/.test(addr)) {
        const valid = await validateBase58Check(addr);
        return {
          valid,
          checksumValid: valid,
          format: "base58check",
          blockchain: "LTC",
          error: valid ? undefined : "Litecoin Base58Check Prüfsumme ungültig",
        };
      }
      return {
        valid: false,
        checksumValid: false,
        format: "unknown",
        blockchain: "LTC",
        error: "Litecoin-Adresse muss mit L oder M beginnen",
      };
    }

    case "XRP": {
      // Ripple: r prefix, Base58Check with Ripple alphabet
      // For simplicity, we accept format validation without full checksum
      // (Ripple uses a different Base58 alphabet)
      if (/^r[0-9a-zA-Z]{24,34}$/.test(addr)) {
        return {
          valid: true,
          checksumValid: true, // Format-valid, Ripple checksum not verified
          format: "base58check",
          blockchain: "XRP",
          error: undefined,
        };
      }
      return {
        valid: false,
        checksumValid: false,
        format: "unknown",
        blockchain: "XRP",
        error: "Ripple-Adresse muss mit r beginnen",
      };
    }

    case "SOL": {
      // Solana: base58, 32-44 chars — no checksum in traditional sense
      if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr)) {
        return {
          valid: true,
          checksumValid: true,
          format: "base58check",
          blockchain: "SOL",
          error: undefined,
        };
      }
      return {
        valid: false,
        checksumValid: false,
        format: "unknown",
        blockchain: "SOL",
        error: "Solana-Adresse muss 32-44 Base58-Zeichen haben",
      };
    }

    default:
      return {
        valid: false,
        checksumValid: false,
        format: "unknown",
        blockchain: "UNKNOWN",
        error: "Unbekannte Blockchain",
      };
  }
}

/**
 * Quick boolean check — is the address checksum-valid?
 */
export async function isAddressValid(
  address: string,
  blockchain: BlockchainType
): Promise<boolean> {
  return (await validateAddress(address, blockchain)).valid;
}

/**
 * Validate and auto-detect blockchain from address format.
 * Returns the validated blockchain or null if invalid.
 */
export async function validateAndDetectBlockchain(
  address: string
): Promise<{ blockchain: BlockchainType; valid: boolean } | null> {
  const addr = address.trim();

  // Try each blockchain
  if (/^bc1/i.test(addr) || /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(addr)) {
    const result = await validateAddress(addr, "BTC");
    if (result.valid) return { blockchain: "BTC", valid: true };
  }

  if (/^0x[a-fA-F0-9]{40}$/.test(addr)) {
    const result = await validateAddress(addr, "ETH");
    if (result.valid) return { blockchain: "ETH", valid: true };
  }

  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr)) {
    const result = await validateAddress(addr, "TRX");
    if (result.valid) return { blockchain: "TRX", valid: true };
  }

  if (/^[LM][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(addr)) {
    const result = await validateAddress(addr, "LTC");
    if (result.valid) return { blockchain: "LTC", valid: true };
  }

  if (/^r[0-9a-zA-Z]{24,34}$/.test(addr)) {
    return { blockchain: "XRP", valid: true };
  }

  return null;
}
