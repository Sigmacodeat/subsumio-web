/**
 * XRechnung XML Generation & Parsing
 * ==================================
 *
 * Implements EN 16931 (UN/CEFACT CII) XML format for the XRechnung
 * and ZUGFeRD/Factur-X profiles.
 *
 * XRechnung 2.0 spec: urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_2.0::2.0
 * ZUGFeRD/Factur-X:   urn:cen.eu:en16931:2017
 *
 * References:
 * - EN 16931:2017 European standard for electronic invoices
 * - UN/CEFACT Cross Industry Invoice (CII) XML
 * - XRechnung 2.0 specification (KoIT)
 * - ZUGFeRD 2.1 / Factur-X specification
 */

import type {
  EInvoiceAllowanceCharge,
  EInvoiceData,
  EInvoiceLineItem,
  EInvoiceParty,
  EInvoiceProfile,
  EInvoiceXmlResult,
  ParsedEInvoice,
  TaxCategoryCode,
  UnitCode,
} from "./types";

// =====================
// CONSTANTS
// =====================

const NS_CII = "urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100";
const NS_RAM = "urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationModel:100";
const NS_UDT = "urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100";
const NS_QDT = "urn:un:unece:uncefact:data:standard:QualifiedDataType:100";

const XRECHNUNG_SPEC_IDS: Record<EInvoiceProfile, string> = {
  MINIMUM: "urn:cen.eu:en16931:2017#minimum",
  BASIC: "urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_2.0::2.0",
  BASICWL: "urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_2.0::2.0",
  COMFORT: "urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_2.0::2.0",
  EXTENDED: "urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_2.0::2.0",
};

const ZUGFERD_SPEC_IDS: Record<EInvoiceProfile, string> = {
  MINIMUM: "urn:cen.eu:en16931:2017#minimum",
  BASIC: "urn:cen.eu:en16931:2017",
  BASICWL: "urn:cen.eu:en16931:2017#basicwl",
  COMFORT: "urn:cen.eu:en16931:2017#comfort",
  EXTENDED: "urn:cen.eu:en16931:2017#extended",
};

// =====================
// XML HELPERS
// =====================

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fmtDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = dateStr.length >= 10 ? dateStr.slice(0, 10) : dateStr;
  return d.replace(/-/g, "");
}

function fmtAmt(amount: number): string {
  return amount.toFixed(2);
}

function fmtQty(qty: number): string {
  return qty.toFixed(2);
}

function partyXml(party: EInvoiceParty, role: "Seller" | "Buyer"): string {
  const lines: string[] = [];
  lines.push(`    <ram:${role}TradeParty>`);

  if (party.id) {
    lines.push(`      <ram:ID>${esc(party.id)}</ram:ID>`);
  }

  lines.push(`      <ram:Name>${esc(party.name)}</ram:Name>`);

  if (party.legalForm) {
    lines.push(`      <ram:Description>${esc(party.legalForm)}</ram:Description>`);
  }

  if (party.contactName || party.email || party.phone) {
    lines.push(`      <ram:DefinedTradeContact>`);
    if (party.contactName) {
      lines.push(`        <ram:PersonName>${esc(party.contactName)}</ram:PersonName>`);
    }
    if (party.phone) {
      lines.push(`        <ram:TelephoneUniversalCommunication>`);
      lines.push(`          <ram:CompleteNumber>${esc(party.phone)}</ram:CompleteNumber>`);
      lines.push(`        </ram:TelephoneUniversalCommunication>`);
    }
    if (party.email) {
      lines.push(`        <ram:EmailURIUniversalCommunication>`);
      lines.push(`          <ram:URIID>${esc(party.email)}</ram:URIID>`);
      lines.push(`        </ram:EmailURIUniversalCommunication>`);
    }
    lines.push(`      </ram:DefinedTradeContact>`);
  }

  lines.push(`      <ram:PostalTradeAddress>`);
  if (party.street) {
    lines.push(`        <ram:LineOne>${esc(party.street)}</ram:LineOne>`);
  }
  if (party.additionalStreet) {
    lines.push(`        <ram:LineTwo>${esc(party.additionalStreet)}</ram:LineTwo>`);
  }
  lines.push(`        <ram:PostcodeCode>${esc(party.zip)}</ram:PostcodeCode>`);
  lines.push(`        <ram:CityName>${esc(party.city)}</ram:CityName>`);
  lines.push(`        <ram:CountryID>${esc(party.country)}</ram:CountryID>`);
  lines.push(`      </ram:PostalTradeAddress>`);

  if (party.vatId) {
    lines.push(`      <ram:SpecifiedTaxRegistration>`);
    lines.push(`        <ram:ID>${esc(party.vatId)}</ram:ID>`);
    lines.push(`      </ram:SpecifiedTaxRegistration>`);
  }

  lines.push(`    </ram:${role}TradeParty>`);
  return lines.join("\n");
}

function lineItemXml(item: EInvoiceLineItem): string {
  const lineTotal = item.quantity * item.unitPrice;
  const lines: string[] = [];

  lines.push(`    <ram:IncludedSupplyChainTradeLineItem>`);
  lines.push(`      <ram:AssociatedDocumentLineDocument>`);
  lines.push(`        <ram:LineID>${esc(item.id)}</ram:LineID>`);
  lines.push(`      </ram:AssociatedDocumentLineDocument>`);

  lines.push(`      <ram:SpecifiedTradeProduct>`);
  if (item.description) {
    lines.push(`        <ram:Description>${esc(item.description)}</ram:Description>`);
  }
  lines.push(`        <ram:Name>${esc(item.name)}</ram:Name>`);
  lines.push(`      </ram:SpecifiedTradeProduct>`);

  lines.push(`      <ram:SpecifiedLineTradeAgreement>`);
  lines.push(`        <ram:NetPriceProductTradePrice>`);
  lines.push(`          <ram:ChargeAmount>${fmtAmt(item.unitPrice)}</ram:ChargeAmount>`);
  lines.push(`        </ram:NetPriceProductTradePrice>`);
  lines.push(`      </ram:SpecifiedLineTradeAgreement>`);

  lines.push(`      <ram:SpecifiedLineTradeDelivery>`);
  lines.push(
    `        <ram:BilledQuantity unitCode="${item.unit}">${fmtQty(item.quantity)}</ram:BilledQuantity>`
  );
  lines.push(`      </ram:SpecifiedLineTradeDelivery>`);

  lines.push(`      <ram:SpecifiedLineTradeSettlement>`);
  lines.push(`        <ram:ApplicableTradeTax>`);
  lines.push(`          <ram:TypeCode>VAT</ram:TypeCode>`);
  lines.push(`          <ram:CategoryCode>${item.taxCategory}</ram:CategoryCode>`);
  lines.push(`          <ram:RateApplicablePercent>${item.taxRate}</ram:RateApplicablePercent>`);
  lines.push(`        </ram:ApplicableTradeTax>`);

  if (item.description) {
    lines.push(`        <ram:SpecifiedTradeAllowanceCharge>`);
    lines.push(
      `          <ram:ChargeIndicator><udt:Indicator>false</udt:Indicator></ram:ChargeIndicator>`
    );
    lines.push(`          <ram:ActualAmount>0.00</ram:ActualAmount>`);
    lines.push(`        </ram:SpecifiedTradeAllowanceCharge>`);
  }

  lines.push(`        <ram:SpecifiedTradeSettlementLineMonetarySummation>`);
  lines.push(`          <ram:LineTotalAmount>${fmtAmt(lineTotal)}</ram:LineTotalAmount>`);
  lines.push(`        </ram:SpecifiedTradeSettlementLineMonetarySummation>`);
  lines.push(`      </ram:SpecifiedLineTradeSettlement>`);
  lines.push(`    </ram:IncludedSupplyChainTradeLineItem>`);

  return lines.join("\n");
}

function allowanceChargeXml(ac: EInvoiceAllowanceCharge): string {
  const lines: string[] = [];
  lines.push(`      <ram:SpecifiedTradeAllowanceCharge>`);
  lines.push(`        <ram:ChargeIndicator>`);
  lines.push(`          <udt:Indicator>${ac.isCharge}</udt:Indicator>`);
  lines.push(`        </ram:ChargeIndicator>`);
  lines.push(`        <ram:ActualAmount>${fmtAmt(Math.abs(ac.amount))}</ram:ActualAmount>`);
  if (ac.reason) {
    lines.push(`        <ram:Reason>${esc(ac.reason)}</ram:Reason>`);
  }
  lines.push(`        <ram:CategoryTradeTax>`);
  lines.push(`          <ram:TypeCode>VAT</ram:TypeCode>`);
  lines.push(`          <ram:CategoryCode>${ac.taxCategory}</ram:CategoryCode>`);
  lines.push(`          <ram:RateApplicablePercent>${ac.taxRate}</ram:RateApplicablePercent>`);
  lines.push(`        </ram:CategoryTradeTax>`);
  lines.push(`      </ram:SpecifiedTradeAllowanceCharge>`);
  return lines.join("\n");
}

// =====================
// XRECHNUNG XML GENERATION
// =====================

export function generateXRechnungXml(
  data: EInvoiceData,
  format: "xrechnung" | "zugferd" = "xrechnung"
): EInvoiceXmlResult {
  const specId =
    format === "xrechnung"
      ? (XRECHNUNG_SPEC_IDS[data.profile] ?? XRECHNUNG_SPEC_IDS.BASIC)
      : (ZUGFERD_SPEC_IDS[data.profile] ?? ZUGFERD_SPEC_IDS.BASIC);

  const lineTotal = data.lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const chargeTotal = (data.allowanceCharges ?? [])
    .filter((ac) => ac.isCharge)
    .reduce((sum, ac) => sum + Math.abs(ac.amount), 0);
  const allowanceTotal = (data.allowanceCharges ?? [])
    .filter((ac) => !ac.isCharge)
    .reduce((sum, ac) => sum + Math.abs(ac.amount), 0);

  const taxBasis = lineTotal + chargeTotal - allowanceTotal;
  const taxAmount = data.lineItems.reduce(
    (sum, item) => sum + (item.quantity * item.unitPrice * item.taxRate) / 100,
    0
  );
  const grandTotal = taxBasis + taxAmount;
  const duePayable = grandTotal - (data.advancePayment ?? 0);

  const issueDate = fmtDate(data.invoiceDate);
  const dueDate = data.dueDate ? fmtDate(data.dueDate) : "";
  const deliveryDate = data.deliveryDate ? fmtDate(data.deliveryDate) : issueDate;

  const xml: string[] = [];

  xml.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  xml.push(
    `<CrossIndustryInvoice xmlns="${NS_CII}" xmlns:ram="${NS_RAM}" xmlns:udt="${NS_UDT}" xmlns:qdt="${NS_QDT}">`
  );

  // --- ExchangedDocumentContext ---
  xml.push(`  <ExchangedDocumentContext>`);
  xml.push(`    <ram:GuidelineSpecifiedDocumentContextParameter>`);
  xml.push(`      <ram:ID>${specId}</ram:ID>`);
  xml.push(`    </ram:GuidelineSpecifiedDocumentContextParameter>`);
  xml.push(`  </ExchangedDocumentContext>`);

  // --- ExchangedDocument ---
  xml.push(`  <ExchangedDocument>`);
  xml.push(`    <ram:ID>${esc(data.invoiceNumber)}</ram:ID>`);
  xml.push(`    <ram:TypeCode>${data.invoiceTypeCode}</ram:TypeCode>`);
  xml.push(`    <ram:IssueDateTime>`);
  xml.push(`      <udt:DateTimeString format="102">${issueDate}</udt:DateTimeString>`);
  xml.push(`    </ram:IssueDateTime>`);
  if (data.notes) {
    xml.push(`    <ram:IncludedNote>`);
    xml.push(`      <ram:Content>${esc(data.notes)}</ram:Content>`);
    xml.push(`    </ram:IncludedNote>`);
  }
  xml.push(`  </ExchangedDocument>`);

  // --- SupplyChainTradeTransaction ---
  xml.push(`  <SupplyChainTradeTransaction>`);

  // Line items
  for (const item of data.lineItems) {
    xml.push(lineItemXml(item));
  }

  // ApplicableHeaderTradeAgreement
  xml.push(`    <ram:ApplicableHeaderTradeAgreement>`);
  if (data.buyerReference) {
    xml.push(`      <ram:BuyerReference>${esc(data.buyerReference)}</ram:BuyerReference>`);
  } else if (data.leitwegId) {
    xml.push(`      <ram:BuyerReference>${esc(data.leitwegId)}</ram:BuyerReference>`);
  }
  xml.push(partyXml(data.seller, "Seller"));
  xml.push(partyXml(data.buyer, "Buyer"));
  if (data.caseReference) {
    xml.push(`      <ram:BuyerOrderReferencedDocument>`);
    xml.push(`        <ram:IssuerAssignedID>${esc(data.caseReference)}</ram:IssuerAssignedID>`);
    xml.push(`      </ram:BuyerOrderReferencedDocument>`);
  }
  xml.push(`    </ram:ApplicableHeaderTradeAgreement>`);

  // ApplicableHeaderTradeDelivery
  xml.push(`    <ram:ApplicableHeaderTradeDelivery>`);
  xml.push(`      <ram:ActualDeliverySupplyChainEvent>`);
  xml.push(`        <ram:OccurrenceDateTime>`);
  xml.push(`          <udt:DateTimeString format="102">${deliveryDate}</udt:DateTimeString>`);
  xml.push(`        </ram:OccurrenceDateTime>`);
  xml.push(`      </ram:ActualDeliverySupplyChainEvent>`);
  xml.push(`    </ram:ApplicableHeaderTradeDelivery>`);

  // ApplicableHeaderTradeSettlement
  xml.push(`    <ram:ApplicableHeaderTradeSettlement>`);

  // Payment reference / case reference
  if (data.invoiceNumber) {
    xml.push(`      <ram:PaymentReference>${esc(data.invoiceNumber)}</ram:PaymentReference>`);
  }

  xml.push(`      <ram:InvoiceCurrencyCode>${esc(data.currency)}</ram:InvoiceCurrencyCode>`);

  // Payment means
  if (data.bank?.iban) {
    xml.push(`      <ram:SpecifiedTradeSettlementPaymentMeans>`);
    xml.push(`        <ram:TypeCode>58</ram:TypeCode>`);
    xml.push(`        <ram:Information>Überweisung</ram:Information>`);
    if (data.bank.name) {
      xml.push(`        <ram:PayeePartyCreditorFinancialAccount>`);
      xml.push(`          <ram:IBANID>${esc(data.bank.iban.replace(/\s/g, ""))}</ram:IBANID>`);
      if (data.bank.bic) {
        xml.push(`          <ram:AccountName>${esc(data.bank.name)}</ram:AccountName>`);
      }
      xml.push(`        </ram:PayeePartyCreditorFinancialAccount>`);
      if (data.bank.bic) {
        xml.push(`        <ram:PayeeSpecifiedCreditorFinancialInstitution>`);
        xml.push(`          <ram:BICID>${esc(data.bank.bic.replace(/\s/g, ""))}</ram:BICID>`);
        xml.push(`          <ram:Name>${esc(data.bank.name)}</ram:Name>`);
        xml.push(`        </ram:PayeeSpecifiedCreditorFinancialInstitution>`);
      }
    } else {
      xml.push(`        <ram:PayeePartyCreditorFinancialAccount>`);
      xml.push(`          <ram:IBANID>${esc(data.bank.iban.replace(/\s/g, ""))}</ram:IBANID>`);
      xml.push(`        </ram:PayeePartyCreditorFinancialAccount>`);
      if (data.bank.bic) {
        xml.push(`        <ram:PayeeSpecifiedCreditorFinancialInstitution>`);
        xml.push(`          <ram:BICID>${esc(data.bank.bic.replace(/\s/g, ""))}</ram:BICID>`);
        xml.push(`        </ram:PayeeSpecifiedCreditorFinancialInstitution>`);
      }
    }
    xml.push(`      </ram:SpecifiedTradeSettlementPaymentMeans>`);
  }

  // Allowances/Charges
  for (const ac of data.allowanceCharges ?? []) {
    xml.push(allowanceChargeXml(ac));
  }

  // Trade tax
  xml.push(`      <ram:ApplicableTradeTax>`);
  xml.push(`        <ram:CalculatedAmount>${fmtAmt(taxAmount)}</ram:CalculatedAmount>`);
  xml.push(`        <ram:TypeCode>VAT</ram:TypeCode>`);
  xml.push(`        <ram:BasisAmount>${fmtAmt(taxBasis)}</ram:BasisAmount>`);
  xml.push(`        <ram:CategoryCode>${data.taxCategory}</ram:CategoryCode>`);
  xml.push(`        <ram:RateApplicablePercent>${data.taxRate}</ram:RateApplicablePercent>`);
  xml.push(`      </ram:ApplicableTradeTax>`);

  // Payment terms
  if (data.paymentTerms || dueDate) {
    xml.push(`      <ram:SpecifiedTradePaymentTerms>`);
    if (data.paymentTerms) {
      xml.push(`        <ram:Description>${esc(data.paymentTerms)}</ram:Description>`);
    }
    if (dueDate) {
      xml.push(`        <ram:DueDateDateTime>`);
      xml.push(`          <udt:DateTimeString format="102">${dueDate}</udt:DateTimeString>`);
      xml.push(`        </ram:DueDateDateTime>`);
    }
    xml.push(`      </ram:SpecifiedTradePaymentTerms>`);
  }

  // Monetary summation
  xml.push(`      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>`);
  xml.push(`        <ram:LineTotalAmount>${fmtAmt(lineTotal)}</ram:LineTotalAmount>`);
  xml.push(`        <ram:ChargeTotalAmount>${fmtAmt(chargeTotal)}</ram:ChargeTotalAmount>`);
  xml.push(
    `        <ram:AllowanceTotalAmount>${fmtAmt(allowanceTotal)}</ram:AllowanceTotalAmount>`
  );
  xml.push(`        <ram:TaxBasisTotalAmount>${fmtAmt(taxBasis)}</ram:TaxBasisTotalAmount>`);
  xml.push(
    `        <ram:TaxTotalAmount currencyID="${esc(data.currency)}">${fmtAmt(taxAmount)}</ram:TaxTotalAmount>`
  );
  xml.push(`        <ram:GrandTotalAmount>${fmtAmt(grandTotal)}</ram:GrandTotalAmount>`);
  xml.push(
    `        <ram:TotalPrepaidAmount>${fmtAmt(data.advancePayment ?? 0)}</ram:TotalPrepaidAmount>`
  );
  xml.push(`        <ram:DuePayableAmount>${fmtAmt(duePayable)}</ram:DuePayableAmount>`);
  xml.push(`      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>`);

  xml.push(`    </ram:ApplicableHeaderTradeSettlement>`);
  xml.push(`  </SupplyChainTradeTransaction>`);
  xml.push(`</CrossIndustryInvoice>`);

  const xmlStr = xml.join("\n");
  const filename = `${format === "xrechnung" ? "xrechnung" : "factur-x"}_${data.invoiceNumber}.xml`;

  return {
    xml: xmlStr,
    filename,
    profile: data.profile,
  };
}

// =====================
// XRECHNUNG XML PARSING
// =====================

function extractText(xml: string, tag: string): string | undefined {
  const regex = new RegExp(
    `<(?:ram:|udt:|qdt:)?${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</(?:ram:|udt:|qdt:)?${tag}>`,
    "i"
  );
  const match = xml.match(regex);
  if (!match) return undefined;
  return match[1].trim();
}

function extractAllBlocks(xml: string, tag: string): string[] {
  const openTag = new RegExp(`<(?:ram:|udt:|qdt:)?${tag}[\\s>]`, "gi");
  const closeTag = new RegExp(`</(?:ram:|udt:|qdt:)?${tag}>`, "gi");
  const results: string[] = [];
  let openMatch: RegExpExecArray | null;

  while ((openMatch = openTag.exec(xml)) !== null) {
    const startIdx = openMatch.index;
    let depth = 1;
    let searchIdx = openTag.lastIndex;
    closeTag.lastIndex = searchIdx;

    let closeMatch: RegExpExecArray | null;
    while ((closeMatch = closeTag.exec(xml)) !== null) {
      depth--;
      if (depth === 0) {
        const endIdx = closeMatch.index + closeMatch[0].length;
        results.push(xml.slice(startIdx, endIdx));
        break;
      }
      // Check for nested open tags
      openTag.lastIndex = searchIdx;
      const nestedOpen = openTag.exec(xml);
      if (nestedOpen && nestedOpen.index < closeMatch.index) {
        depth++;
        searchIdx = openTag.lastIndex;
        closeTag.lastIndex = searchIdx;
      } else {
        searchIdx = closeTag.lastIndex;
      }
    }
  }

  return results;
}

function extractAttr(xml: string, tag: string, attr: string): string | undefined {
  const regex = new RegExp(`<(?:ram:|udt:|qdt:)?${tag}[^>]*\\s${attr}=["']([^"']*)["']`, "i");
  const match = xml.match(regex);
  return match?.[1]?.trim();
}

function unesc(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function parseDate(dateStr: string): string {
  if (!dateStr || dateStr.length < 8) return "";
  return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
}

function parseParty(block: string, _role: "Seller" | "Buyer"): EInvoiceParty {
  const name = extractText(block, "Name") ?? "";
  const id = extractText(block, "ID");
  const street = extractText(block, "LineOne");
  const additionalStreet = extractText(block, "LineTwo");
  const zip = extractText(block, "PostcodeCode") ?? "";
  const city = extractText(block, "CityName") ?? "";
  const country = extractText(block, "CountryID") ?? "DE";
  const contactName = extractText(block, "PersonName");
  const email = extractText(block, "URIID");
  const phone = extractText(block, "CompleteNumber");
  const description = extractText(block, "Description");

  // For VAT ID, look in SpecifiedTaxRegistration
  const taxRegMatch = block.match(
    /SpecifiedTaxRegistration[\s\S]*?<ram:ID[^>]*>([^<]+)<\/ram:ID>/i
  );
  const taxId = taxRegMatch ? taxRegMatch[1].trim() : undefined;

  return {
    id: id !== name ? id : undefined,
    name: unesc(name),
    contactName: contactName ? unesc(contactName) : undefined,
    street: street ? unesc(street) : undefined,
    additionalStreet: additionalStreet ? unesc(additionalStreet) : undefined,
    zip,
    city: unesc(city),
    country,
    vatId: taxId,
    email: email ? unesc(email) : undefined,
    phone: phone ? unesc(phone) : undefined,
    legalForm: description ? unesc(description) : undefined,
  };
}

function parseLineItem(block: string): EInvoiceLineItem {
  const id = extractText(block, "LineID") ?? "1";
  const name = extractText(block, "Name") ?? "";
  const description = extractText(block, "Description");
  const chargeAmount = parseFloat(extractText(block, "ChargeAmount") ?? "0");
  const billedQty = parseFloat(extractText(block, "BilledQuantity") ?? "0");
  const unit = (extractAttr(block, "BilledQuantity", "unitCode") ?? "C62") as UnitCode;
  const lineTotal = parseFloat(extractText(block, "LineTotalAmount") ?? "0");
  const taxRate = parseFloat(extractText(block, "RateApplicablePercent") ?? "0");
  const taxCategory = (extractText(block, "CategoryCode") ?? "S") as TaxCategoryCode;

  return {
    id,
    name: unesc(name),
    description: description ? unesc(description) : undefined,
    quantity: billedQty,
    unit,
    unitPrice: billedQty > 0 ? chargeAmount : lineTotal,
    taxRate,
    taxCategory,
  };
}

export function parseXRechnungXml(xml: string): ParsedEInvoice {
  // Determine profile from spec ID (first ID in GuidelineSpecifiedDocumentContextParameter)
  const specId = extractText(xml, "ID") ?? "";
  let profile: EInvoiceProfile = "BASIC";
  if (specId.includes("minimum")) profile = "MINIMUM";
  else if (specId.includes("basicwl")) profile = "BASICWL";
  else if (specId.includes("comfort")) profile = "COMFORT";
  else if (specId.includes("extended")) profile = "EXTENDED";

  // Extract invoice number from ExchangedDocument block (not the spec ID)
  const exchangedDocMatch = xml.match(/<ExchangedDocument>([\s\S]*?)<\/ExchangedDocument>/i);
  const exchangedDoc = exchangedDocMatch ? exchangedDocMatch[1] : "";
  const invoiceNumber = extractText(exchangedDoc, "ID") ?? "";
  const typeCode = extractText(exchangedDoc, "TypeCode") ?? "380";
  const issueDateTime = extractText(exchangedDoc, "DateTimeString") ?? "";
  const invoiceDate = parseDate(issueDateTime);

  // Seller and Buyer
  const sellerBlock = extractAllBlocks(xml, "SellerTradeParty")[0] ?? "";
  const buyerBlock = extractAllBlocks(xml, "BuyerTradeParty")[0] ?? "";
  const seller = parseParty(sellerBlock, "Seller");
  const buyer = parseParty(buyerBlock, "Buyer");

  // Line items
  const lineItemBlocks = extractAllBlocks(xml, "IncludedSupplyChainTradeLineItem");
  const lineItems = lineItemBlocks.map(parseLineItem);

  // Settlement
  const currency = extractText(xml, "InvoiceCurrencyCode") ?? "EUR";
  const taxBasis = parseFloat(extractText(xml, "TaxBasisTotalAmount") ?? "0");
  const taxAmount = parseFloat(extractText(xml, "TaxTotalAmount") ?? "0");
  const grandTotal = parseFloat(extractText(xml, "GrandTotalAmount") ?? "0");
  const prepaid = parseFloat(extractText(xml, "TotalPrepaidAmount") ?? "0");

  // Payment terms - extract from SpecifiedTradePaymentTerms block
  const paymentTermsBlock = xml.match(
    /<ram:SpecifiedTradePaymentTerms>([\s\S]*?)<\/ram:SpecifiedTradePaymentTerms>/i
  );
  const paymentTerms = paymentTermsBlock
    ? extractText(paymentTermsBlock[1], "Description")
    : undefined;
  const dueDateStr = paymentTermsBlock
    ? extractText(paymentTermsBlock[1], "DateTimeString")
    : undefined;
  const dueDate = dueDateStr ? parseDate(dueDateStr) : undefined;

  // Bank
  const iban = extractText(xml, "IBANID");
  const bic = extractText(xml, "BICID");
  const bankName = extractText(xml, "Name");

  // Notes
  const noteContent = extractText(xml, "Content");

  // Tax rate
  const taxRate = parseFloat(extractText(xml, "RateApplicablePercent") ?? "0");

  // Allowance charges
  const acBlocks = extractAllBlocks(xml, "SpecifiedTradeAllowanceCharge");
  const allowanceCharges: EInvoiceAllowanceCharge[] = acBlocks.map((block) => {
    const amount = parseFloat(extractText(block, "ActualAmount") ?? "0");
    const reason = extractText(block, "Reason");
    const rate = parseFloat(extractText(block, "RateApplicablePercent") ?? "0");
    const category = (extractText(block, "CategoryCode") ?? "S") as TaxCategoryCode;
    const chargeIndicator = extractText(block, "Indicator");
    return {
      amount,
      reason: reason ? unesc(reason) : undefined,
      taxRate: rate,
      taxCategory: category,
      isCharge: chargeIndicator === "true",
    };
  });

  // Case reference
  const caseRef = extractText(xml, "IssuerAssignedID");

  return {
    invoiceNumber: unesc(invoiceNumber),
    invoiceDate,
    dueDate,
    invoiceTypeCode: typeCode,
    currency,
    profile,
    seller,
    buyer,
    lineItems,
    allowanceCharges,
    taxRate,
    totalNet: taxBasis,
    totalTax: taxAmount,
    totalGross: grandTotal,
    advancePayment: prepaid > 0 ? prepaid : undefined,
    bank: iban
      ? {
          iban: unesc(iban),
          bic: bic ? unesc(bic) : undefined,
          name: bankName ? unesc(bankName) : undefined,
        }
      : undefined,
    paymentTerms: paymentTerms ? unesc(paymentTerms) : undefined,
    notes: noteContent ? unesc(noteContent) : undefined,
    caseReference: caseRef ? unesc(caseRef) : undefined,
  };
}
