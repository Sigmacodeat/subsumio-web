/**
 * Per-call AI spend ledger.
 *
 * Every chat, stream, embed and rerank call through the gateway appends one
 * JSONL line — model, tokens, estimated USD, call site — to
 * `<audit dir>/ai-spend-YYYY-Www.jsonl`. The budget tracker only runs inside
 * explicit budget scopes (dream cycles); this ledger runs always, so "where did
 * the provider credit go" is answered from our own records instead of the
 * provider dashboard. Summarize with `bun run scripts/ai-spend.ts`.
 *
 * Best effort: a failed write never affects the call. Prices come from the
 * canonical tables (model-pricing.ts, embedding-pricing.ts); an unpriced model
 * is logged with `usd: null` so it shows up as a gap, not as zero.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { isoWeekFilename, resolveAuditDir } from "../audit-week-file.ts";
import { lookupEmbeddingPrice } from "../embedding-pricing.ts";
import { canonicalLookup } from "../model-pricing.ts";

export type AiSpendKind = "chat" | "embed" | "rerank";

export interface AiSpendEntry {
  kind: AiSpendKind;
  model: string;
  inputTokens: number;
  outputTokens: number;
  label: string;
  failed?: boolean;
}

export function estimateSpendUsd(entry: AiSpendEntry): number | null {
  if (entry.kind === "embed") {
    const price = lookupEmbeddingPrice(entry.model);
    return price.kind === "known" ? (entry.inputTokens / 1_000_000) * price.pricePerMTok : null;
  }
  const price = canonicalLookup(entry.model);
  if (!price) return null;
  return (entry.inputTokens * price.input + entry.outputTokens * price.output) / 1_000_000;
}

function ledgerEnabled(): boolean {
  if (process.env.GBRAIN_AI_SPEND_LOG === "0") return false;
  // Unit tests would otherwise write into the developer's audit dir.
  if (process.env.NODE_ENV === "test" && process.env.GBRAIN_AI_SPEND_LOG !== "1") return false;
  return true;
}

export function recordAiSpend(entry: AiSpendEntry, now: Date = new Date()): void {
  if (!ledgerEnabled()) return;
  try {
    const dir = resolveAuditDir();
    mkdirSync(dir, { recursive: true });
    const usd = estimateSpendUsd(entry);
    const line = {
      schema_version: 1,
      ts: now.toISOString(),
      kind: entry.kind,
      model: entry.model,
      input_tokens: entry.inputTokens,
      output_tokens: entry.outputTokens,
      usd: usd === null ? null : Math.round(usd * 1_000_000) / 1_000_000,
      label: entry.label,
      ...(entry.failed ? { failed: true } : {}),
    };
    appendFileSync(join(dir, isoWeekFilename("ai-spend", now)), JSON.stringify(line) + "\n");
  } catch {
    // Ledger failures must never block or fail the AI call.
  }
}
