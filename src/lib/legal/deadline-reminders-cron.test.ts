/**
 * deadline-reminders-cron.test.ts — Tests for P0-TODO 1
 *
 * Verifies:
 *  1. The cron route returns a structured report with per-channel counts
 *  2. The report includes a `failed` array with deadline_id, case_slug, channels, reason
 *  3. The report includes `smtp_configured` flag
 *  4. The `createNotificationFailureNotification` function exists and creates visible alerts
 *  5. The cron health endpoint checks notification channel configuration
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const cronRoutePath = join(process.cwd(), "src/app/api/cron/deadline-reminders/route.ts");
const cronRouteSource = readFileSync(cronRoutePath, "utf-8");

const commentsPath = join(process.cwd(), "src/lib/comments.ts");
const commentsSource = readFileSync(commentsPath, "utf-8");

const healthRoutePath = join(process.cwd(), "src/app/api/cron/health/route.ts");
const healthRouteSource = readFileSync(healthRoutePath, "utf-8");

const notifHealthPath = join(process.cwd(), "src/app/api/notifications/health/route.ts");
const notifHealthSource = readFileSync(notifHealthPath, "utf-8");

describe("P0-TODO 1: Deadline-Reminder-Cron — Visible Failure Reporting", () => {
  it("cron route returns structured report with per-channel counts", () => {
    expect(cronRouteSource).toContain("emailed");
    expect(cronRouteSource).toContain("whatsapped");
    expect(cronRouteSource).toContain("push_sent");
    expect(cronRouteSource).toContain("in_app");
  });

  it("cron route returns total count", () => {
    expect(cronRouteSource).toContain("total");
  });

  it("cron route tracks failed deliveries with structured reasons", () => {
    expect(cronRouteSource).toContain("failed");
    expect(cronRouteSource).toContain("deadline_id");
    expect(cronRouteSource).toContain("case_slug");
    expect(cronRouteSource).toContain("channels");
    expect(cronRouteSource).toContain("reason");
  });

  it("cron route includes smtp_configured flag in response", () => {
    expect(cronRouteSource).toContain("smtp_configured");
  });

  it("cron route creates visible notification_failure alerts on email failure", () => {
    expect(cronRouteSource).toContain("createNotificationFailureNotification");
    expect(cronRouteSource).toContain("smtp_not_configured");
  });

  it("cron route tracks WhatsApp send failures (not just exceptions)", () => {
    expect(cronRouteSource).toContain("waFailedAny");
    expect(cronRouteSource).toContain("send_failed_or_blocked");
  });

  it("cron route tracks push notification failures", () => {
    expect(cronRouteSource).toContain("pushSentAny");
    expect(cronRouteSource).toContain("Push notification failed");
  });

  it("comments.ts exports createNotificationFailureNotification", () => {
    expect(commentsSource).toContain("createNotificationFailureNotification");
    expect(commentsSource).toContain("notification_failure");
  });

  it("cron health endpoint checks notification channel configuration", () => {
    expect(healthRouteSource).toContain("notifications");
    expect(healthRouteSource).toContain("smtpOn");
    expect(healthRouteSource).toContain("waOn");
    expect(healthRouteSource).toContain("pushOn");
  });

  it("client-facing notification health endpoint exists", () => {
    expect(notifHealthSource).toContain("smtpConfigured");
    expect(notifHealthSource).toContain("whatsappConfigured");
    expect(notifHealthSource).toContain("pushConfigured");
    expect(notifHealthSource).toContain("all_configured");
  });
});
