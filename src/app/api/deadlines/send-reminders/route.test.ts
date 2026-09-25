// @vitest-environment node
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.fn(async () => ({}));
vi.mock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail }) } }));
const createDeadlineNotification = vi.fn(async () => undefined);
vi.mock("@/lib/comments", () => ({
  createDeadlineNotification: (...a: unknown[]) => createDeadlineNotification(...(a as [])),
}));
let smtp = true;
vi.mock("@/lib/kanzlei-settings-server", () => ({
  loadKanzleiSettingsForBrain: vi.fn(async () =>
    smtp ? { smtpHost: "h", smtpUser: "u", smtpPassword: "p", emailFrom: "k@example.com" } : {}
  ),
  isSmtpConfigured: (s: Record<string, unknown>) => !!s.smtpHost,
}));
const loadFristenReadModel = vi.fn();
vi.mock("@/lib/fristen-read-model", () => ({
  DEADLINE_SOURCES: ["fristenbuch", "legal_deadline", "legal_case"],
  loadFristenReadModel: (...a: unknown[]) => loadFristenReadModel(...a),
}));
let session: { id: string; email: string; role: string } | null;
vi.mock("@/lib/api-handler", () => ({
  createHandler: (opts: { action: string }, handler: (ctx: unknown) => Promise<Response>) => {
    return async () => {
      if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
      // brain.write — client_viewer has no write permission.
      if (opts.action === "brain.write" && session.role === "client_viewer") {
        return Response.json({ error: "forbidden" }, { status: 403 });
      }
      return handler({ headers: { "x-brain": "brain-own" }, brainId: "brain-own", user: session });
    };
  },
  apiSuccess: (data: unknown) => Response.json({ data }),
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
}));

import { POST } from "./route";

const call = () => (POST as unknown as () => Promise<Response>)();

beforeEach(() => {
  vi.clearAllMocks();
  smtp = true;
  session = { id: "u1", email: "anwalt@example.com", role: "lawyer" };
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-10T09:00:00Z"));
  loadFristenReadModel.mockResolvedValue({
    fristen: [
      { id: "a", title: "Berufung", due_date: "2026-03-12", status: "critical", is_notfrist: true },
      { id: "b", title: "Replik", due_date: "2026-06-01", status: "pending" },
      { id: "c", title: "Erledigt", due_date: "2026-03-11", status: "done" },
    ],
    failedSources: [],
  });
});

describe("POST /api/deadlines/send-reminders (UI-2)", () => {
  it("401 without a session", async () => {
    session = null;
    expect((await call()).status).toBe(401);
    expect(loadFristenReadModel).not.toHaveBeenCalled();
  });

  it("sends the caller's own firm's due deadlines only to the caller", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ sentCount: 1, emailed: true });
    // Own firm only: the read model runs with the session's headers.
    expect(loadFristenReadModel).toHaveBeenCalledWith(
      { "x-brain": "brain-own" },
      expect.objectContaining({ heute: "2026-03-10" })
    );
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0]).toMatchObject({ to: "anwalt@example.com" });
    expect(createDeadlineNotification).toHaveBeenCalledTimes(1);
    expect(createDeadlineNotification.mock.calls[0][0]).toMatchObject({
      userId: "u1",
      brainId: "brain-own",
    });
  });

  it("without SMTP only in-app, and says so", async () => {
    smtp = false;
    const res = await call();
    expect((await res.json()).data).toMatchObject({ emailed: false, smtpConfigured: false });
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe("no browser code calls a cron route (UI-2)", () => {
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) return files(p);
      return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
    });
  }

  it("src/app/dashboard and src/components never fetch /api/cron/*", () => {
    const offenders = [
      ...files(path.join(process.cwd(), "src/app/dashboard")),
      ...files(path.join(process.cwd(), "src/components")),
    ].filter((f) => /["'`]\/api\/cron\//.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
