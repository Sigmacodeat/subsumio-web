import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

type Fm = Record<string, unknown>;
const state = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  caseFm: {} as Record<string, unknown>,
  feeAgreements: [] as Array<Record<string, unknown>>,
  feeListFails: false,
  created: [] as Array<{ frontmatter: Record<string, unknown> }>,
}));

vi.mock("@/lib/api", () => ({
  api: {
    brain: {
      batchListPagesDetailed: vi.fn(async (types: string[]) => {
        if (types.includes("fee_agreement")) {
          if (state.feeListFails) return { results: {}, errors: ["fee_agreement"] };
          return {
            results: { fee_agreement: state.feeAgreements.map((fm) => ({ frontmatter: fm })) },
            errors: [],
          };
        }
        return {
          results: {
            invoice: [],
            legal_case: [
              { slug: "cases/a", title: "Akte A", created_at: "", frontmatter: state.caseFm },
            ],
          },
          errors: [],
        };
      }),
      getPage: vi.fn(async () => ({ frontmatter: {} })),
    },
    invoices: {
      create: vi.fn(async (payload: { frontmatter: Fm }) => {
        state.created.push(payload);
        return {};
      }),
    },
  },
}));

vi.mock("@/lib/kanzlei-settings", async (orig) => ({
  ...(await orig<typeof import("@/lib/kanzlei-settings")>()),
  loadKanzleiSettings: vi.fn(async () => state.settings),
}));
vi.mock("@/lib/csrf", () => ({
  csrfFetch: vi.fn(async () => Response.json({ data: { number: "R-2026-0001" } })),
}));
vi.mock("@/lib/use-lang", () => ({ useLang: () => ({ t: (k: string) => k, lang: "de" }) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock("@/lib/queries/auth", () => ({ useMe: () => ({ data: undefined }) }));
vi.mock("@/lib/offline-store", () => ({
  isOnline: () => true,
  getCache: vi.fn(async () => null),
  setCache: vi.fn(async () => {}),
  OFFLINE_KEYS: { invoices: "invoices" },
}));
for (const form of [
  "RatgTariffForm",
  "AhkTariffForm",
  "GggTariffForm",
  "NtgTariffForm",
  "GkgTariffForm",
  "JvegTariffForm",
  "RvgTariffForm",
]) {
  vi.doMock(`@/components/legal/${form}`, () => ({ [form]: () => null }));
}
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

const { InvoiceQuickCreateDialog } = await import("./InvoiceQuickCreateDialog");
const { activeBillingRules, checkTimeItemBilling, checkTimeItemsAgainstEntries, feeAgreementRate } =
  await import("@/lib/billing-rules");

/** The server's check against the STORED entries (POST /api/invoices, R6-10). */
function serverRecordCheck(fm: Record<string, unknown>) {
  const entries = state.caseFm.time_entries as Array<{
    id: string;
    description: string;
    minutes: number;
  }>;
  const stored = new Map(entries.map((e) => [e.id, e]));
  return checkTimeItemsAgainstEntries(fm, stored, activeBillingRules(state.settings), {
    feeAgreementRate: feeAgreementRate(state.feeAgreements, "cases/a"),
    legalArea: String(state.caseFm.legal_area ?? ""),
    settings: state.settings,
  });
}
const { checkStoredInvoiceTotals } = await import("@/lib/invoice-totals");

async function createInvoice() {
  render(<InvoiceQuickCreateDialog open onOpenChange={() => {}} presetCaseSlug="cases/a" />);
  const button = await screen.findByRole("button", { name: /inv\.create/ });
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
  // What the dialog shows before creating (the entries are billed afterwards).
  shownPositions = screen.queryByTestId("billing-rules-positions")?.textContent ?? null;
  fireEvent.click(button);
  await waitFor(() => expect(state.created).toHaveLength(1));
  return state.created[0].frontmatter;
}
let shownPositions: string | null = null;

beforeEach(() => {
  state.created = [];
  state.feeAgreements = [];
  state.feeListFails = false;
  state.caseFm = {
    type: "legal_case",
    case_number: "AZ-1",
    legal_area: "Arbeitsrecht",
    time_entries: [
      { id: "t1", description: "Telefonat", minutes: 22, date: "2026-09-01" },
      { id: "t2", description: "Schriftsatz", minutes: 20, date: "2026-09-02" },
    ],
    expenses: [],
  };
});

describe("InvoiceQuickCreateDialog — Abrechnungsregeln (OPS-16)", () => {
  it("switch off: positions exactly as before, even with increment and area rates stored", async () => {
    state.settings = {
      stundensatz: "200",
      abrechnungstakt: "10",
      rechtsgebietSaetze: { arbeitsrecht: 230 },
    };
    const fm = await createInvoice();
    expect(fm.items).toEqual([
      {
        description: "Telefonat",
        date: "2026-09-01",
        hours: 0.3667,
        rate: 200,
        amount: 73.33,
        time_entry_id: "t1",
      },
      {
        description: "Schriftsatz",
        date: "2026-09-02",
        hours: 0.3333,
        rate: 200,
        amount: 66.67,
        time_entry_id: "t2",
      },
    ]);
    expect(fm.subtotal).toBe(140);
    expect(shownPositions).toBeNull();
    expect(checkTimeItemBilling(fm, activeBillingRules(state.settings))).toEqual([]);
    expect(serverRecordCheck(fm)).toEqual([]);
    expect(checkStoredInvoiceTotals(fm)).toEqual([]);
  });

  it("switch on: rounded up to the increment, practice-area rate, both minutes stored", async () => {
    state.settings = {
      billingRulesEnabled: true,
      stundensatz: "200",
      abrechnungstakt: "10",
      rechtsgebietSaetze: { arbeitsrecht: 230 },
    };
    const fm = await createInvoice();
    expect(fm.items).toEqual([
      expect.objectContaining({
        recorded_minutes: 22,
        billed_minutes: 30,
        hours: 0.5,
        rate: 230,
        amount: 115,
        rate_source: "legal_area",
      }),
      expect.objectContaining({
        recorded_minutes: 20,
        billed_minutes: 20,
        rate: 230,
        amount: 76.67,
        rate_source: "legal_area",
      }),
    ]);
    // The time entries of the matter keep their recorded minutes.
    expect((state.caseFm.time_entries as Fm[]).map((e) => e.minutes)).toEqual([22, 20]);
    // What the dialog sends passes the server's check with the same rules.
    expect(checkTimeItemBilling(fm, activeBillingRules(state.settings))).toEqual([]);
    expect(serverRecordCheck(fm)).toEqual([]);
    expect(checkStoredInvoiceTotals(fm)).toEqual([]);
    expect(shownPositions).toContain("22 min → 30 min");
    expect(shownPositions).toContain("Satz je Rechtsgebiet");
  });

  it("switch on: the matter's fee agreement beats the practice-area rate", async () => {
    state.settings = {
      billingRulesEnabled: true,
      stundensatz: "200",
      abrechnungstakt: "15",
      rechtsgebietSaetze: { arbeitsrecht: 230 },
    };
    state.feeAgreements = [{ case_slug: "cases/a", hourly_rate: 300, updated_at: "2026-09-01" }];
    const fm = await createInvoice();
    const items = fm.items as Fm[];
    expect(items.map((i) => [i.billed_minutes, i.rate, i.rate_source])).toEqual([
      [30, 300, "fee_agreement"],
      [30, 300, "fee_agreement"],
    ]);
    expect(shownPositions).toContain("Honorarvereinbarung der Akte");
  });

  it("switch on: unreadable fee agreements block the invoice", async () => {
    state.settings = { billingRulesEnabled: true, stundensatz: "200", abrechnungstakt: "10" };
    state.feeListFails = true;
    render(<InvoiceQuickCreateDialog open onOpenChange={() => {}} presetCaseSlug="cases/a" />);
    await screen.findByText(/Honorarvereinbarungen konnten nicht geladen werden/);
    const button = screen.getByRole("button", { name: /inv\.create/ });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });
});
