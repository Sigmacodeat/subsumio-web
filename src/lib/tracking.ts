/**
 * PostHog Event Tracking — Key User Journeys
 *
 * Centralized tracking utility that respects analytics consent.
 * All events are prefixed with `subsumio_` for namespace clarity.
 */

type EventProperties = Record<string, string | number | boolean | undefined | null>;

function isPostHogAvailable(): boolean {
  if (typeof window === "undefined") return false;
  return typeof (window as unknown as { posthog?: unknown }).posthog !== "undefined";
}

function getConsent(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("sb_analytics_consent");
}

/**
 * Track a custom event in PostHog.
 * Silently no-ops if PostHog is not loaded or consent is not given.
 */
export function track(event: string, properties?: EventProperties): void {
  if (!isPostHogAvailable()) return;
  if (getConsent() !== "accepted") return;

  try {
    const ph = (
      window as unknown as { posthog?: { capture: (e: string, p?: EventProperties) => void } }
    ).posthog;
    ph?.capture(`subsumio_${event}`, properties);
  } catch {
    // best-effort — tracking should never break the app
  }
}

/**
 * Identify a user in PostHog with their user ID and properties.
 */
export function identifyUser(userId: string, properties?: EventProperties): void {
  if (!isPostHogAvailable()) return;
  if (getConsent() !== "accepted") return;

  try {
    const ph = (
      window as unknown as { posthog?: { identify: (id: string, p?: EventProperties) => void } }
    ).posthog;
    ph?.identify(userId, properties);
  } catch {
    // best-effort
  }
}

/**
 * Reset the identified user (e.g. on logout).
 */
export function resetUser(): void {
  if (!isPostHogAvailable()) return;

  try {
    const ph = (window as unknown as { posthog?: { reset: () => void } }).posthog;
    ph?.reset();
  } catch {
    // best-effort
  }
}

// ── Key User Journey Events ──────────────────────────────────────────────

export const tracking = {
  // Auth journey
  auth: {
    loginSuccess(method: string) {
      track("auth_login_success", { method });
    },
    loginFailed(reason: string) {
      track("auth_login_failed", { reason });
    },
    signupStart() {
      track("auth_signup_start");
    },
    signupSuccess(method: string) {
      track("auth_signup_success", { method });
    },
    logout() {
      track("auth_logout");
    },
  },

  // Case management journey
  cases: {
    created(caseType?: string) {
      track("case_created", { case_type: caseType });
    },
    viewed(caseSlug: string) {
      track("case_viewed", { case_slug: caseSlug });
    },
    updated(caseSlug: string, field: string) {
      track("case_updated", { case_slug: caseSlug, field });
    },
    deleted(caseSlug: string) {
      track("case_deleted", { case_slug: caseSlug });
    },
  },

  // AI Chat journey
  chat: {
    messageSent(messageLength: number) {
      track("chat_message_sent", { message_length: messageLength });
    },
    responseRated(rating: "up" | "down") {
      track("chat_response_rated", { rating });
    },
    sourceClicked(sourceCount: number) {
      track("chat_source_clicked", { source_count: sourceCount });
    },
  },

  // Deadline journey
  deadlines: {
    created(caseSlug: string) {
      track("deadline_created", { case_slug: caseSlug });
    },
    alertViewed(caseSlug: string, urgency: string) {
      track("deadline_alert_viewed", { case_slug: caseSlug, urgency });
    },
  },

  // Time tracking journey
  timeTracking: {
    started(caseSlug?: string) {
      track("time_tracking_started", { case_slug: caseSlug });
    },
    stopped(durationMinutes: number, caseSlug?: string) {
      track("time_tracking_stopped", { duration_minutes: durationMinutes, case_slug: caseSlug });
    },
    entryCreated(caseSlug: string, minutes: number) {
      track("time_entry_created", { case_slug: caseSlug, minutes });
    },
    entryEdited(caseSlug: string) {
      track("time_entry_edited", { case_slug: caseSlug });
    },
    entryDeleted(caseSlug: string) {
      track("time_entry_deleted", { case_slug: caseSlug });
    },
    exported(format: "csv" | "pdf") {
      track("time_exported", { format });
    },
  },

  // Document journey
  documents: {
    uploaded(fileType: string, fileSize: number) {
      track("document_uploaded", { file_type: fileType, file_size: fileSize });
    },
    analyzed(docSlug: string) {
      track("document_analyzed", { doc_slug: docSlug });
    },
    drafted(docType: string) {
      track("document_drafted", { doc_type: docType });
    },
  },

  // Billing journey
  billing: {
    planViewed(plan: string) {
      track("billing_plan_viewed", { plan });
    },
    checkoutStarted(plan: string) {
      track("billing_checkout_started", { plan });
    },
    checkoutCompleted(plan: string) {
      track("billing_checkout_completed", { plan });
    },
    invoicePaid(amount: number) {
      track("billing_invoice_paid", { amount });
    },
  },

  // Intake journey
  intake: {
    submitted(legalArea: string, source: string) {
      track("intake_submitted", { legal_area: legalArea, source });
    },
    approved(slug: string) {
      track("intake_approved", { slug });
    },
  },

  // Autonomous engine journey
  autonomous: {
    taskStarted(taskType: string) {
      track("autonomous_task_started", { task_type: taskType });
    },
    taskCompleted(taskType: string, status: string) {
      track("autonomous_task_completed", { task_type: taskType, status });
    },
    approvalGranted(taskId: string) {
      track("autonomous_approval_granted", { task_id: taskId });
    },
    approvalDenied(taskId: string) {
      track("autonomous_approval_denied", { task_id: taskId });
    },
  },

  // Notification journey
  notifications: {
    viewed() {
      track("notifications_viewed");
    },
    markRead(notificationId: string) {
      track("notification_marked_read", { notification_id: notificationId });
    },
    markAllRead() {
      track("notifications_all_marked_read");
    },
    deleted(notificationId: string) {
      track("notification_deleted", { notification_id: notificationId });
    },
    bellClicked() {
      track("notification_bell_clicked");
    },
  },

  // Backup/Restore journey
  backup: {
    created(totalPages: number) {
      track("backup_created", { total_pages: totalPages });
    },
    restored(restored: number, failed: number) {
      track("backup_restored", { restored, failed });
    },
    downloaded(backupId: string) {
      track("backup_downloaded", { backup_id: backupId });
    },
    deleted(backupId: string) {
      track("backup_deleted", { backup_id: backupId });
    },
  },

  // Feature usage
  features: {
    searchUsed(query: string) {
      track("feature_search_used", { query_length: query.length });
    },
    commandPaletteOpened() {
      track("command_palette_opened");
    },
    voiceInputUsed() {
      track("voice_input_used");
    },
    mobileTabChanged(tab: string) {
      track("mobile_tab_changed", { tab });
    },
  },
};
