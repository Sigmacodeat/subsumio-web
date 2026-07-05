/**
 * rundown-cron.test.ts — Tests for the daily Rundown cron route.
 *
 * Verifies:
 *  1. The RUNDOWN_PROMPT contains all 5 mandatory sections in the correct order
 *  2. The cron is enabled by default (DISABLE_RUNDOWN_CRON=true opts out)
 *  3. The budget cap is $0.30 and no force_specialists
 *  4. The crontab entry exists at 05:00 UTC
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const cronRoutePath = join(process.cwd(), "src/app/api/cron/rundown/route.ts");
const cronRouteSource = readFileSync(cronRoutePath, "utf-8");

const manualTriggerPath = join(process.cwd(), "src/app/api/agents/rundown/route.ts");
const manualTriggerSource = readFileSync(manualTriggerPath, "utf-8");

const crontabPath = join(process.cwd(), "server/deploy/hetzner/crontab");
const crontabSource = readFileSync(crontabPath, "utf-8");

describe("TODO 7: Rundown Cron — Prompt Structure", () => {
  const MANDATORY_SECTIONS = [
    "### 🔴 Fristen heute & kritisch",
    "### 🔍 Vier-Augen-Kontrollen offen",
    "### ✅ Agent-Inbox / Freigaben",
    "### ⚖️ Neue Rechtsprechung",
    "### 📁 Gestrige Aktivität",
    "### 🎯 Empfehlungen für heute",
  ];

  it("cron route prompt contains all 5 mandatory sections", () => {
    for (const section of MANDATORY_SECTIONS) {
      expect(cronRouteSource).toContain(section);
    }
  });

  it("cron route prompt sections appear in the correct order", () => {
    const indices = MANDATORY_SECTIONS.map((s) => cronRouteSource.indexOf(s));
    // Each section must be found
    expect(indices.every((i) => i !== -1)).toBe(true);
    // Each section must appear after the previous one
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]!).toBeGreaterThan(indices[i - 1]!);
    }
  });

  it("manual trigger prompt matches cron route prompt", () => {
    for (const section of MANDATORY_SECTIONS) {
      expect(manualTriggerSource).toContain(section);
    }
  });

  it("prompt references unified Fristen-Read-Model", () => {
    expect(cronRouteSource).toContain("Fristen-Read-Model");
    expect(cronRouteSource).toContain("unified Fristen-Daten");
  });

  it("prompt references second_check_required for Vier-Augen-Kontrolle", () => {
    expect(cronRouteSource).toContain("second_check_required=true");
    expect(cronRouteSource).toContain("second_check_at");
  });

  it("prompt references Notfristen marking", () => {
    expect(cronRouteSource).toContain("is_notfrist=true");
    expect(cronRouteSource).toContain("⚠️");
  });
});

describe("TODO 7: Rundown Cron — Enablement & Budget", () => {
  it("cron route uses DISABLE_RUNDOWN_CRON (opt-out, not opt-in)", () => {
    expect(cronRouteSource).toContain("DISABLE_RUNDOWN_CRON");
    expect(cronRouteSource).not.toContain("ENABLE_RUNDOWN_CRON");
  });

  it("cron route has budget cap of 30 cents", () => {
    expect(cronRouteSource).toContain("budget_remaining_cents: 30");
  });

  it("cron route does not force specialists (prevents subagent spawning)", () => {
    // Check that force_specialists is not used as a JSON property (only mentioned in comments)
    const bodyMatch = cronRouteSource.match(/body:\s*JSON\.stringify\(\s*\{([\s\S]*?)\}\s*\)/);
    if (bodyMatch) {
      expect(bodyMatch[1]).not.toMatch(/force_specialists\s*:/);
    }
  });

  it("manual trigger does not force specialists", () => {
    const bodyMatch = manualTriggerSource.match(/body:\s*JSON\.stringify\(\s*\{([\s\S]*?)\}\s*\)/);
    if (bodyMatch) {
      expect(bodyMatch[1]).not.toMatch(/force_specialists\s*:/);
    }
  });

  it("manual trigger has same budget cap", () => {
    expect(manualTriggerSource).toContain("budget_remaining_cents: 30");
  });
});

describe("TODO 7: Rundown Cron — Crontab Entry", () => {
  it("crontab has an active (non-commented) rundown entry at 05:00 UTC", () => {
    // Must contain a non-commented line with /api/cron/rundown
    const lines = crontabSource.split("\n");
    const rundownLines = lines.filter(
      (l) => l.includes("/api/cron/rundown") && !l.trim().startsWith("#")
    );
    expect(rundownLines.length).toBeGreaterThan(0);
    // Should be at 05:00 UTC
    expect(rundownLines[0]).toMatch(/^0\s+5\s+\*\s+\*\s+\*/);
  });

  it("crontab does not have a DISABLED comment for rundown", () => {
    // The old "DISABLED" comment should be gone
    expect(crontabSource).not.toContain("DISABLED: Daily Rundown");
  });
});
