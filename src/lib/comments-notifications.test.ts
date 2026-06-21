// @vitest-environment node

// Dedicated test for the notification ownership scoping fixed in
// markNotificationRead — previously any authenticated caller could mark
// (and thereby confirm the existence of) another user's notification as
// read just by knowing/guessing its ID. This exercises the file-fallback
// adapter (no DATABASE_URL in test env) with an isolated temp data dir per
// test, since the module computes its data file path at import time.

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import { mkdtempSync } from "node:fs";
import path from "node:path";
import os from "node:os";

describe("markNotificationRead — ownership scoping", () => {
  let tmpDir: string;
  let originalDataDir: string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "subsumio-notif-test-"));
    originalDataDir = process.env.SUBSUMIO_DATA_DIR;
    process.env.SUBSUMIO_DATA_DIR = tmpDir;
    vi.resetModules();
  });

  afterEach(async () => {
    if (originalDataDir !== undefined) {
      process.env.SUBSUMIO_DATA_DIR = originalDataDir;
    } else {
      delete process.env.SUBSUMIO_DATA_DIR;
    }
    vi.resetModules();
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  test("a user cannot mark another user's notification as read", async () => {
    const { createDeadlineNotification, markNotificationRead, listNotifications } =
      await import("./comments");

    // Deadline notification IDs are deterministic (notif_dl_<slug>_<date>),
    // so attacker A can construct victim B's notification ID without ever
    // having seen it.
    await createDeadlineNotification({
      userId: "victim-b",
      brainId: "brain-1",
      caseSlug: "cases/2026-001",
      caseTitle: "Victim's Case",
      deadlineDate: "2026-07-01",
      daysRemaining: 5,
      isOverdue: false,
    });

    const victimNotifsBefore = await listNotifications({ userId: "victim-b", brainId: "brain-1" });
    expect(victimNotifsBefore).toHaveLength(1);
    expect(victimNotifsBefore[0].readAt).toBeNull();
    const notifId = victimNotifsBefore[0].id;

    // Attacker A (different user, same or different brain) tries to mark
    // victim B's notification as read by guessing/constructing its ID.
    await markNotificationRead(notifId, { userId: "attacker-a", brainId: "brain-1" });

    const victimNotifsAfter = await listNotifications({ userId: "victim-b", brainId: "brain-1" });
    expect(victimNotifsAfter[0].readAt).toBeNull();
  });

  test("a user CAN mark their own notification as read", async () => {
    const { createDeadlineNotification, markNotificationRead, listNotifications } =
      await import("./comments");

    await createDeadlineNotification({
      userId: "user-1",
      brainId: "brain-1",
      caseSlug: "cases/2026-002",
      caseTitle: "My Case",
      deadlineDate: "2026-07-02",
      daysRemaining: 3,
      isOverdue: false,
    });

    const before = await listNotifications({ userId: "user-1", brainId: "brain-1" });
    const notifId = before[0].id;

    await markNotificationRead(notifId, { userId: "user-1", brainId: "brain-1" });

    const after = await listNotifications({ userId: "user-1", brainId: "brain-1" });
    expect(after[0].readAt).not.toBeNull();
  });

  test("cross-brain access is denied even for the same userId", async () => {
    const { createDeadlineNotification, markNotificationRead, listNotifications } =
      await import("./comments");

    await createDeadlineNotification({
      userId: "user-1",
      brainId: "brain-a",
      caseSlug: "cases/2026-003",
      caseTitle: "Brain A Case",
      deadlineDate: "2026-07-03",
      daysRemaining: 1,
      isOverdue: true,
    });

    const before = await listNotifications({ userId: "user-1", brainId: "brain-a" });
    const notifId = before[0].id;

    // Same userId, but scoped to a different brain — must not be able to
    // mark a notification belonging to another tenant's brain.
    await markNotificationRead(notifId, { userId: "user-1", brainId: "brain-b" });

    const after = await listNotifications({ userId: "user-1", brainId: "brain-a" });
    expect(after[0].readAt).toBeNull();
  });
});
