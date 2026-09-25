import { DOMParser } from "@xmldom/xmldom";
import type { Element } from "@xmldom/xmldom";

import {
  bankTransactionId,
  createBankTransaction,
  withOccurrence,
  type BankTransaction,
  type BankTransactionInput,
} from "@/lib/fibu";

/**
 * camt.053 (ISO 20022) Kontoauszug-Parser.
 * Unterstützt camt.053.001.02 und .001.08 — namensraum-agnostisch über
 * localName, weil Banken die Namespace-Deklaration unterschiedlich setzen.
 */

export class CamtParseError extends Error {}

export interface CamtStatement {
  iban: string;
  currency?: string;
  transactions: BankTransaction[];
}

function descendants(el: Element, local: string): Element[] {
  const out: Element[] = [];
  const walk = (node: Element) => {
    for (let i = 0; i < node.childNodes.length; i++) {
      const child = node.childNodes.item(i);
      if (child && child.nodeType === 1) {
        const c = child as Element;
        if (c.localName === local) out.push(c);
        walk(c);
      }
    }
  };
  walk(el);
  return out;
}

function firstText(el: Element, local: string): string | undefined {
  const found = descendants(el, local)[0];
  const text = found?.textContent?.trim();
  return text || undefined;
}

/** Buchungs-IDs deterministisch (bankTransactionId) — Grundlage der Dublettenerkennung. */
export function parseCamt053(xml: string): CamtStatement {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new CamtParseError("XML konnte nicht gelesen werden.");
  }
  const root = doc.documentElement;
  if (!root || root.localName !== "Document") {
    throw new CamtParseError("Kein gültiges camt.053-Dokument.");
  }

  const stmts = descendants(root, "Stmt");
  if (stmts.length === 0) {
    throw new CamtParseError("Kein Kontoauszug (Stmt) im Dokument gefunden.");
  }

  const iban = firstText(stmts[0], "IBAN") ?? "";
  const currency = firstText(stmts[0], "Ccy") ?? firstText(stmts[0], "AmtCcy");
  const transactions: BankTransaction[] = [];
  const inputs: Array<{ input: BankTransactionInput; bankRef?: string; displayRef?: string }> = [];

  for (const stmt of stmts) {
    for (const ntry of descendants(stmt, "Ntry")) {
      const amtText = firstText(ntry, "Amt");
      const cdtDbt = firstText(ntry, "CdtDbtInd");
      if (!amtText || !cdtDbt) continue;
      const amount = Number(amtText);
      if (!Number.isFinite(amount)) continue;

      const isCredit = cdtDbt.toUpperCase() === "CRDT";
      const bookingDate =
        firstText(descendants(ntry, "BookgDt")[0] ?? ntry, "Dt") ??
        firstText(ntry, "Dt") ??
        new Date().toISOString().slice(0, 10);

      // Gegenpartei: bei Gutschrift der Debitor (Zahler), bei Belastung der Kreditor.
      const partyTag = isCredit ? "Dbtr" : "Cdtr";
      const party = descendants(ntry, "RltdPties").flatMap((p) => descendants(p, partyTag))[0];
      const senderName = party ? firstText(party, "Nm") : undefined;
      const senderAcct = isCredit
        ? descendants(ntry, "DbtrAcct")[0]
        : descendants(ntry, "CdtrAcct")[0];
      const senderIban = senderAcct ? firstText(senderAcct, "IBAN") : undefined;

      const ref = firstText(ntry, "Ref");
      const ustrd = descendants(ntry, "Ustrd")
        .map((u) => u.textContent?.trim())
        .filter(Boolean)
        .join(" ");

      // AcctSvcrRef is the bank's unique reference of the booking. NtryRef
      // is only unique within one statement at many banks, so it is part of
      // the fingerprint, never the id on its own.
      const acctSvcrRef = firstText(ntry, "AcctSvcrRef");
      const ntryRef = firstText(ntry, "NtryRef");

      inputs.push({
        input: {
          date: bookingDate,
          amount,
          direction: isCredit ? "credit" : "debit",
          iban,
          sender_name: senderName,
          sender_iban: senderIban,
          reference: ref ?? (ntryRef ? `NtryRef:${ntryRef}` : undefined),
          purpose: ustrd || undefined,
        },
        bankRef: acctSvcrRef,
        displayRef: ref,
      });
    }
  }

  // Identical bookings without a bank reference keep apart by their running
  // number within the statement — stable when the same statement (or an
  // overlapping one) is imported again.
  const numbered = withOccurrence(inputs.map((i) => i.input));
  numbered.forEach(({ occurrence }, idx) => {
    const { input, bankRef, displayRef } = inputs[idx];
    const txn = createBankTransaction({ ...input, reference: displayRef }, {});
    txn.id = bankTransactionId(input, { bankRef, occurrence });
    transactions.push(txn);
  });

  if (transactions.length === 0) {
    throw new CamtParseError("Keine Buchungen (Ntry) im Kontoauszug gefunden.");
  }
  return { iban, currency, transactions };
}
