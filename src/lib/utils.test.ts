import { describe, test, expect } from "vitest";
import { cn, formatDate, formatRelativeTime, truncate, slugify } from "./utils";

describe("cn", () => {
  test("merges class names", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1");
  });

  test("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "visible")).toBe("base visible");
  });

  test("deduplicates conflicting Tailwind classes", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  test("handles empty input", () => {
    expect(cn()).toBe("");
  });

  test("handles undefined and null", () => {
    expect(cn("base", undefined, null, "end")).toBe("base end");
  });
});

describe("formatDate", () => {
  test("formats ISO date in de-DE format", () => {
    expect(formatDate("2024-06-15")).toBe("15.06.2024");
  });

  test("formats Date object", () => {
    expect(formatDate(new Date("2024-01-05"))).toBe("05.01.2024");
  });

  test("handles single-digit days and months", () => {
    expect(formatDate("2024-03-01")).toBe("01.03.2024");
  });

  test("handles year-only date", () => {
    expect(formatDate("2024-01-01")).toBe("01.01.2024");
  });
});

describe("formatRelativeTime", () => {
  test("returns 'gerade eben' for current time", () => {
    const now = new Date().toISOString();
    expect(formatRelativeTime(now)).toBe("gerade eben");
  });

  test("returns minutes for recent past", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(formatRelativeTime(fiveMinAgo)).toBe("vor 5m");
  });

  test("returns hours for past within a day", () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(threeHoursAgo)).toBe("vor 3h");
  });

  test("returns days for past within a week", () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(twoDaysAgo)).toBe("vor 2d");
  });

  test("returns formatted date for past beyond a week", () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const result = formatRelativeTime(tenDaysAgo);
    expect(result).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
  });

  test("handles Date object input", () => {
    const now = new Date();
    expect(formatRelativeTime(now)).toBe("gerade eben");
  });
});

describe("truncate", () => {
  test("returns string unchanged when shorter than n", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  test("returns string unchanged when exactly n", () => {
    expect(truncate("hello", 5)).toBe("hello");
  });

  test("truncates and adds ellipsis when longer than n", () => {
    expect(truncate("hello world", 8)).toBe("hello w…");
  });

  test("handles empty string", () => {
    expect(truncate("", 5)).toBe("");
  });

  test("handles n=1", () => {
    expect(truncate("abc", 1)).toBe("…");
  });
});

describe("slugify", () => {
  test("converts to lowercase", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  test("replaces spaces with dashes", () => {
    expect(slugify("foo bar baz")).toBe("foo-bar-baz");
  });

  test("removes special characters", () => {
    expect(slugify("foo! @bar #baz")).toBe("foo-bar-baz");
  });

  test("collapses multiple dashes", () => {
    expect(slugify("foo   bar")).toBe("foo-bar");
    expect(slugify("foo--bar")).toBe("foo-bar");
  });

  test("removes leading and trailing dashes", () => {
    expect(slugify("---hello---")).toBe("hello");
  });

  test("handles empty string", () => {
    expect(slugify("")).toBe("");
  });

  test("handles unicode characters", () => {
    expect(slugify("Müller & Söhne")).toBe("mller-shne");
  });

  test("handles numbers", () => {
    expect(slugify("test 123")).toBe("test-123");
  });

  test("preserves underscores as dashes", () => {
    expect(slugify("foo_bar")).toBe("foo-bar");
  });
});
