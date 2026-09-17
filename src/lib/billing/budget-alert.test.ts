import { beforeEach, describe, expect, it, vi } from "vitest";

const sentAlerts = new Set<number>();
const recorded: number[] = [];
let peak = 100;

const query = vi.fn(async (sql: string, params: unknown[] = []) => {
  if (sql.includes("MAX(balance_after)")) return { rows: [{ peak }] };
  if (sql.includes("SELECT 1 FROM subsumio_credit_alerts")) {
    return { rows: sentAlerts.has(Number(params[1])) ? [{ 1: 1 }] : [] };
  }
  if (sql.includes("INSERT INTO subsumio_credit_alerts")) {
    recorded.push(Number(params[2]));
    sentAlerts.add(Number(params[2]));
    return { rows: [] };
  }
  return { rows: [] };
});

const mail = vi.fn(async (_input: { to: string; subject: string; text: string }) => ({
  sent: true,
}));

vi.mock("@/lib/auth/store", () => ({
  getSharedPgPool: () => ({ query }),
  getOrgStore: () => ({
    getById: async (id: string) => (id === "org_1" ? { id: "org_1", ownerId: "owner" } : null),
  }),
  getStore: () => ({
    listByOrg: async () => [
      { id: "owner", email: "partner@kanzlei.example", role: "lawyer" },
      { id: "admin", email: "office@kanzlei.example", role: "admin" },
      { id: "assist", email: "assistenz@kanzlei.example", role: "assistant" },
      { id: "gone", email: "alt@kanzlei.example", role: "admin", deactivatedAt: "2026-01-01" },
    ],
    getById: async () => null,
  }),
}));
vi.mock("@/lib/mail", () => ({
  isMailConfigured: () => true,
  sendMail: (input: { to: string; subject: string; text: string }) => mail(input),
}));

import { checkAndSendBudgetAlert } from "./credits";

describe("checkAndSendBudgetAlert", () => {
  beforeEach(() => {
    sentAlerts.clear();
    recorded.length = 0;
    mail.mockClear();
    peak = 100;
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.subsum.io");
  });

  it("sends the most severe threshold first on a sudden drop and covers milder ones", async () => {
    const result = await checkAndSendBudgetAlert("org_1", "org", "assistenz@kanzlei.example", 5);
    expect(result).toMatchObject({ triggered: true, threshold: 90 });
    expect(recorded.sort()).toEqual([50, 75, 90]);

    // Milder thresholds are not sent afterwards.
    const again = await checkAndSendBudgetAlert("org_1", "org", "assistenz@kanzlei.example", 4);
    expect(again.triggered).toBe(false);
  });

  it("states the remaining share, links to the app billing page and warns the firm's owner and admins", async () => {
    await checkAndSendBudgetAlert("org_1", "org", "assistenz@kanzlei.example", 8);
    const recipients = mail.mock.calls.map(([m]) => m.to).sort();
    expect(recipients).toEqual(["office@kanzlei.example", "partner@kanzlei.example"]);
    const [first] = mail.mock.calls[0];
    expect(first.subject).toContain("nur noch 10 %");
    expect(first.text).toContain("https://app.subsum.io/dashboard/billing");
    expect(first.text).not.toContain("subsum.io");
  });

  it("does not alert above the first threshold", async () => {
    const result = await checkAndSendBudgetAlert("org_1", "org", "x@kanzlei.example", 60);
    expect(result.triggered).toBe(false);
    expect(mail).not.toHaveBeenCalled();
  });
});
