// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const sent = vi.hoisted(() => [] as Array<{ to: unknown; subject: string }>);
vi.mock("@/lib/mail", () => ({
  isMailConfigured: () => Boolean(process.env.RESEND_API_KEY),
  sendMail: async (m: { to: unknown; subject: string }) => {
    sent.push(m);
    return { sent: true };
  },
}));

import { notifyOps } from "./ops-alert";

afterEach(() => {
  sent.length = 0;
  vi.unstubAllEnvs();
});

describe("notifyOps", () => {
  it("mails QUEUE_ALERT_EMAIL when mail is configured", async () => {
    vi.stubEnv("QUEUE_ALERT_EMAIL", "ops@example.test");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    expect(await notifyOps("s", "t")).toEqual({ notified: true });
    expect(sent[0]!.to).toBe("ops@example.test");
  });

  it("reports notified:false without a channel instead of pretending", async () => {
    vi.stubEnv("QUEUE_ALERT_EMAIL", "");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    expect(await notifyOps("s", "t")).toEqual({ notified: false });
    expect(sent).toHaveLength(0);
  });
});
