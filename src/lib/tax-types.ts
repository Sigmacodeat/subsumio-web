/**
 * Tax-domain types — analog to legal-types.ts but for tax advisory.
 * Covers tax returns, assessments, audits, and client financial data.
 */

export type TaxReturnType =
  | "ESt" // Einkommensteuer
  | "USt" // Umsatzsteuer
  | "GewSt" // Gewerbesteuer
  | "KSt" // Körperschaftsteuer
  | "SolZ" // Solidaritätszuschlag
  | "VSt" // Vermögensteuer (historisch)
  | "GrESt" // Grunderwerbsteuer
  | "ErbSt" // Erbschaftsteuer
  | "LSt" // Lohnsteuer
  | "UStVA" // Umsatzsteuer-Voranmeldung
  | "LStA" // Lohnsteuer-Anmeldung
  | "ZM" // Zusammenfassende Meldung
  | "other";

export type TaxReturnStatus =
  | "draft"
  | "in_progress"
  | "review"
  | "submitted"
  | "assessed"
  | "corrected"
  | "closed";

export type AssessmentType =
  | "Einschaetzung"
  | "Festsetzung"
  | "Nachforderung"
  | "Erstattung"
  | "Vorauszahlung"
  | "Stundung"
  | "Haftruecklass";

export type TaxAuditPhase =
  | "vorbereitung"
  | "pruefung"
  | "abschluss"
  | "rechtsbehelf"
  | "abgeschlossen";

export interface TaxClient {
  id: string;
  name: string;
  type: "person" | "company" | "partnership" | "estate";
  taxId: string;
  vatId?: string;
  fiscalYearStart: string;
  fiscalYearEnd: string;
  industryCode?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: {
    street: string;
    postalCode: string;
    city: string;
    country: string;
  };
}

export interface TaxReturn {
  id: string;
  clientId: string;
  clientName: string;
  type: TaxReturnType;
  year: number;
  status: TaxReturnStatus;
  assignedTo?: string;
  dueDate?: string;
  submittedDate?: string;
  assessedDate?: string;
  assessmentNotice?: string;
  taxAmount?: number;
  refundAmount?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaxAssessment {
  id: string;
  clientId: string;
  clientName: string;
  type: AssessmentType;
  taxType: TaxReturnType;
  year: number;
  noticeNumber?: string;
  noticeDate: string;
  dueDate?: string;
  amount: number;
  paidDate?: string;
  contested?: boolean;
  contestDeadline?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaxAudit {
  id: string;
  clientId: string;
  clientName: string;
  type: "Betriebspruefung" | "Aussenpruefung" | "Lohnpruefung" | "UStpruefung";
  year: number;
  phase: TaxAuditPhase;
  auditor?: string;
  startDate?: string;
  endDate?: string;
  findings?: {
    issue: string;
    amount?: number;
    accepted: boolean;
  }[];
  totalAdditionalTax?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaxDeadlineEntry {
  id: string;
  type: TaxReturnType | "ZM" | "LStA" | "UStVA" | "Spenderbescheinigung" | "other";
  label: string;
  dueDate: string;
  clientId?: string;
  clientName?: string;
  recurring: "monthly" | "quarterly" | "annually" | "none";
  daysRemaining: number;
  isOverdue: boolean;
  isUrgent: boolean;
  notes?: string;
}
