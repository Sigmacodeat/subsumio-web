// @vitest-environment node

import { describe, test, expect } from "vitest";
import {
  demoMatterPages,
  demoInboxFile,
  demoInboxSlugs,
  demoLiveSlugs,
  demoSuggestedQuestions,
  demoTemplateSource,
  DEMO_LIVE_SLUGS,
  DEMO_INBOX_SLUGS,
  DEMO_CASE_SLUG,
  DEMO_INBOX_DEADLINE_SLUG,
  DEMO_INBOX_DOC_SLUG,
  DEMO_SUGGESTED_QUESTIONS,
  DEMO_TEMPLATE_SOURCE,
  DEMO_TEMPLATE_SOURCE_DE,
} from "./demo-matter";

describe("demo matter content", () => {
  const pages = demoMatterPages(new Date("2026-10-01T12:00:00Z"));

  test("partitions cleanly into live + inbox stages", () => {
    expect(DEMO_LIVE_SLUGS.length).toBeGreaterThan(0);
    expect(DEMO_INBOX_SLUGS.length).toBeGreaterThan(0);
    // No overlap and complete coverage.
    const live = new Set(DEMO_LIVE_SLUGS);
    for (const slug of DEMO_INBOX_SLUGS) expect(live.has(slug)).toBe(false);
    expect(DEMO_LIVE_SLUGS.length + DEMO_INBOX_SLUGS.length).toBe(pages.length);
  });

  test("contains the flagship case with parties, court and jurisdiction", () => {
    const c = pages.find((p) => p.slug === DEMO_CASE_SLUG);
    expect(c).toBeDefined();
    expect(c!.frontmatter.jurisdiction).toBe("AT");
    expect(c!.frontmatter.client_name).toContain("Berger");
    expect(c!.frontmatter.opponent_name).toContain("Muster Werk");
    expect(c!.frontmatter.court_name).toContain("Wien");
    expect(c!.frontmatter.demo_stage).toBe("live");
  });

  test("inbox stage carries the incoming brief + unreviewed deadline", () => {
    const doc = pages.find((p) => p.slug === DEMO_INBOX_DOC_SLUG);
    const dl = pages.find((p) => p.slug === DEMO_INBOX_DEADLINE_SLUG);
    expect(doc?.frontmatter.demo_stage).toBe("inbox");
    expect(dl?.frontmatter.demo_stage).toBe("inbox");
    // Human-in-the-loop: the extracted deadline must arrive unreviewed so
    // the visitor confirms it — the trust differentiator of the demo.
    const status = String(dl?.frontmatter.review_status ?? dl?.frontmatter.status ?? "");
    expect(status).toMatch(/unreviewed|pending|open/);
  });

  test("every page is marked fictional and carries demo metadata", () => {
    for (const p of pages) {
      expect(p.frontmatter.demo).toBe(true);
      expect(["live", "inbox"]).toContain(p.frontmatter.demo_stage);
      expect(p.slug).not.toContain(" ");
      expect(p.content.length).toBeGreaterThan(50);
    }
  });

  test("dates stay relative — deadlines are always in the future", () => {
    const fresh = demoMatterPages(new Date());
    const deadlinePages = fresh.filter((p) => p.type === "deadline" || p.slug.includes("frist"));
    expect(deadlinePages.length).toBeGreaterThanOrEqual(2);
  });

  test("suggested questions are answerable from the content", () => {
    expect(DEMO_SUGGESTED_QUESTIONS.length).toBeGreaterThanOrEqual(3);
    // The contradiction question is the demo's showcase — the fixture must
    // actually contain the Zwischenzeugnis-vs-Kündigung contradiction.
    const all = pages.map((p) => p.content).join("\n");
    expect(all).toContain("Zwischenzeugnis");
    expect(all).toContain("Kündigung");
  });
});

describe("demo matter — DE jurisdiction variant", () => {
  const now = new Date("2026-10-01T12:00:00Z");
  const de = demoMatterPages(now, "de");
  const at = demoMatterPages(now, "at");

  test("same story, same slugs — separate template sources", () => {
    expect(de.length).toBe(at.length);
    expect(de.map((p) => p.slug)).toEqual(at.map((p) => p.slug));
    expect(demoTemplateSource("at")).toBe(DEMO_TEMPLATE_SOURCE);
    expect(demoTemplateSource("de")).toBe(DEMO_TEMPLATE_SOURCE_DE);
    expect(DEMO_TEMPLATE_SOURCE_DE).not.toBe(DEMO_TEMPLATE_SOURCE);
    // Stage partitions identical across jurisdictions.
    expect(demoLiveSlugs("de")).toEqual(demoLiveSlugs("at"));
    expect(demoInboxSlugs("de")).toEqual(demoInboxSlugs("at"));
  });

  test("DE variant uses German law hooks, not Austrian ones", () => {
    const all = de.map((p) => p.content).join("\n");
    const c = de.find((p) => p.slug === DEMO_CASE_SLUG);
    expect(c!.frontmatter.jurisdiction).toBe("DE");
    expect(c!.frontmatter.court_name).toBe("Arbeitsgericht München");
    // KSchG 3-week challenge deadline, § 307 BGB transparency, beA filing.
    expect(all).toContain("KSchG");
    expect(all).toContain("§ 307");
    expect(all).toContain("beA");
    // No Austrian-isms leaking into the DE matter.
    expect(all).not.toContain("ArbVG");
    expect(all).not.toContain("ERV");
    expect(all).not.toContain("Jänner");
    expect(all).not.toContain("AngG");
  });

  test("AT variant keeps Austrian law hooks", () => {
    const all = at.map((p) => p.content).join("\n");
    expect(all).toContain("ArbVG");
    expect(all).toContain("ERV");
    expect(all).not.toContain("KSchG");
    expect(at.find((p) => p.slug === DEMO_CASE_SLUG)!.frontmatter.jurisdiction).toBe("AT");
  });

  test("DE challenge deadline is the 3-week KSchG window", () => {
    const dl = de.find((p) => p.slug === "legal/deadlines/demo-anfechtungsfrist-berger");
    const due = new Date(String(dl!.frontmatter.due_date));
    // now + 21 days
    const expected = new Date(now.getTime() + 21 * 86_400_000);
    expect(due.toISOString().slice(0, 10)).toBe(expected.toISOString().slice(0, 10));
  });

  test("localized display helpers follow the jurisdiction", () => {
    expect(demoInboxFile("de").name).toContain("beA");
    expect(demoInboxFile("at").name).toContain("ERV");
    expect(demoSuggestedQuestions("de")[0]).toContain("Klageerwiderung");
    expect(demoSuggestedQuestions("at")[0]).toContain("Klagebeantwortung");
  });
});
