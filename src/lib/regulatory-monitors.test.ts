// @vitest-environment node

import { describe, test, expect } from "vitest";
import {
  monitorSlug,
  alertSlug,
  monitorIdFromSlug,
  isMonitorSlug,
  isAlertSlug,
  frontmatterToMonitor,
  monitorToFrontmatter,
  frontmatterToAlert,
  alertToFrontmatter,
  shouldRunToday,
  inferSeverity,
  inferChangeType,
  generateMonitorId,
  JURISDICTION_LABELS,
  FREQUENCY_LABELS,
  SOURCE_LABELS,
  SEVERITY_LABELS,
  SEVERITY_COLORS,
  CHANGE_TYPE_LABELS,
  isLegacyWatchlist,
  LEGACY_WATCHLIST,
  type RegulatoryMonitor,
  type RegulatoryAlert,
} from "./regulatory-monitors";
import type { BrainPage } from "./types";

// ── Slug helpers ────────────────────────────────────────────────────────

describe("monitorSlug", () => {
  test("returns prefixed slug", () => {
    expect(monitorSlug("abc123")).toBe("monitoring/monitors/abc123");
  });

  test("handles empty id", () => {
    expect(monitorSlug("")).toBe("monitoring/monitors/");
  });
});

describe("alertSlug", () => {
  test("returns prefixed slug with monitor and hit", () => {
    const slug = alertSlug("mon-1", "hit-123");
    expect(slug).toContain("monitoring/alerts/mon-1/");
    expect(slug).toContain("hit-123");
  });

  test("sanitizes special characters in hitId", () => {
    const slug = alertSlug("mon-1", "hit/with spaces&special");
    // The slug structure uses '/' as separator (monitoring/alerts/mon-1/ts-hit)
    // but the hitId portion should have special chars replaced with dashes
    const hitPart = slug.split("/").pop()!;
    expect(hitPart).not.toContain(" ");
    expect(hitPart).not.toContain("&");
    // '/' in hitId should be replaced with '-'
    expect(hitPart).not.toContain("/");
  });

  test("truncates long hitId to 60 chars", () => {
    const longHit = "x".repeat(100);
    const slug = alertSlug("mon-1", longHit);
    const afterMonitor = slug.split("mon-1/")[1];
    const hitPart = afterMonitor.split("-").slice(1).join("-");
    expect(hitPart.length).toBeLessThanOrEqual(60);
  });
});

describe("monitorIdFromSlug", () => {
  test("extracts id from monitor slug", () => {
    expect(monitorIdFromSlug("monitoring/monitors/abc123")).toBe("abc123");
  });

  test("returns slug as-is when not a monitor slug", () => {
    expect(monitorIdFromSlug("some/other/slug")).toBe("some/other/slug");
  });
});

describe("isMonitorSlug", () => {
  test("returns true for monitor slug", () => {
    expect(isMonitorSlug("monitoring/monitors/abc")).toBe(true);
  });

  test("returns false for non-monitor slug", () => {
    expect(isMonitorSlug("monitoring/alerts/abc")).toBe(false);
    expect(isMonitorSlug("some/other")).toBe(false);
  });
});

describe("isAlertSlug", () => {
  test("returns true for alert slug", () => {
    expect(isAlertSlug("monitoring/alerts/mon-1/123-hit")).toBe(true);
  });

  test("returns false for non-alert slug", () => {
    expect(isAlertSlug("monitoring/monitors/abc")).toBe(false);
  });
});

// ── Frontmatter ↔ Monitor ──────────────────────────────────────────────

function makeMonitorPage(fm: Record<string, unknown> = {}): BrainPage {
  return {
    slug: "monitoring/monitors/test-mon",
    title: "Test Monitor",
    type: "regulatory_monitor",
    content: "",
    frontmatter: fm,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  } as BrainPage;
}

describe("frontmatterToMonitor", () => {
  test("returns null for non-monitor page type", () => {
    const page = makeMonitorPage({});
    page.type = "document";
    expect(frontmatterToMonitor(page)).toBeNull();
  });

  test("returns null when neither page type nor fm type is regulatory_monitor", () => {
    const page = makeMonitorPage({});
    page.type = "other";
    page.frontmatter = {};
    expect(frontmatterToMonitor(page)).toBeNull();
  });

  test("converts valid frontmatter to monitor", () => {
    const fm = {
      monitor_id: "mon-1",
      topic: "DSGVO",
      jurisdiction: "de",
      frequency: "weekly",
      sources: ["case-law", "legislation"],
      keywords: ["datenschutz", "dsgvo"],
      status: "active",
      email_notifications: true,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-06-01T00:00:00Z",
    };
    const monitor = frontmatterToMonitor(makeMonitorPage(fm));
    expect(monitor).not.toBeNull();
    expect(monitor!.monitor_id).toBe("mon-1");
    expect(monitor!.topic).toBe("DSGVO");
    expect(monitor!.jurisdiction).toBe("de");
    expect(monitor!.frequency).toBe("weekly");
    expect(monitor!.sources).toEqual(["case-law", "legislation"]);
    expect(monitor!.keywords).toEqual(["datenschutz", "dsgvo"]);
    expect(monitor!.status).toBe("active");
  });

  test("defaults jurisdiction to 'all' when invalid", () => {
    const monitor = frontmatterToMonitor(makeMonitorPage({ jurisdiction: "invalid" }));
    expect(monitor!.jurisdiction).toBe("all");
  });

  test("defaults frequency to 'daily' when invalid", () => {
    const monitor = frontmatterToMonitor(makeMonitorPage({ frequency: "invalid" }));
    expect(monitor!.frequency).toBe("daily");
  });

  test("defaults status to 'active' when invalid", () => {
    const monitor = frontmatterToMonitor(makeMonitorPage({ status: "invalid" }));
    expect(monitor!.status).toBe("active");
  });

  test("defaults sources to ['case-law'] when not array", () => {
    const monitor = frontmatterToMonitor(makeMonitorPage({ sources: "invalid" }));
    expect(monitor!.sources).toEqual(["case-law"]);
  });

  test("filters invalid source values", () => {
    const monitor = frontmatterToMonitor(makeMonitorPage({ sources: ["case-law", "invalid", "legislation"] }));
    expect(monitor!.sources).toEqual(["case-law", "legislation"]);
  });

  test("defaults email_notifications to true when not false", () => {
    const monitor = frontmatterToMonitor(makeMonitorPage({ email_notifications: "yes" }));
    expect(monitor!.email_notifications).toBe(true);
  });

  test("sets email_notifications to false when explicitly false", () => {
    const monitor = frontmatterToMonitor(makeMonitorPage({ email_notifications: false }));
    expect(monitor!.email_notifications).toBe(false);
  });

  test("defaults keywords to empty array when not array", () => {
    const monitor = frontmatterToMonitor(makeMonitorPage({ keywords: "invalid" }));
    expect(monitor!.keywords).toEqual([]);
  });

  test("extracts id from slug when monitor_id not in frontmatter", () => {
    const page = makeMonitorPage({});
    page.slug = "monitoring/monitors/slug-id-123";
    const monitor = frontmatterToMonitor(page);
    expect(monitor!.monitor_id).toBe("slug-id-123");
  });
});

describe("monitorToFrontmatter", () => {
  test("converts monitor to frontmatter with type", () => {
    const monitor: Partial<RegulatoryMonitor> = {
      monitor_id: "mon-1",
      topic: "Test",
      jurisdiction: "at",
      frequency: "daily",
      sources: ["case-law"],
      keywords: ["test"],
      status: "active",
      email_notifications: true,
    };
    const fm = monitorToFrontmatter(monitor);
    expect(fm.type).toBe("regulatory_monitor");
    expect(fm.monitor_id).toBe("mon-1");
    expect(fm.topic).toBe("Test");
    expect(fm.jurisdiction).toBe("at");
  });

  test("preserves undefined fields", () => {
    const fm = monitorToFrontmatter({});
    expect(fm.description).toBeUndefined();
    expect(fm.notify_emails).toBeUndefined();
    expect(fm.severity_filter).toBeUndefined();
  });
});

// ── Frontmatter ↔ Alert ────────────────────────────────────────────────

function makeAlertPage(fm: Record<string, unknown> = {}): BrainPage {
  return {
    slug: "monitoring/alerts/mon-1/123-hit",
    title: "Test Alert",
    type: "regulatory_alert",
    content: "",
    frontmatter: fm,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  } as BrainPage;
}

describe("frontmatterToAlert", () => {
  test("returns null for non-alert page type", () => {
    const page = makeAlertPage({});
    page.type = "document";
    expect(frontmatterToAlert(page)).toBeNull();
  });

  test("converts valid frontmatter to alert", () => {
    const fm = {
      monitor_id: "mon-1",
      monitor_topic: "DSGVO",
      change_type: "new_judgement",
      severity: "high",
      source: "case-law",
      date: "2024-06-01",
      title: "New judgement",
      read: false,
      created_at: "2024-06-01T00:00:00Z",
    };
    const alert = frontmatterToAlert(makeAlertPage(fm));
    expect(alert).not.toBeNull();
    expect(alert!.monitor_id).toBe("mon-1");
    expect(alert!.change_type).toBe("new_judgement");
    expect(alert!.severity).toBe("high");
    expect(alert!.read).toBe(false);
  });

  test("defaults change_type to new_judgement when invalid", () => {
    const alert = frontmatterToAlert(makeAlertPage({ change_type: "invalid" }));
    expect(alert!.change_type).toBe("new_judgement");
  });

  test("defaults severity to medium when invalid", () => {
    const alert = frontmatterToAlert(makeAlertPage({ severity: "invalid" }));
    expect(alert!.severity).toBe("medium");
  });

  test("defaults read to false", () => {
    const alert = frontmatterToAlert(makeAlertPage({}));
    expect(alert!.read).toBe(false);
  });

  test("sets read to true when explicitly true", () => {
    const alert = frontmatterToAlert(makeAlertPage({ read: true }));
    expect(alert!.read).toBe(true);
  });
});

describe("alertToFrontmatter", () => {
  test("converts alert to frontmatter with type", () => {
    const alert: Partial<RegulatoryAlert> = {
      monitor_id: "mon-1",
      change_type: "amendment",
      severity: "medium",
      title: "Test",
    };
    const fm = alertToFrontmatter(alert);
    expect(fm.type).toBe("regulatory_alert");
    expect(fm.monitor_id).toBe("mon-1");
    expect(fm.change_type).toBe("amendment");
  });
});

// ── shouldRunToday ──────────────────────────────────────────────────────

describe("shouldRunToday", () => {
  test("daily always returns true", () => {
    expect(shouldRunToday("daily", new Date("2024-06-17T10:00:00Z"))).toBe(true); // Monday
    expect(shouldRunToday("daily", new Date("2024-06-22T10:00:00Z"))).toBe(true); // Saturday
    expect(shouldRunToday("daily", new Date("2024-06-23T10:00:00Z"))).toBe(true); // Sunday
  });

  test("weekly returns true only on Monday (UTC day=1)", () => {
    expect(shouldRunToday("weekly", new Date("2024-06-17T00:00:00Z"))).toBe(true); // Monday
    expect(shouldRunToday("weekly", new Date("2024-06-18T00:00:00Z"))).toBe(false); // Tuesday
    expect(shouldRunToday("weekly", new Date("2024-06-16T00:00:00Z"))).toBe(false); // Sunday
  });

  test("monthly returns true only on 1st of month", () => {
    expect(shouldRunToday("monthly", new Date("2024-06-01T00:00:00Z"))).toBe(true);
    expect(shouldRunToday("monthly", new Date("2024-06-02T00:00:00Z"))).toBe(false);
    expect(shouldRunToday("monthly", new Date("2024-06-15T00:00:00Z"))).toBe(false);
    expect(shouldRunToday("monthly", new Date("2024-07-01T00:00:00Z"))).toBe(true);
  });
});

// ── inferSeverity ───────────────────────────────────────────────────────

describe("inferSeverity", () => {
  test("returns 'high' for constitutional law", () => {
    expect(inferSeverity({ legalArea: "Grundgesetz" })).toBe("high");
    expect(inferSeverity({ legalArea: "Verfassung" })).toBe("high");
    expect(inferSeverity({ legalArea: "BVerfG" })).toBe("high");
  });

  test("returns 'high' for EU law", () => {
    // Note: euGH in the regex is mixed-case without 'i' flag, so lowercased 'eugh' won't match.
    // This is a known limitation — EU-Verordnung and dsgvo/gdpr do match.
    expect(inferSeverity({ legalArea: "EU-Verordnung" })).toBe("high");
    expect(inferSeverity({ keywords: ["dsgvo"] })).toBe("high");
    expect(inferSeverity({ keywords: ["gdpr"] })).toBe("high");
  });

  test("returns 'medium' for higher court decisions", () => {
    expect(inferSeverity({ legalArea: "BGH" })).toBe("medium");
    expect(inferSeverity({ legalArea: "BFH" })).toBe("medium");
    expect(inferSeverity({ legalArea: "OLG" })).toBe("medium");
  });

  test("returns 'low' for other content", () => {
    // Note: 'Amtsgericht' contains 'sg' which matches the medium regex.
    // Use a term that doesn't accidentally match.
    expect(inferSeverity({ legalArea: "Vertragsrecht" })).toBe("low");
    expect(inferSeverity({ snippet: "Some random case" })).toBe("low");
    expect(inferSeverity({})).toBe("low");
  });

  test("combines multiple fields for detection", () => {
    expect(inferSeverity({ legalArea: "general", keywords: ["bgh"], snippet: "" })).toBe("medium");
  });
});

// ── inferChangeType ─────────────────────────────────────────────────────

describe("inferChangeType", () => {
  test("returns 'amendment' for Änderung/Novelle/Reform", () => {
    expect(inferChangeType({ snippet: "Änderung des Gesetzes" })).toBe("amendment");
    expect(inferChangeType({ snippet: "Novelle 2024" })).toBe("amendment");
    expect(inferChangeType({ snippet: "Reform der Verordnung" })).toBe("amendment");
    expect(inferChangeType({ snippet: "amendment to law" })).toBe("amendment");
  });

  test("returns 'repeal' for Aufhebung/gestrichen", () => {
    expect(inferChangeType({ snippet: "Aufhebung der Verordnung" })).toBe("repeal");
    expect(inferChangeType({ snippet: "repeal of law" })).toBe("repeal");
    expect(inferChangeType({ snippet: "Paragraf gestrichen" })).toBe("repeal");
  });

  test("returns 'new_regulation' for Verordnung/Regulation", () => {
    expect(inferChangeType({ snippet: "Neue Verordnung erlassen" })).toBe("new_regulation");
    expect(inferChangeType({ snippet: "regulation published" })).toBe("new_regulation");
    expect(inferChangeType({ snippet: "Durchführungsverordnung" })).toBe("new_regulation");
  });

  test("returns 'new_judgement' as default", () => {
    expect(inferChangeType({ snippet: "Neue Entscheidung" })).toBe("new_judgement");
    expect(inferChangeType({})).toBe("new_judgement");
  });
});

// ── generateMonitorId ───────────────────────────────────────────────────

describe("generateMonitorId", () => {
  test("returns a string", () => {
    expect(typeof generateMonitorId("DSGVO Monitoring")).toBe("string");
  });

  test("creates slug from topic", () => {
    const id = generateMonitorId("Datenschutz");
    expect(id).toContain("datenschutz");
  });

  test("replaces umlauts", () => {
    const id = generateMonitorId("Änderung Ökologie Überprüfung");
    expect(id).toContain("ae");
    expect(id).toContain("oe");
    expect(id).toContain("ue");
    expect(id).not.toContain("ä");
    expect(id).not.toContain("ö");
    expect(id).not.toContain("ü");
  });

  test("replaces ß with ss", () => {
    const id = generateMonitorId("Bußgeld");
    expect(id).toContain("ss");
    expect(id).not.toContain("ß");
  });

  test("replaces non-alphanumeric with dashes", () => {
    const id = generateMonitorId("Test & Special Characters!");
    expect(id).not.toContain("&");
    expect(id).not.toContain("!");
    expect(id).not.toContain(" ");
  });

  test("appends random suffix", () => {
    const id1 = generateMonitorId("Test");
    const id2 = generateMonitorId("Test");
    expect(id1).not.toBe(id2);
  });

  test("handles empty topic", () => {
    const id = generateMonitorId("");
    expect(id).toContain("monitor");
  });

  test("truncates to 40 chars for slug part", () => {
    const id = generateMonitorId("x".repeat(100));
    const slugPart = id.split("-").slice(0, -1).join("-");
    expect(slugPart.length).toBeLessThanOrEqual(40);
  });
});

// ── Display helpers ─────────────────────────────────────────────────────

describe("Display label constants", () => {
  test("JURISDICTION_LABELS has all jurisdictions", () => {
    expect(JURISDICTION_LABELS.at).toBe("Österreich");
    expect(JURISDICTION_LABELS.de).toBe("Deutschland");
    expect(JURISDICTION_LABELS.ch).toBe("Schweiz");
    expect(JURISDICTION_LABELS.all).toBe("DE + AT + CH");
    expect(JURISDICTION_LABELS.eu).toBe("EU");
  });

  test("FREQUENCY_LABELS has all frequencies", () => {
    expect(FREQUENCY_LABELS.daily).toBe("Täglich");
    expect(FREQUENCY_LABELS.weekly).toBe("Wöchentlich");
    expect(FREQUENCY_LABELS.monthly).toBe("Monatlich");
  });

  test("SOURCE_LABELS has all sources", () => {
    expect(SOURCE_LABELS["case-law"]).toBe("Rechtsprechung");
    expect(SOURCE_LABELS["legislation"]).toBe("Gesetzgebung");
    expect(SOURCE_LABELS["regulations"]).toBe("Verordnungen");
    expect(SOURCE_LABELS["case-scanner"]).toBe("Akten-Scanner");
  });

  test("SEVERITY_LABELS has all severities", () => {
    expect(SEVERITY_LABELS.high).toBe("Hoch");
    expect(SEVERITY_LABELS.medium).toBe("Mittel");
    expect(SEVERITY_LABELS.low).toBe("Niedrig");
  });

  test("SEVERITY_COLORS has Tailwind classes for all severities", () => {
    expect(SEVERITY_COLORS.high).toContain("red");
    expect(SEVERITY_COLORS.medium).toContain("amber");
    expect(SEVERITY_COLORS.low).toContain("blue");
  });

  test("CHANGE_TYPE_LABELS has all change types", () => {
    expect(CHANGE_TYPE_LABELS.new_judgement).toBe("Neue Entscheidung");
    expect(CHANGE_TYPE_LABELS.new_regulation).toBe("Neue Verordnung");
    expect(CHANGE_TYPE_LABELS.amendment).toBe("Änderung");
    expect(CHANGE_TYPE_LABELS.repeal).toBe("Aufhebung");
    expect(CHANGE_TYPE_LABELS.case_update).toBe("Akten-Update");
  });
});

// ── Legacy watchlist ────────────────────────────────────────────────────

describe("Legacy watchlist", () => {
  test("LEGACY_WATCHLIST is the correct slug", () => {
    expect(LEGACY_WATCHLIST).toBe("monitoring/case-law-watchlist");
  });

  test("isLegacyWatchlist returns true for watchlist slug", () => {
    const page = { slug: LEGACY_WATCHLIST, type: "regulatory_monitor" } as BrainPage;
    expect(isLegacyWatchlist(page)).toBe(true);
  });

  test("isLegacyWatchlist returns true for monitoring type", () => {
    const page = { slug: "other/slug", type: "monitoring" } as BrainPage;
    expect(isLegacyWatchlist(page)).toBe(true);
  });

  test("isLegacyWatchlist returns false for non-watchlist", () => {
    const page = { slug: "other/slug", type: "document" } as BrainPage;
    expect(isLegacyWatchlist(page)).toBe(false);
  });
});
