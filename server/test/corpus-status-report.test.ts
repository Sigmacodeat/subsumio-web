import { describe, expect, test } from "bun:test";
import {
  completenessPct,
  completenessState,
  fehltEmbedding,
  isBestaetigtUnvollstaendig,
  isFertig,
  isNieGeprueft,
  isUnvollstaendig,
  isVollstaendigAberNichtPlausibel,
  plausibilityState,
} from "../scripts/corpus-status-report.ts";

const row = (overrides: Record<string, unknown> = {}) => ({
  source_id: "law-at-normen",
  doc_class: "statute",
  db_pages: 100,
  plausible_pages: 100,
  implausible_pages: 0,
  unembedded_ok_pages: 0,
  ris_total: 100,
  last_plausibility_check: null,
  last_completeness_check: null,
  ...overrides,
});

describe("completenessPct", () => {
  test("derives the percentage from ris_total and db_pages — nothing pre-stored to drift", () => {
    expect(completenessPct(row({ db_pages: 635, ris_total: 1000 }))).toBe(63.5);
  });
  test("null ris_total means never checked, not zero", () => {
    expect(completenessPct(row({ ris_total: null }))).toBeNull();
  });
  test("a ris_total of zero is also never checked, not a divide-by-zero", () => {
    expect(completenessPct(row({ ris_total: 0 }))).toBeNull();
  });
});

describe("plausibilityState / completenessState", () => {
  test("plausible_pages null means the audit never ran for this source", () => {
    expect(plausibilityState(row({ plausible_pages: null }))).toBe("ungeprueft");
  });
  test("zero implausible pages is ok", () => {
    expect(plausibilityState(row())).toBe("ok");
  });
  test("any implausible page is issues, not ok", () => {
    expect(plausibilityState(row({ implausible_pages: 1 }))).toBe("issues");
  });
  test("completenessState mirrors the three RIS outcomes", () => {
    expect(completenessState(row({ ris_total: null }))).toBe("ungeprueft");
    expect(completenessState(row({ db_pages: 635, ris_total: 1000 }))).toBe(
      "bestaetigt_unvollstaendig"
    );
    expect(completenessState(row({ db_pages: 995, ris_total: 1000 }))).toBe(
      "bestaetigt_vollstaendig"
    );
  });
});

describe("isFertig", () => {
  test("plausible and confirmed complete is fertig", () => {
    expect(isFertig(row())).toBe(true);
  });

  test("completeness never checked is NOT fertig — the exact bug found 2026-09-21", () => {
    // AVSV, Literatur, SPG and Staatsverträge were plausible but had no RIS
    // comparison, and the old isFertig treated "unchecked" as good enough —
    // they printed as both "100% fertig" and "nie geprüft" at once.
    // "Fertig" now means proven, not "nothing wrong found yet".
    expect(isFertig(row({ ris_total: null }))).toBe(false);
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
    expect(isFertig(row({ db_pages: 635, ris_total: 1000 }))).toBe(false);
  });
});

describe("isUnvollstaendig", () => {
  test("below threshold is unvollständig", () => {
    expect(isUnvollstaendig(row({ db_pages: 635, ris_total: 1000 }))).toBe(true);
  });
  test("never checked counts as unvollständig — unknown is not assumed complete", () => {
    expect(isUnvollstaendig(row({ ris_total: null }))).toBe(true);
  });
  test("at or above threshold is not unvollständig", () => {
    expect(isUnvollstaendig(row({ db_pages: 995, ris_total: 1000 }))).toBe(false);
  });
});

describe("isBestaetigtUnvollstaendig", () => {
  test("a confirmed gap is bestätigt unvollständig", () => {
    expect(isBestaetigtUnvollstaendig(row({ db_pages: 635, ris_total: 1000 }))).toBe(true);
  });
  test("never checked is NOT a confirmed gap — the whole point of keeping them apart", () => {
    expect(isBestaetigtUnvollstaendig(row({ ris_total: null }))).toBe(false);
  });
});

describe("isVollstaendigAberNichtPlausibel", () => {
  test("the exact AsylGH shape found 2026-09-21: complete against RIS, but a couple of pages failed plausibility", () => {
    const r = row({ implausible_pages: 2, plausible_pages: 98 });
    expect(isFertig(r)).toBe(false);
    expect(isBestaetigtUnvollstaendig(r)).toBe(false);
    expect(isVollstaendigAberNichtPlausibel(r)).toBe(true);
  });

  test("a fully fertig row is not also flagged here", () => {
    expect(isVollstaendigAberNichtPlausibel(row())).toBe(false);
  });

  test("unchecked completeness is not flagged here either — that's its own bucket", () => {
    expect(
      isVollstaendigAberNichtPlausibel(
        row({ ris_total: null, implausible_pages: 2, plausible_pages: 98 })
      )
    ).toBe(false);
  });
});

describe("exhaustive partition — every source lands in exactly one of the 3x3 cells", () => {
  const plausibilities = [
    { plausible_pages: 100, implausible_pages: 0 }, // ok
    { plausible_pages: 98, implausible_pages: 2 }, // issues
    { plausible_pages: null, implausible_pages: null }, // ungeprüft
  ];
  const completenesses = [
    { db_pages: 995, ris_total: 1000 }, // bestätigt vollständig
    { db_pages: 635, ris_total: 1000 }, // bestätigt unvollständig
    { db_pages: 100, ris_total: null }, // ungeprüft
  ];

  for (const p of plausibilities) {
    for (const c of completenesses) {
      test(`plausibel=${plausibilityStateLabel(p)} x vollständig=${completenessStateLabel(c)}`, () => {
        const r = row({ ...p, ...c });
        const cells = [
          isFertig(r),
          isBestaetigtUnvollstaendig(r) && !isVollstaendigAberNichtPlausibel(r),
          isVollstaendigAberNichtPlausibel(r),
          isNieGeprueft(r) && plausibilityState(r) === "ok",
          isNieGeprueft(r) && plausibilityState(r) !== "ok",
        ];
        // Every combination must be claimed by exactly one of the report's
        // printed buckets — this is what silently dropped AVSV et al. before.
        expect(cells.filter(Boolean).length).toBe(1);
      });
    }
  }
});

function plausibilityStateLabel(p: {
  implausible_pages: number | null;
  plausible_pages: number | null;
}): string {
  return plausibilityState(p as never);
}
function completenessStateLabel(c: { db_pages: number; ris_total: number | null }): string {
  return completenessState(row(c) as never);
}

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
