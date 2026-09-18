/**
 * ebInterface 6.1 XML generation
 * ==============================
 *
 * The Austrian XML invoice standard (AUSTRIAPRO / WKO), namespace
 * http://www.ebinterface.at/schema/6p1/. The federal e-invoicing portal
 * e-Rechnung.gv.at (Unternehmensserviceportal) accepts it for invoices to
 * the Bund, and Austrian accounting software imports it.
 *
 * Element order follows schemas/ebInterface6p1/Invoice.xsd in
 * github.com/austriapro/ebinterface-standards. The test validates the output
 * against that XSD when `EBINTERFACE_XSD` points to a local copy.
 *
 * Amounts: every line is rounded to cents, VAT is computed per rate on the
 * rounded line sums (one TaxItem per category and rate), so the tax summary
 * adds up exactly to TotalGrossAmount — the check e-Rechnung.gv.at applies.
 */

import type {
  EInvoiceAllowanceCharge,
  EInvoiceData,
  EInvoiceParty,
  EInvoiceTypeCode,
  EInvoiceXmlResult,
  TaxCategoryCode,
} from "./types";

export const EBINTERFACE_NAMESPACE = "http://www.ebinterface.at/schema/6p1/";

/** ebInterface uses this placeholder when a party has no VAT ID (e.g. consumers). */
export const EBINTERFACE_NO_VAT_ID = "00000000";

const DOCUMENT_TYPE: Record<EInvoiceTypeCode, string> = {
  "380": "Invoice",
  "381": "CreditMemo",
  "384": "Invoice",
  "386": "InvoiceForAdvancePayment",
  "326": "InvoiceForPartialDelivery",
};

const COUNTRY_NAME: Record<string, string> = {
  AT: "Österreich",
  DE: "Deutschland",
  CH: "Schweiz",
  IT: "Italien",
  LI: "Liechtenstein",
};

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cents(amount: number): number {
  return Math.round(amount * 100) / 100;
}

function amt(amount: number): string {
  return cents(amount).toFixed(2);
}

function isoDate(value: string): string {
  return value.slice(0, 10);
}

function vatId(party: EInvoiceParty): string {
  const id = party.vatId?.replace(/\s/g, "");
  return id ? id : EBINTERFACE_NO_VAT_ID;
}

function addressXml(party: EInvoiceParty, indent: string): string[] {
  const country = (party.country || "AT").toUpperCase();
  const out = [`${indent}<Address>`, `${indent}  <Name>${esc(party.name)}</Name>`];
  if (party.street) out.push(`${indent}  <Street>${esc(party.street)}</Street>`);
  out.push(`${indent}  <Town>${esc(party.city)}</Town>`);
  out.push(`${indent}  <ZIP>${esc(party.zip)}</ZIP>`);
  out.push(
    `${indent}  <Country CountryCode="${esc(country)}">${esc(COUNTRY_NAME[country] ?? country)}</Country>`
  );
  if (party.phone) out.push(`${indent}  <Phone>${esc(party.phone)}</Phone>`);
  if (party.email) out.push(`${indent}  <Email>${esc(party.email)}</Email>`);
  out.push(`${indent}</Address>`);
  return out;
}

function contactXml(party: EInvoiceParty, indent: string): string[] {
  if (!party.contactName) return [];
  const out = [`${indent}<Contact>`, `${indent}  <Name>${esc(party.contactName)}</Name>`];
  if (party.phone) out.push(`${indent}  <Phone>${esc(party.phone)}</Phone>`);
  if (party.email) out.push(`${indent}  <Email>${esc(party.email)}</Email>`);
  out.push(`${indent}</Contact>`);
  return out;
}

function taxItemXml(
  taxable: number,
  rate: number,
  category: TaxCategoryCode,
  indent: string,
  comment?: string
): string[] {
  return [
    `${indent}<TaxItem>`,
    `${indent}  <TaxableAmount>${amt(taxable)}</TaxableAmount>`,
    `${indent}  <TaxPercent TaxCategoryCode="${category}">${rate.toFixed(2)}</TaxPercent>`,
    `${indent}  <TaxAmount>${amt((cents(taxable) * rate) / 100)}</TaxAmount>`,
    ...(comment ? [`${indent}  <Comment>${esc(comment)}</Comment>`] : []),
    `${indent}</TaxItem>`,
  ];
}

interface TaxBucket {
  category: TaxCategoryCode;
  rate: number;
  taxable: number;
}

function addToBucket(
  buckets: Map<string, TaxBucket>,
  category: TaxCategoryCode,
  rate: number,
  amount: number
) {
  const key = `${category}:${rate}`;
  const bucket = buckets.get(key) ?? { category, rate, taxable: 0 };
  bucket.taxable = cents(bucket.taxable + amount);
  buckets.set(key, bucket);
}

function reductionOrSurchargeXml(ac: EInvoiceAllowanceCharge, base: number): string[] {
  const tag = ac.isCharge ? "Surcharge" : "Reduction";
  const amount = cents(Math.abs(ac.amount));
  const out = [
    `    <${tag}>`,
    `      <BaseAmount>${amt(base)}</BaseAmount>`,
    `      <Amount>${amt(amount)}</Amount>`,
  ];
  if (ac.reason) out.push(`      <Comment>${esc(ac.reason)}</Comment>`);
  out.push(...taxItemXml(amount, ac.taxRate, ac.taxCategory, "      "));
  out.push(`    </${tag}>`);
  return out;
}

export interface EbInterfaceOptions {
  /** Shown as GeneratingSystem in the XML. */
  generatingSystem?: string;
}

export function generateEbInterfaceXml(
  data: EInvoiceData,
  opts: EbInterfaceOptions = {}
): EInvoiceXmlResult {
  const buckets = new Map<string, TaxBucket>();
  const lines = data.lineItems.map((item, index) => {
    const lineAmount = cents(item.quantity * item.unitPrice);
    addToBucket(buckets, item.taxCategory, item.taxRate, lineAmount);
    return { item, index, lineAmount };
  });
  const netLines = cents(lines.reduce((sum, l) => sum + l.lineAmount, 0));

  for (const ac of data.allowanceCharges ?? []) {
    const signed = ac.isCharge ? Math.abs(ac.amount) : -Math.abs(ac.amount);
    addToBucket(buckets, ac.taxCategory, ac.taxRate, signed);
  }

  const taxItems = [...buckets.values()];
  // Sum of the per-rate amounts exactly as printed, so the summary adds up.
  const totalTax = cents(taxItems.reduce((sum, b) => sum + cents((b.taxable * b.rate) / 100), 0));
  const totalNet = cents(taxItems.reduce((sum, b) => sum + b.taxable, 0));
  const totalGross = cents(totalNet + totalTax);
  const prepaid = cents(data.advancePayment ?? 0);
  const payable = cents(totalGross - prepaid);

  const x: string[] = [];
  x.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  x.push(
    `<Invoice xmlns="${EBINTERFACE_NAMESPACE}" GeneratingSystem="${esc(opts.generatingSystem ?? "Subsumio")}" DocumentType="${DOCUMENT_TYPE[data.invoiceTypeCode] ?? "Invoice"}" InvoiceCurrency="${esc(data.currency || "EUR")}" Language="de">`
  );
  x.push(`  <InvoiceNumber>${esc(data.invoiceNumber)}</InvoiceNumber>`);
  x.push(`  <InvoiceDate>${isoDate(data.invoiceDate)}</InvoiceDate>`);

  // § 11 UStG requires the date of the service; the invoice date stands in
  // when the invoice carries no separate one.
  x.push(`  <Delivery>`);
  x.push(`    <Date>${isoDate(data.deliveryDate ?? data.invoiceDate)}</Date>`);
  x.push(`  </Delivery>`);

  x.push(`  <Biller>`);
  x.push(`    <VATIdentificationNumber>${esc(vatId(data.seller))}</VATIdentificationNumber>`);
  x.push(...addressXml(data.seller, "    "));
  x.push(...contactXml(data.seller, "    "));
  x.push(`  </Biller>`);

  x.push(`  <InvoiceRecipient>`);
  x.push(`    <VATIdentificationNumber>${esc(vatId(data.buyer))}</VATIdentificationNumber>`);
  // For invoices to the Bund the "Auftragsreferenz" (order number or buyer
  // group) is mandatory; it travels as OrderReference/OrderID.
  const orderRef = data.buyerReference ?? data.leitwegId;
  if (orderRef) {
    x.push(`    <OrderReference>`);
    x.push(`      <OrderID>${esc(orderRef)}</OrderID>`);
    x.push(`    </OrderReference>`);
  }
  x.push(...addressXml(data.buyer, "    "));
  x.push(...contactXml(data.buyer, "    "));
  x.push(`  </InvoiceRecipient>`);

  x.push(`  <Details>`);
  if (data.caseReference) {
    x.push(`    <HeaderDescription>Akt: ${esc(data.caseReference)}</HeaderDescription>`);
  }
  x.push(`    <ItemList>`);
  for (const { item, index, lineAmount } of lines) {
    x.push(`      <ListLineItem>`);
    x.push(`        <PositionNumber>${index + 1}</PositionNumber>`);
    x.push(`        <Description>${esc(item.name)}</Description>`);
    if (item.description && item.description !== item.name) {
      x.push(`        <Description>${esc(item.description)}</Description>`);
    }
    x.push(`        <Quantity Unit="${esc(item.unit)}">${item.quantity.toFixed(4)}</Quantity>`);
    x.push(`        <UnitPrice>${item.unitPrice.toFixed(4)}</UnitPrice>`);
    x.push(...taxItemXml(lineAmount, item.taxRate, item.taxCategory, "        "));
    x.push(`        <LineItemAmount>${amt(lineAmount)}</LineItemAmount>`);
    x.push(`      </ListLineItem>`);
  }
  x.push(`    </ItemList>`);
  x.push(`  </Details>`);

  if (data.allowanceCharges?.length) {
    x.push(`  <ReductionAndSurchargeDetails>`);
    for (const ac of data.allowanceCharges) x.push(...reductionOrSurchargeXml(ac, netLines));
    x.push(`  </ReductionAndSurchargeDetails>`);
  }

  x.push(`  <Tax>`);
  for (const b of taxItems) {
    // Exempt or reverse-charge items must name their legal basis.
    const comment = b.category !== "S" ? data.taxExemptionReason : undefined;
    x.push(...taxItemXml(b.taxable, b.rate, b.category, "    ", comment));
  }
  x.push(`  </Tax>`);
  x.push(`  <TotalGrossAmount>${amt(totalGross)}</TotalGrossAmount>`);
  if (prepaid > 0) x.push(`  <PrepaidAmount>${amt(prepaid)}</PrepaidAmount>`);
  x.push(`  <PayableAmount>${amt(payable)}</PayableAmount>`);

  if (data.bank?.iban) {
    x.push(`  <PaymentMethod>`);
    x.push(`    <UniversalBankTransaction>`);
    x.push(`      <BeneficiaryAccount>`);
    if (data.bank.name) x.push(`        <BankName>${esc(data.bank.name)}</BankName>`);
    if (data.bank.bic) x.push(`        <BIC>${esc(data.bank.bic.replace(/\s/g, ""))}</BIC>`);
    x.push(`        <IBAN>${esc(data.bank.iban.replace(/\s/g, ""))}</IBAN>`);
    x.push(`        <BankAccountOwner>${esc(data.seller.name)}</BankAccountOwner>`);
    x.push(`      </BeneficiaryAccount>`);
    x.push(`      <PaymentReference>${esc(data.invoiceNumber)}</PaymentReference>`);
    x.push(`    </UniversalBankTransaction>`);
    x.push(`  </PaymentMethod>`);
  }

  if (data.dueDate || data.paymentTerms) {
    x.push(`  <PaymentConditions>`);
    if (data.dueDate) x.push(`    <DueDate>${isoDate(data.dueDate)}</DueDate>`);
    if (data.paymentTerms) x.push(`    <Comment>${esc(data.paymentTerms)}</Comment>`);
    x.push(`  </PaymentConditions>`);
  }

  if (data.notes) x.push(`  <Comment>${esc(data.notes)}</Comment>`);
  x.push(`</Invoice>`);

  const safeNumber = data.invoiceNumber.replace(/[^A-Za-z0-9._-]+/g, "_");
  return {
    xml: x.join("\n"),
    filename: `ebInterface_${safeNumber}.xml`,
    profile: data.profile,
  };
}
