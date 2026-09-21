import { describe, expect, test } from "bun:test";
import {
  completenessPct,
  fehltEmbedding,
  isBestaetigtUnvollstaendig,
  isFertig,
  isNieGeprueft,
  isUnvollstaendig,
} from "../scripts/corpus-status-report.ts";

const row = (overrides: Record<string, unknown> = {}) => ({
  source_id: "law-at-normen",
  doc_class: "statute",
  db_pages: 100,
  plausible_pages: 100,
  implausible_pages: 0,
  unembedded_ok_pages: 0,
  ris_total: 100,
  completeness_pct: "100",
  last_plausibility_check: null,
  last_completeness_check: null,
  ...overrides,
});

describe("completenessPct", () => {
  test("parses the stored text back to a number", () => {
    expect(completenessPct(row({ completeness_pct: "63.5" }))).toBe(63.5);
  });
  test("null means never checked, not zero", () => {
    expect(completenessPct(row({ completeness_pct: null }))).toBeNull();
  });
});

describe("isFertig", () => {
  test("plausible and complete is fertig", () => {
    expect(isFertig(row())).toBe(true);
  });

  test("plausible but completeness never checked is still fertig — nothing known is wrong", () => {
    expect(isFertig(row({ completeness_pct: null, ris_total: null }))).toBe(true);
  });

  test("any implausible page disqualifies it, even at 100% completeness", () => {
    expect(isFertig(row({ implausible_pages: 1 }))).toBe(false);
  });

  test("plausibility never having run disqualifies it (can't claim fertig on an unknown)", () => {
    expect(isFertig(row({ plausible_pages: null }))).toBe(false);
  });

  test("below the completeness threshold disqualifies it even if fully plausible", () => {
    // The exact Landesrecht shape: nothing wrong found in a sample, but only
    // 63.5% of what RIS lists is even in the DB yet.
    expect(isFertig(row({ completeness_pct: "63.5" }))).toBe(false);
  });
});

describe("isUnvollstaendig", () => {
  test("below threshold is unvollständig", () => {
    expect(isUnvollstaendig(row({ completeness_pct: "63.5" }))).toBe(true);
  });
  test("never checked counts as unvollständig — unknown is not assumed complete", () => {
    expect(isUnvollstaendig(row({ completeness_pct: null }))).toBe(true);
  });
  test("at or above threshold is not unvollständig", () => {
    expect(isUnvollstaendig(row({ completeness_pct: "99.5" }))).toBe(false);
  });
});

describe("isBestaetigtUnvollstaendig vs isNieGeprueft", () => {
  test("a confirmed gap is bestätigt unvollständig, not nie geprüft", () => {
    const r = row({ completeness_pct: "63.5" });
    expect(isBestaetigtUnvollstaendig(r)).toBe(true);
    expect(isNieGeprueft(r)).toBe(false);
  });

  test("never checked is nie geprüft, not a confirmed gap — the whole point of splitting them", () => {
    const r = row({ completeness_pct: null });
    expect(isBestaetigtUnvollstaendig(r)).toBe(false);
    expect(isNieGeprueft(r)).toBe(true);
  });

  test("both together still make isUnvollstaendig true, so nothing is lost by the split", () => {
    expect(isUnvollstaendig(row({ completeness_pct: "63.5" }))).toBe(true);
    expect(isUnvollstaendig(row({ completeness_pct: null }))).toBe(true);
    expect(isUnvollstaendig(row({ completeness_pct: "100" }))).toBe(false);
  });
});

describe("fehltEmbedding", () => {
  test("zero unembedded pages means nothing missing", () => {
    expect(fehltEmbedding(row({ unembedded_ok_pages: 0 }))).toBe(false);
  });
  test("null is treated as zero, not flagged", () => {
    expect(fehltEmbedding(row({ unembedded_ok_pages: null }))).toBe(false);
  });
  test("any unembedded page flags it", () => {
    expect(fehltEmbedding(row({ unembedded_ok_pages: 1 }))).toBe(true);
  });
});
