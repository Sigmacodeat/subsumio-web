import { describe, test, expect } from "vitest";
import {
  STATUS_TEXT,
  STATUS_BG,
  STATUS_BORDER,
  statusBadgeClasses,
  type StatusColor,
} from "./status-colors";

const ALL_COLORS: StatusColor[] = [
  "blue", "amber", "red", "rose", "emerald", "violet", "orange", "gray",
];

describe("STATUS_TEXT", () => {
  test("has entry for every StatusColor", () => {
    for (const c of ALL_COLORS) {
      expect(STATUS_TEXT[c]).toBeDefined();
      expect(STATUS_TEXT[c].length).toBeGreaterThan(0);
    }
  });

  test("violet uses brand-text class", () => {
    expect(STATUS_TEXT.violet).toBe("brand-text");
  });

  test("non-violet colors use Tailwind text classes", () => {
    expect(STATUS_TEXT.blue).toBe("text-blue-400");
    expect(STATUS_TEXT.red).toBe("text-red-400");
    expect(STATUS_TEXT.gray).toBe("text-gray-400");
  });
});

describe("STATUS_BG", () => {
  test("has entry for every StatusColor", () => {
    for (const c of ALL_COLORS) {
      expect(STATUS_BG[c]).toBeDefined();
      expect(STATUS_BG[c].length).toBeGreaterThan(0);
    }
  });

  test("violet uses brand-soft class", () => {
    expect(STATUS_BG.violet).toBe("brand-soft");
  });

  test("non-violet colors use Tailwind bg classes with opacity", () => {
    expect(STATUS_BG.blue).toBe("bg-blue-500/10");
    expect(STATUS_BG.amber).toBe("bg-amber-500/10");
  });
});

describe("STATUS_BORDER", () => {
  test("has entry for every StatusColor", () => {
    for (const c of ALL_COLORS) {
      expect(STATUS_BORDER[c]).toBeDefined();
      expect(STATUS_BORDER[c].length).toBeGreaterThan(0);
    }
  });

  test("violet uses brand-border class", () => {
    expect(STATUS_BORDER.violet).toBe("brand-border");
  });

  test("non-violet colors use Tailwind border classes with opacity", () => {
    expect(STATUS_BORDER.red).toBe("border-red-500/20");
    expect(STATUS_BORDER.emerald).toBe("border-emerald-500/20");
  });
});

describe("statusBadgeClasses", () => {
  test("combines bg, text, and border classes", () => {
    const result = statusBadgeClasses("blue");
    expect(result).toContain(STATUS_BG.blue);
    expect(result).toContain(STATUS_TEXT.blue);
    expect(result).toContain(STATUS_BORDER.blue);
  });

  test("works for all colors", () => {
    for (const c of ALL_COLORS) {
      const result = statusBadgeClasses(c);
      expect(result).toContain(STATUS_BG[c]);
      expect(result).toContain(STATUS_TEXT[c]);
      expect(result).toContain(STATUS_BORDER[c]);
    }
  });

  test("returns exactly 3 space-separated classes", () => {
    const result = statusBadgeClasses("red");
    expect(result.split(" ")).toHaveLength(3);
  });
});
