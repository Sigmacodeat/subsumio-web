import { describe, expect, test } from "vitest";

import { CamtParseError, parseCamt053 } from "./camt053";

const CAMT = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <Stmt>
      <Id>STMT-2026-01</Id>
      <Acct>
        <Id><IBAN>AT611904300234573201</IBAN></Id>
        <Ccy>EUR</Ccy>
      </Acct>
      <Ntry>
        <NtryRef>REF-001</NtryRef>
        <Amt Ccy="EUR">1250.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><Dt>2026-01-15</Dt></BookgDt>
        <NtryDtls><TxDtls>
          <RltdPties>
            <Dbtr><Nm>Muster GmbH</Nm></Dbtr>
            <DbtrAcct><Id><IBAN>AT483200000012345864</IBAN></Id></DbtrAcct>
          </RltdPties>
          <RmtInf><Ustrd>RE-2026-0042 Honorarnote</Ustrd></RmtInf>
        </TxDtls></NtryDtls>
      </Ntry>
      <Ntry>
        <Amt Ccy="EUR">89.50</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <BookgDt><Dt>2026-01-16</Dt></BookgDt>
        <NtryDtls><TxDtls>
          <RltdPties><Cdtr><Nm>Energie AG</Nm></Cdtr></RltdPties>
          <RmtInf><Ustrd>Stromrechnung Jänner</Ustrd></RmtInf>
        </TxDtls></NtryDtls>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`;

describe("parseCamt053", () => {
  test("parst Gutschrift und Belastung mit Gegenpartei", () => {
    const s = parseCamt053(CAMT);
    expect(s.iban).toBe("AT611904300234573201");
    expect(s.currency).toBe("EUR");
    expect(s.transactions).toHaveLength(2);

    const credit = s.transactions[0];
    expect(credit.direction).toBe("credit");
    expect(credit.amount).toBe(1250);
    expect(credit.date).toBe("2026-01-15");
    expect(credit.sender_name).toBe("Muster GmbH");
    expect(credit.sender_iban).toBe("AT483200000012345864");
    expect(credit.purpose).toContain("RE-2026-0042");
    expect(credit.id).toMatch(/^txn-[0-9a-f]{16}$/);
    // Deterministic: the same statement parsed again yields the same ids.
    expect(parseCamt053(CAMT).transactions.map((t) => t.id)).toEqual(
      s.transactions.map((t) => t.id)
    );

    const debit = s.transactions[1];
    expect(debit.direction).toBe("debit");
    expect(debit.sender_name).toBe("Energie AG");
  });

  test("wirft bei ungültigem XML / fehlenden Buchungen", () => {
    expect(() => parseCamt053("<Document/>")).toThrow(CamtParseError);
    expect(() => parseCamt053("<html><body/></html>")).toThrow(CamtParseError);
  });
});

describe("parseCamt053 — Buchungs-IDs (GELD-16)", () => {
  const entry = (extra: string, amount = "100.00") => `
      <Ntry>${extra}
        <Amt Ccy="EUR">${amount}</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><Dt>2026-02-01</Dt></BookgDt>
        <NtryDtls><TxDtls><RmtInf><Ustrd>Zahlung</Ustrd></RmtInf></TxDtls></NtryDtls>
      </Ntry>`;
  const doc = (entries: string) => `<?xml version="1.0"?>
<Document><BkToCstmrStmt><Stmt><Acct><Id><IBAN>AT611904300234573201</IBAN></Id></Acct>${entries}</Stmt></BkToCstmrStmt></Document>`;

  test("zwei identische Buchungen ohne Bankreferenz bleiben zwei", () => {
    const ids = parseCamt053(doc(entry("") + entry(""))).transactions.map((t) => t.id);
    expect(new Set(ids).size).toBe(2);
  });

  test("gleiche NtryRef in verschiedenen Auszügen ist keine Dublette", () => {
    const a = parseCamt053(doc(entry("<NtryRef>1</NtryRef>", "100.00"))).transactions[0].id;
    const b = parseCamt053(doc(entry("<NtryRef>1</NtryRef>", "250.00"))).transactions[0].id;
    expect(a).not.toBe(b);
  });

  test("AcctSvcrRef bestimmt die ID", () => {
    const a = parseCamt053(doc(entry("<AcctSvcrRef>BANK-77</AcctSvcrRef>"))).transactions[0].id;
    const b = parseCamt053(doc(entry("<AcctSvcrRef>BANK-77</AcctSvcrRef>"))).transactions[0].id;
    expect(a).toBe(b);
  });
});
