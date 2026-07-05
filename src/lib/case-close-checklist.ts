/**
 * Case Close Checklist — Pre-Archive Validation
 *
 * Verifies that all critical preconditions are met before a case
 * can be archived. Each check returns a structured result with
 * i18n key, severity, and count of pending items.
 */

export interface ChecklistItem {
  key: string;
  labelKey: string;
  descriptionKey: string;
  passed: boolean;
  count: number;
  severity: "blocker" | "warning";
}

export interface CaseCloseChecklist {
  items: ChecklistItem[];
  hasBlockers: boolean;
  blockerCount: number;
  warningCount: number;
}

export interface CaseChecklistInput {
  timeEntries: Array<{ billed?: boolean; billable?: boolean }>;
  expenses: Array<{ billed?: boolean; billable?: boolean }>;
  deadlines: Array<{ status?: string }>;
  documentRequests: Array<{ status?: string }>;
  invoices: Array<{ status?: string }>;
}

/**
 * Evaluates all pre-conditions for archiving a case.
 * Returns a structured checklist with blockers (must fix) and warnings (should review).
 */
export function evaluateCaseCloseChecklist(input: CaseChecklistInput): CaseCloseChecklist {
  const items: ChecklistItem[] = [];

  // 1. Unbilled time entries
  const unbilledTime = input.timeEntries.filter((e) => e.billable !== false && !e.billed);
  items.push({
    key: "unbilled_time",
    labelKey: "checklist.unbilled_time_label",
    descriptionKey: "checklist.unbilled_time_desc",
    passed: unbilledTime.length === 0,
    count: unbilledTime.length,
    severity: "blocker",
  });

  // 2. Unbilled expenses
  const unbilledExpenses = input.expenses.filter((e) => e.billable !== false && !e.billed);
  items.push({
    key: "unbilled_expenses",
    labelKey: "checklist.unbilled_expenses_label",
    descriptionKey: "checklist.unbilled_expenses_desc",
    passed: unbilledExpenses.length === 0,
    count: unbilledExpenses.length,
    severity: "blocker",
  });

  // 3. Open/pending deadlines
  const openDeadlines = input.deadlines.filter(
    (d) => !d.status || d.status === "pending" || d.status === "warning" || d.status === "critical"
  );
  items.push({
    key: "open_deadlines",
    labelKey: "checklist.open_deadlines_label",
    descriptionKey: "checklist.open_deadlines_desc",
    passed: openDeadlines.length === 0,
    count: openDeadlines.length,
    severity: "blocker",
  });

  // 4. Unfulfilled document requests
  const openDocRequests = input.documentRequests.filter(
    (r) => r.status !== "fulfilled" && r.status !== "expired"
  );
  items.push({
    key: "open_doc_requests",
    labelKey: "checklist.open_doc_requests_label",
    descriptionKey: "checklist.open_doc_requests_desc",
    passed: openDocRequests.length === 0,
    count: openDocRequests.length,
    severity: "warning",
  });

  // 5. Unpaid invoices
  const unpaidInvoices = input.invoices.filter(
    (inv) => inv.status === "sent" || inv.status === "overdue" || inv.status === "draft"
  );
  items.push({
    key: "unpaid_invoices",
    labelKey: "checklist.unpaid_invoices_label",
    descriptionKey: "checklist.unpaid_invoices_desc",
    passed: unpaidInvoices.length === 0,
    count: unpaidInvoices.length,
    severity: "blocker",
  });

  const blockers = items.filter((i) => !i.passed && i.severity === "blocker");
  const warnings = items.filter((i) => !i.passed && i.severity === "warning");

  return {
    items,
    hasBlockers: blockers.length > 0,
    blockerCount: blockers.length,
    warningCount: warnings.length,
  };
}
