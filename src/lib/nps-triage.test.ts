import { describe, it, expect } from "vitest";
import {
  detractorsSince,
  escalatedCaseSlugs,
  staffRecipients,
  type FeedbackPage,
} from "./nps-triage";
import type { User } from "@/lib/auth/store";

const NOW = Date.parse("2026-09-23T10:00:00Z");

function fb(slug: string, score: number, caseSlug = "akte-1", daysAgo = 1): FeedbackPage {
  return {
    slug,
    frontmatter: {
      case_slug: caseSlug,
      nps_score: score,
      submitted_at: new Date(NOW - daysAgo * 86_400_000).toISOString(),
    },
  };
}

describe("detractorsSince", () => {
  const pages = [
    fb("a", 5), // detractor, 1d ago
    fb("b", 9), // promoter
    fb("c", 3, "akte-1", 10), // detractor but too old for 48h
    fb("d", 0, "akte-2", 0.5),
  ];

  it("filters score ≤ 6 inside the window", () => {
    const out = detractorsSince(pages, NOW - 48 * 3600 * 1000);
    expect(out.map((p) => p.slug).sort()).toEqual(["a", "d"]);
  });

  it("ignores invalid timestamps and non-numeric scores", () => {
    const broken: FeedbackPage[] = [
      { slug: "x", frontmatter: { nps_score: 1, submitted_at: "not-a-date" } },
      { slug: "y", frontmatter: { submitted_at: new Date().toISOString() } },
    ];
    expect(detractorsSince(broken, 0)).toEqual([]);
  });
});

describe("escalatedCaseSlugs", () => {
  it("flags cases at the threshold inside 30d", () => {
    const pages = [fb("a", 4, "akte-1", 5), fb("b", 2, "akte-1", 20), fb("c", 1, "akte-2", 29)];
    const out = escalatedCaseSlugs(pages, 2, 30 * 86_400_000, NOW);
    expect([...out]).toEqual(["akte-1"]);
  });

  it("ignores detractors outside the window and non-detractors", () => {
    const pages = [
      fb("a", 5, "akte-1", 40), // too old
      fb("b", 3, "akte-1", 45), // too old
      fb("c", 9, "akte-3", 1), // promoter, doesn't count
      fb("d", 2, "akte-3", 1),
    ];
    expect(escalatedCaseSlugs(pages, 2, 30 * 86_400_000, NOW).size).toBe(0);
  });
});

describe("staffRecipients", () => {
  const user = (role: User["role"]) => ({ role }) as User;

  it("keeps admins and lawyers, drops client_viewer and assistants", () => {
    const users = [user("admin"), user("lawyer"), user("assistant"), user("client_viewer")];
    expect(staffRecipients(users).map((u) => u.role)).toEqual(["admin", "lawyer"]);
  });
});
