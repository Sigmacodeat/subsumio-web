/**
 * E-Invoice Types
 * ===============
 *
 * Type definitions for XRechnung / ZUGFeRD (EN 16931),
 * Swiss QR-Bill, and EPC-QR (GiroCode).
 */

/** XRechnung/ZUGFeRD profile level per EN 16931 */
export type EInvoiceProfile = "MINIMUM" | "BASIC" | "BASICWL" | "COMFORT" | "EXTENDED";

/** Output format */
export type EInvoiceOutputFormat = "xrechnung" | "zugferd";

/** UN/CEFACT document type codes */
export type EInvoiceTypeCode = "380" | "381" | "384" | "386" | "326";

/** EN 16931 tax category codes */
export type TaxCategoryCode = "S" | "Z" | "E" | "AE" | "K" | "G";

/** UN/CEFACT unit codes */
export type UnitCode = "HUR" | "DAY" | "C62" | "EA" | "LS" | "MIN" | "WEE" | "MON";

/** Party (seller or buyer) in an e-invoice */
export interface EInvoiceParty {
  id?: string;
  name: string;
  contactName?: string;
  street?: string;
  additionalStreet?: string;
  zip: string;
  city: string;
  country: string;
  vatId?: string;
  taxNumber?: string;
  email?: string;
  phone?: string;
  legalForm?: string;
}

/** Line item in an e-invoice */
export interface EInvoiceLineItem {
  id: string;
  name: string;
  description?: string;
  quantity: number;
  unit: UnitCode;
  unitPrice: number;
  taxRate: number;
  taxCategory: TaxCategoryCode;
}

/** Allowance or charge at document level */
export interface EInvoiceAllowanceCharge {
  amount: number;
  reason?: string;
  taxRate: number;
  taxCategory: TaxCategoryCode;
  isCharge: boolean;
}

/** Complete e-invoice data for XML/PDF generation */
export interface EInvoiceData {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  deliveryDate?: string;
  invoiceTypeCode: EInvoiceTypeCode;
  currency: string;
  profile: EInvoiceProfile;
  seller: EInvoiceParty;
  buyer: EInvoiceParty;
  lineItems: EInvoiceLineItem[];
  allowanceCharges?: EInvoiceAllowanceCharge[];
  advancePayment?: number;
  taxRate: number;
  taxCategory: TaxCategoryCode;
  paymentTerms?: string;
  bank?: {
    name?: string;
    iban: string;
    bic?: string;
  };
  leitwegId?: string;
  buyerReference?: string;
  caseReference?: string;
  notes?: string;
}

/** Result of XRechnung XML generation */
export interface EInvoiceXmlResult {
  xml: string;
  filename: string;
  profile: EInvoiceProfile;
}

/** Result of ZUGFeRD PDF/A-3 generation */
export interface ZUGFeRDResult {
  pdf: Uint8Array;
  filename: string;
  profile: EInvoiceProfile;
}

/** Validation result */
export interface EInvoiceValidationResult {
  valid: boolean;
  errors: Array<{ field: string; message: string }>;
  warnings: Array<{ field: string; message: string }>;
}

/** Parsed incoming e-invoice */
export interface ParsedEInvoice {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  deliveryDate?: string;
  invoiceTypeCode: string;
  currency: string;
  profile: EInvoiceProfile;
  seller: EInvoiceParty;
  buyer: EInvoiceParty;
  lineItems: EInvoiceLineItem[];
  allowanceCharges: EInvoiceAllowanceCharge[];
  taxRate: number;
  totalNet: number;
  totalTax: number;
  totalGross: number;
  advancePayment?: number;
  bank?: { name?: string; iban: string; bic?: string };
  paymentTerms?: string;
  notes?: string;
  caseReference?: string;
}

/** Swiss QR-Bill data */
export interface SwissQrBillData {
  creditor: EInvoiceParty;
  iban: string;
  amount: number;
  currency: "CHF" | "EUR";
  reference: string;
  debtor?: EInvoiceParty;
  unstructuredMessage?: string;
  billingInformation?: string;
  altProcedure?: { algorithm: string; param: string };
}

/** EPC-QR (GiroCode / SepaQR) data */
export interface EpcQrData {
  bic?: string;
  name: string;
  iban: string;
  amount?: number;
  purpose?: string;
  reference?: string;
  remittanceInfo?: string;
  beneficiaryToOriginatorInfo?: string;
}
