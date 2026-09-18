/**
 * Runs a client (and its beneficial owners) against the stored sanctions list
 * and turns the candidates into the fields a KYC record carries under § 8c RAO:
 * checked yes/no, which list and which version, and whether a hit needs review.
 */

import type { KYCBeneficialOwner, KYCVerification } from "@/lib/kyc";
import { matchName, type NameMatch } from "./match";
import { loadSanctionsList, type StoredList } from "./store";

export interface SanctionsCheckResult {
  checkedAt: string;
  /** Human-readable provenance, stored as sanctions_source on the record. */
  source: string;
  listGeneratedAt: string;
  entryCount: number;
  /** Names that were run, in the order they were checked. */
  checkedNames: string[];
  hits: Array<{ name: string; matches: NameMatch[] }>;
}

export function describeSource(list: StoredList): string {
  const generated = list.generatedAt.slice(0, 10);
  const label =
    list.source === "eu-fsf" ? "EU-Finanzsanktionsliste (FSF)" : `Sanktionsliste ${list.source}`;
  return `${label}, Stand ${generated}, ${list.entryCount} Listungen`;
}

/** Every name of a record that has to be checked: the client and its owners. */
export function namesToCheck(
  v: Pick<KYCVerification, "client_name" | "beneficial_owners">
): string[] {
  const owners = (v.beneficial_owners ?? []) as KYCBeneficialOwner[];
  return [v.client_name, ...owners.map((o) => o.name)]
    .map((n) => (n ?? "").trim())
    .filter((n, i, all) => n.length > 1 && all.indexOf(n) === i);
}

export interface CheckOptions {
  /** Date of birth of the client, narrows person hits. */
  birthDate?: string;
  now?: Date;
}

/**
 * Null when no list has been downloaded yet — the caller must then say so
 * instead of reporting "no hit", which would be a false all-clear.
 */
export async function runSanctionsCheck(
  v: Pick<KYCVerification, "client_name" | "beneficial_owners">,
  opts: CheckOptions = {},
  load: () => Promise<StoredList | null> = loadSanctionsList
): Promise<SanctionsCheckResult | null> {
  const list = await load();
  if (!list) return null;
  const names = namesToCheck(v);
  const hits: SanctionsCheckResult["hits"] = [];
  for (const name of names) {
    const matches = matchName(name, list.entries, {
      birthDate: name === v.client_name ? opts.birthDate : undefined,
    });
    if (matches.length > 0) hits.push({ name, matches });
  }
  return {
    checkedAt: (opts.now ?? new Date()).toISOString(),
    source: describeSource(list),
    listGeneratedAt: list.generatedAt,
    entryCount: list.entryCount,
    checkedNames: names,
    hits,
  };
}

/** The KYC fields that a completed check writes. */
export function applyCheckResult(result: SanctionsCheckResult): Pick<
  KYCVerification,
  "sanctions_checked" | "sanctions_source" | "sanctions_hit"
> & {
  sanctions_matches: SanctionsCheckResult["hits"];
  sanctions_checked_at: string;
} {
  return {
    sanctions_checked: true,
    sanctions_source: `${result.source}, geprüft ${result.checkedAt.slice(0, 10)}`,
    sanctions_hit: result.hits.length > 0,
    sanctions_matches: result.hits,
    sanctions_checked_at: result.checkedAt,
  };
}
