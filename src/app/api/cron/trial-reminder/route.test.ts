import { describe, test, expect, vi, beforeEach } from "vitest";
import { trialEndsAtFrom, TRIAL_DAYS } from "@/lib/billing/trial";
import { REMIND_AT_DAYS_LEFT, trialReminderMail } from "./route";

const users: Array<Record<string, unknown>> = [];
const update = vi.fn(async () => undefined);
const sendMail = vi.fn(async (..._a: unknown[]) => ({ ok: true }));

vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({ list: async () => users, update }),
}));
vi.mock("@/lib/mail", () => ({
  sendMail: (...args: unknown[]) => sendMail(...args),
  siteUrl: () => "https://app.subsum.io",
}));
vi.mock("@/lib/api-handler", () => ({
  // The cron auth itself is covered by its own tests.
  createCronHandler: (handler: (req: unknown) => Promise<Response>) => handler,
}));

const DAY = 24 * 60 * 60 * 1000;
/** A trial that started so long ago that `daysLeft` is exactly `left`. */
const startedFor = (left: number) =>
  trialEndsAtFrom(new Date(Date.now() - (TRIAL_DAYS - left) * DAY));

async function run() {
  const { GET } = await import("./route");
  return (await (GET as unknown as (req: unknown) => Promise<Response>)({})).json();
}

beforeEach(() => {
  users.length = 0;
  vi.clearAllMocks();
  vi.resetModules();
});

describe("trial reminder", () => {
  test("mails an account whose trial ends within three days, once", async () => {
    users.push({
      id: "u1",
      email: "kanzlei@example.at",
      name: "Dr. Beispiel",
      plan: "free",
      trialEndsAt: startedFor(REMIND_AT_DAYS_LEFT),
    });

    expect(await run()).toMatchObject({ sent: 1, failed: 0 });
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith("u1", {
      trialReminderSentAt: expect.stringContaining("T"),
    });

    // Second run: the stamp is set, so nothing goes out again.
    users[0].trialReminderSentAt = new Date().toISOString();
    expect(await run()).toMatchObject({ sent: 0 });
  });

  test("leaves everyone else alone", async () => {
    users.push(
      { id: "early", email: "a@example.at", plan: "free", trialEndsAt: startedFor(10) },
      { id: "paid", email: "b@example.at", plan: "team", trialEndsAt: startedFor(2) },
      { id: "expired", email: "c@example.at", plan: "free", trialEndsAt: startedFor(-1) },
      { id: "no-trial", email: "d@example.at", plan: "free", trialEndsAt: null },
      {
        id: "gone",
        email: "e@example.at",
        plan: "free",
        trialEndsAt: startedFor(1),
        deactivatedAt: new Date().toISOString(),
      }
    );
    expect(await run()).toMatchObject({ sent: 0 });
    expect(sendMail).not.toHaveBeenCalled();
  });

  test("a failed mail does not consume the reminder", async () => {
    users.push({ id: "u2", email: "x@example.at", plan: "free", trialEndsAt: startedFor(2) });
    sendMail.mockRejectedValueOnce(new Error("smtp down"));

    expect(await run()).toMatchObject({ sent: 0, failed: 1 });
    expect(update).not.toHaveBeenCalled();
  });

  test("the mail says when the trial ends and where to choose a plan", () => {
    const mail = trialReminderMail("Dr. Beispiel", 3, "2026-10-20T08:00:00.000Z");
    expect(mail.subject).toContain("3 Tagen");
    expect(mail.text).toContain("20.10.2026");
    expect(mail.text).toContain("/dashboard/billing");
    expect(mail.text).toContain("Community");
  });
});
