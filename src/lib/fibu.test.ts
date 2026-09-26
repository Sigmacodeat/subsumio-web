import { describe, test, expect } from "vitest";
import {
  createBankTransaction,
  autoMatchTransaction,
  applyMatch,
  createOpenItem,
  processDunningRun,
  applyDunningRun,
  dunningFeeDelta,
  getDunningLabel,
  getOverdueItems,
  getOposSummary,
  isPastDue,
  type BankTransaction,
  type OpenItem,
} from "./fibu";

function txn(overrides: Partial<BankTransaction> = {}): BankTransaction {
  return {
    id: "txn-1",
    date: "2024-06-01",
    amount: 1000,
    direction: "credit",
    iban: "AT611904300234573201",
    status: "unmatched",
    imported_at: "2024-06-01T00:00:00Z",
    ...overrides,
  };
}

function item(overrides: Partial<OpenItem> = {}): OpenItem {
  return {
    id: "opos-1",
    invoice_id: "inv-1",
    invoice_number: "RE-2024-001",
    client_name: "Muster GmbH",
    amount: 1000,
    paid_amount: 0,
    open_amount: 1000,
    due_date: "2024-06-15",
    dunning_level: 0,
    dunning_fee: 0,
    status: "open",
    created_at: "2024-05-01T00:00:00Z",
    updated_at: "2024-05-01T00:00:00Z",
    ...overrides,
  };
}

describe("createBankTransaction", () => {
  test("erzeugt unmatched Transaktion mit ID und Timestamp", () => {
    const t = createBankTransaction({
      date: "2024-06-01",
      amount: 500,
      direction: "credit",
      iban: "AT611904300234573201",
      reference: "RE-2024-001",
    });
    expect(t.id).toMatch(/^txn-/);
    expect(t.status).toBe("unmatched");
    expect(t.imported_at).toBeTruthy();
    expect(t.amount).toBe(500);
  });
});

describe("autoMatchTransaction", () => {
  test("debit-Transaktionen werden nie gematcht", () => {
    const t = txn({ direction: "debit", reference: "RE-2024-001" });
    expect(autoMatchTransaction(t, [item()])).toBeNull();
  });

  test("leere OPOS-Liste → null", () => {
    expect(autoMatchTransaction(txn(), [])).toBeNull();
  });

  test("Stufe 1: Rechnungsnummer im Verwendungszweck → high", () => {
    const t = txn({ purpose: "Zahlung RE-2024-001 Danke" });
    const m = autoMatchTransaction(t, [item()]);
    expect(m?.confidence).toBe("high");
    expect(m?.invoice_id).toBe("inv-1");
  });

  test("Stufe 1: case-insensitive und ueber reference/sender_name", () => {
    const t = txn({ sender_name: "zahlung re-2024-001" });
    expect(autoMatchTransaction(t, [item()])?.confidence).toBe("high");
  });

  test("Stufe 1: Rechnungsnummer <4 Zeichen wird ignoriert", () => {
    // Rechnung „42" wuerde sonst jede Ueberweisung mit „42" im Text matchen.
    const short = item({ invoice_number: "42" });
    const t = txn({ purpose: "Ueberweisung 42 Betrag", amount: 9999 });
    const m = autoMatchTransaction(t, [short]);
    expect(m?.invoice_id).not.toBe("inv-1");
  });

  test("Stufe 1: laengste passende Rechnungsnummer gewinnt", () => {
    // RE-2024-01 ist Praefix von RE-2024-012 — der laengere Match ist der
    // echte (RE-2024-01 wuerde sonst die Zahlung fuer -012 kapern).
    const a = item({ id: "o1", invoice_id: "inv-a", invoice_number: "RE-2024-01" });
    const b = item({ id: "o2", invoice_id: "inv-b", invoice_number: "RE-2024-012" });
    const t = txn({ purpose: "RE-2024-012" });
    const m = autoMatchTransaction(t, [a, b]);
    expect(m?.invoice_id).toBe("inv-b");
  });

  test("Stufe 2: Aktenzeichen + exakter Betrag → high", () => {
    const i = item({ case_slug: "2024-ka-001", invoice_number: "XX-NOMATCH" });
    const t = txn({ purpose: "AZ 2024-KA-001", amount: 1000 });
    const m = autoMatchTransaction(t, [i]);
    expect(m?.confidence).toBe("high");
    expect(m?.case_slug).toBe("2024-ka-001");
  });

  test("Stufe 2: Aktenzeichen ohne Betragsmatch faellt durch", () => {
    const i = item({ case_slug: "2024-ka-001", invoice_number: "XX-NOMATCH" });
    const t = txn({ purpose: "AZ 2024-KA-001", amount: 999 });
    const m = autoMatchTransaction(t, [i]);
    // Kein high-Match; 999 vs 1000 = 0,1% Diff → faellt in Stufe 4 (low)
    expect(m?.confidence).toBe("low");
  });

  test("Stufe 3: exakter Betrag allein → medium", () => {
    const i = item({ invoice_number: "XX-NOMATCH", open_amount: 1000 });
    const t = txn({ purpose: "irgendwas", amount: 1000 });
    expect(autoMatchTransaction(t, [i])?.confidence).toBe("medium");
  });

  test("Stufe 4: Betrag innerhalb 5% → low", () => {
    const i = item({ invoice_number: "XX-NOMATCH", open_amount: 1000 });
    const t = txn({ amount: 970, purpose: "teil" }); // 3% Diff
    expect(autoMatchTransaction(t, [i])?.confidence).toBe("low");
  });

  test("Stufe 4: >5% Abweichung → null", () => {
    const i = item({ invoice_number: "XX-NOMATCH", open_amount: 1000 });
    const t = txn({ amount: 900, purpose: "irgendwas" }); // 10% Diff
    expect(autoMatchTransaction(t, [i])).toBeNull();
  });

  test("bezahlte und abgeschriebene Items werden nicht gematcht", () => {
    const paid = item({ status: "paid" });
    const off = item({ id: "o2", status: "written_off" });
    const t = txn({ purpose: "RE-2024-001", amount: 1000 });
    expect(autoMatchTransaction(t, [paid, off])).toBeNull();
  });

  test("gar kein Match → null", () => {
    const i = item({ invoice_number: "RE-9999-999", open_amount: 42 });
    const t = txn({ purpose: "Spende Verein", amount: 500 });
    expect(autoMatchTransaction(t, [i])).toBeNull();
  });
});

describe("applyMatch", () => {
  test("volle Zahlung → Item paid, open_amount 0", () => {
    const t = txn({ amount: 1000, reference: "RE-2024-001" });
    const m = autoMatchTransaction(t, [item()])!;
    const { transaction, openItems, surplus } = applyMatch(t, m, [item()]);
    expect(transaction.status).toBe("matched");
    expect(transaction.match_confidence).toBe("high");
    expect(openItems[0]!.status).toBe("paid");
    expect(openItems[0]!.open_amount).toBe(0);
    expect(surplus).toBe(0);
  });

  test("Teilzahlung → open_amount reduziert, Status bleibt", () => {
    const i = item({ open_amount: 1000 });
    const t = txn({ amount: 400 });
    const m = {
      transaction: t,
      invoice_id: i.invoice_id,
      confidence: "low" as const,
      matchReason: "test",
    };
    const { openItems, surplus } = applyMatch(t, m, [i]);
    expect(openItems[0]!.paid_amount).toBe(400);
    expect(openItems[0]!.open_amount).toBe(600);
    expect(openItems[0]!.status).toBe("open");
    expect(surplus).toBe(0);
  });

  test("Ueberzahlung → surplus wird ausgewiesen statt verschluckt", () => {
    const i = item({ amount: 1000, open_amount: 1000 });
    const t = txn({ amount: 1200 });
    const m = {
      transaction: t,
      invoice_id: i.invoice_id,
      confidence: "medium" as const,
      matchReason: "test",
    };
    const { openItems, surplus } = applyMatch(t, m, [i]);
    // 200€ zu viel — darf nicht still in Math.max(0,…) verschwinden,
    // der Mandant hat Geld zurueckzubekommen.
    expect(surplus).toBe(200);
    expect(openItems[0]!.open_amount).toBe(0);
    expect(openItems[0]!.paid_amount).toBe(1000);
    expect(openItems[0]!.status).toBe("paid");
  });

  test("Mahngebuhr wird in totalDue einbezogen", () => {
    const i = item({ amount: 1000, open_amount: 1015, dunning_fee: 15 });
    const t = txn({ amount: 1015 });
    const m = {
      transaction: t,
      invoice_id: i.invoice_id,
      confidence: "medium" as const,
      matchReason: "test",
    };
    const { openItems, surplus } = applyMatch(t, m, [i]);
    expect(openItems[0]!.status).toBe("paid");
    expect(surplus).toBe(0);
  });
});

describe("createOpenItem", () => {
  test("initialisiert offenen Posten", () => {
    const o = createOpenItem({
      invoice_id: "inv-1",
      invoice_number: "RE-1",
      client_name: "Muster",
      amount: 500,
      due_date: "2024-07-01",
    });
    expect(o.status).toBe("open");
    expect(o.open_amount).toBe(500);
    expect(o.paid_amount).toBe(0);
    expect(o.dunning_level).toBe(0);
  });
});

describe("processDunningRun", () => {
  const at = (iso: string) => new Date(iso);

  test(">7 Tage ueberfaellig → Mahnstufe 1 + 5€", () => {
    const i = item({ due_date: "2024-06-01" });
    const res = processDunningRun([i], at("2024-06-10T12:00:00Z"));
    expect(res).toHaveLength(1);
    expect(res[0]!.new_level).toBe(1);
    expect(res[0]!.fee_added).toBe(5);
    expect(res[0]!.new_status).toBe("reminded");
  });

  test("genau 7 Tage → noch keine Mahnung (Schwelle ist >7)", () => {
    const i = item({ due_date: "2024-06-01" });
    const res = processDunningRun([i], at("2024-06-08T12:00:00Z"));
    expect(res).toHaveLength(0);
  });

  test(">21 Tage → Stufe 2 + 10€, >42 Tage → Stufe 3 + 15€ + overdue", () => {
    const a = item({ id: "a", due_date: "2024-06-01" });
    const b = item({ id: "b", due_date: "2024-06-01" });
    const res21 = processDunningRun([a], at("2024-06-25T12:00:00Z"));
    expect(res21[0]!.new_level).toBe(2);
    expect(res21[0]!.fee_added).toBe(10);
    const res42 = processDunningRun([b], at("2024-07-20T12:00:00Z"));
    expect(res42[0]!.new_level).toBe(3);
    expect(res42[0]!.fee_added).toBe(15);
    expect(res42[0]!.new_status).toBe("overdue");
  });

  test("Eskalation zahlt nur die Differenz (Stufe 1→2 = +5€)", () => {
    // Item steht schon auf Stufe 1 mit 5€ gezahlter Gebuehr — ein
    // zweiter Lauf darf nicht nochmal 10€ aufschlagen, nur die Differenz.
    const i = item({ due_date: "2024-06-01", dunning_level: 1, dunning_fee: 5 });
    const res = processDunningRun([i], at("2024-06-25T12:00:00Z"));
    expect(res[0]!.new_level).toBe(2);
    expect(res[0]!.fee_added).toBe(5); // 10 - 5 bereits verrechnet
  });

  test("kein Rueckschritt: Stufe 3 bleibt auch bei spaeterem Lauf Stufe 3", () => {
    const i = item({ due_date: "2024-06-01", dunning_level: 3, dunning_fee: 15 });
    const res = processDunningRun([i], at("2024-08-01T12:00:00Z"));
    expect(res).toHaveLength(0); // keine neue Mahnstufe → kein Eintrag
  });

  test("bezahlte/abgeschriebene Items werden uebersprungen", () => {
    const i = item({ due_date: "2024-01-01", status: "paid" });
    expect(processDunningRun([i], at("2024-06-01T12:00:00Z"))).toHaveLength(0);
  });

  test("dunningFeeDelta: 5€ je Stufe, gedeckelt bei Stufe 3", () => {
    // Einheitliche Mahnformel mit /api/invoices/remind: das Delta der
    // Kumulativ-Tabelle [0,5,10,15] — also 5€ je Mahnstufe.
    expect(dunningFeeDelta(0)).toBe(0);
    expect(dunningFeeDelta(1)).toBe(5);
    expect(dunningFeeDelta(2)).toBe(5);
    expect(dunningFeeDelta(3)).toBe(5);
    // Ab der 4. Mahnung keine weitere Pauschale (Inkasso/gerichtlicher Weg).
    expect(dunningFeeDelta(4)).toBe(0);
    expect(dunningFeeDelta(99)).toBe(0);
  });

  test("email_sent Flag folgt client_email", () => {
    const mit = item({ due_date: "2024-06-01", client_email: "a@b.at" });
    const ohne = item({ id: "o2", due_date: "2024-06-01" });
    const res = processDunningRun([mit, ohne], at("2024-06-10T12:00:00Z"));
    expect(res.find((r) => r.item_id === "opos-1")?.email_sent).toBe(true);
    expect(res.find((r) => r.item_id === "o2")?.email_sent).toBe(false);
  });
});

describe("applyDunningRun", () => {
  test("uebernimmt Stufe, Gebuehr und Status; Gebuehr erhoeht open_amount", () => {
    // due_date 9 Tage zurueck → Stufe 1 (Schwelle >7).
    const i = item({ open_amount: 1000, due_date: "2024-06-01" });
    const results = processDunningRun([i], new Date("2024-06-10T12:00:00Z"));
    const updated = applyDunningRun([i], results);
    expect(updated[0]!.dunning_level).toBe(1);
    expect(updated[0]!.dunning_fee).toBe(5);
    // Der Mandant schuldet jetzt 1005€ — die Mahngebuehr ist Teil der
    // offenen Forderung.
    expect(updated[0]!.open_amount).toBe(1005);
    expect(updated[0]!.status).toBe("reminded");
    expect(updated[0]!.dunning_date).toBeTruthy();
  });

  test("Items ohne Ergebnis bleiben unberuehrt", () => {
    const a = item({ id: "a" });
    const b = item({ id: "b" });
    const updated = applyDunningRun(
      [a, b],
      [
        {
          item_id: "a",
          invoice_number: "RE-1",
          client_name: "x",
          old_level: 0,
          new_level: 1,
          fee_added: 5,
          new_status: "reminded",
          email_sent: false,
        },
      ]
    );
    expect(updated[0]!.dunning_level).toBe(1);
    expect(updated[1]!.dunning_level).toBe(0);
  });
});

describe("getOverdueItems / getOposSummary", () => {
  test("getOverdueItems filtert paid/written_off und nicht-faellige", () => {
    const overdue = item({ due_date: "2020-01-01" });
    const future = item({ id: "f", due_date: "2999-01-01" });
    const paid = item({ id: "p", due_date: "2020-01-01", status: "paid" });
    const res = getOverdueItems([overdue, future, paid]);
    expect(res.map((i) => i.id)).toEqual(["opos-1"]);
  });

  test("getOposSummary zaehlt korrekt und rundet Floats", () => {
    const items = [
      item({ id: "a", open_amount: 100.1, status: "open", due_date: "2999-01-01" }),
      item({ id: "b", open_amount: 50.2, status: "overdue", due_date: "2020-01-01" }),
      item({ id: "c", open_amount: 0, status: "paid" }),
      item({ id: "d", open_amount: 25, status: "reminded", due_date: "2999-01-01" }),
    ];
    const s = getOposSummary(items);
    expect(s.total).toBe(4);
    expect(s.open).toBe(1);
    expect(s.overdue).toBe(1);
    expect(s.reminded).toBe(1);
    expect(s.paid).toBe(1);
    expect(s.totalOpenAmount).toBeCloseTo(175.3, 2);
    expect(s.totalOverdueAmount).toBeCloseTo(50.2, 2);
  });

  test("getDunningLabel gibt deutsche Stufen", () => {
    expect(getDunningLabel(0)).toBe("");
    expect(getDunningLabel(2)).toBe("Mahnung 2");
    expect(getDunningLabel(99)).toBe("");
  });
});

describe("Mahnstufen ohne negative Gebühr / Fälligkeit in Wiener Zeit (GELD-11, UIS-4-3)", () => {
  const base = createOpenItem({
    invoice_id: "legal/invoices/x",
    invoice_number: "R-2026-0001",
    client_name: "M",
    amount: 100,
    due_date: "2026-01-01",
  });

  test("zwei manuelle Mahnungen (Spesen 10, Stufe 0) → Mahnlauf addiert nie eine negative Gebühr", () => {
    const item = { ...base, dunning_fee: 10, dunning_level: 0 as const };
    const [r] = processDunningRun([item], new Date("2026-01-10T12:00:00Z"));
    expect(r.new_level).toBe(1);
    expect(r.fee_added).toBe(0);
  });

  test("am Fälligkeitstag ist ein Posten noch nicht überfällig", () => {
    const item = { ...base, due_date: "2026-09-25" };
    expect(isPastDue(item.due_date, new Date("2026-09-25T21:30:00Z"))).toBe(false);
    // 00:30 Wiener Zeit am Folgetag (22:30 UTC) → überfällig
    expect(isPastDue(item.due_date, new Date("2026-09-25T22:30:00Z"))).toBe(true);
    expect(getOverdueItems([item], new Date("2026-09-25T10:00:00Z"))).toHaveLength(0);
  });

  test("ausgebuchte Posten zählen nicht zur offenen Summe", () => {
    const s = getOposSummary([
      { ...base, open_amount: 100 },
      { ...base, id: "w", status: "written_off", open_amount: 500 },
    ]);
    expect(s.totalOpenAmount).toBe(100);
  });
});
