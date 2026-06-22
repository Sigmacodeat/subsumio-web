import { describe, test, expect } from "vitest";
import { diffWords, diffStats, buildAcceptedText, type DiffToken } from "./word-diff";

function tokenText(tokens: DiffToken[]): string {
  return tokens.map((t) => t.text).join("");
}

function tokenTypes(tokens: DiffToken[]): string {
  return tokens.map((t) => t.type[0]).join("");
}

describe("diffWords", () => {
  test("identical strings → all equal", () => {
    const { left, right } = diffWords("hello world", "hello world");
    expect(tokenText(left)).toBe("hello world");
    expect(tokenText(right)).toBe("hello world");
    // 3 tokens: "hello", " ", "world"
    expect(tokenTypes(left)).toBe("eee");
    expect(tokenTypes(right)).toBe("eee");
  });

  test("simple addition", () => {
    const { right } = diffWords("hello world", "hello beautiful world");
    expect(tokenText(right)).toBe("hello beautiful world");
    const added = right.filter((t) => t.type === "added");
    expect(
      added
        .map((t) => t.text)
        .join("")
        .trim()
    ).toBe("beautiful");
  });

  test("simple removal", () => {
    const { left } = diffWords("hello beautiful world", "hello world");
    const removed = left.filter((t) => t.type === "removed");
    expect(
      removed
        .map((t) => t.text)
        .join("")
        .trim()
    ).toBe("beautiful");
  });

  test("complete replacement", () => {
    const { left, right } = diffWords("aaa", "bbb");
    expect(left.every((t) => t.type === "removed")).toBe(true);
    expect(right.every((t) => t.type === "added")).toBe(true);
  });

  test("empty original → all added", () => {
    const { left, right } = diffWords("", "new text");
    // empty string splits to [""], which becomes one removed token on left
    expect(left.filter((t) => t.text !== "")).toHaveLength(0);
    expect(right.filter((t) => t.text.trim()).every((t) => t.type === "added")).toBe(true);
  });

  test("empty revised → all removed", () => {
    const { left, right } = diffWords("old text", "");
    expect(left.filter((t) => t.text.trim()).every((t) => t.type === "removed")).toBe(true);
    expect(right.filter((t) => t.text !== "")).toHaveLength(0);
  });

  test("both empty → empty", () => {
    const { left, right } = diffWords("", "");
    // empty string splits to [""], producing one equal token with empty text
    expect(left.filter((t) => t.text !== "")).toHaveLength(0);
    expect(right.filter((t) => t.text !== "")).toHaveLength(0);
  });

  test("whitespace-only changes are tracked", () => {
    const { left, right } = diffWords("a  b", "a b");
    expect(tokenText(left)).toBe("a  b");
    expect(tokenText(right)).toBe("a b");
  });

  test("multiline text", () => {
    const { left, right } = diffWords("line one\nline two", "line one\nline three");
    expect(tokenText(left)).toBe("line one\nline two");
    expect(tokenText(right)).toBe("line one\nline three");
    const removed = left.filter((t) => t.type === "removed" && t.text.trim());
    const added = right.filter((t) => t.type === "added" && t.text.trim());
    expect(
      removed
        .map((t) => t.text)
        .join("")
        .trim()
    ).toBe("two");
    expect(
      added
        .map((t) => t.text)
        .join("")
        .trim()
    ).toBe("three");
  });

  test("unicode text", () => {
    const { left, right } = diffWords("Müller läßt", "Müller lässt");
    const removed = left.filter((t) => t.type === "removed" && t.text.trim());
    const added = right.filter((t) => t.type === "added" && t.text.trim());
    expect(
      removed
        .map((t) => t.text)
        .join("")
        .trim()
    ).toBe("läßt");
    expect(
      added
        .map((t) => t.text)
        .join("")
        .trim()
    ).toBe("lässt");
  });

  test("long text with multiple changes", () => {
    const orig = "The quick brown fox jumps over the lazy dog";
    const rev = "The quick red fox leaps over the sleeping dog";
    const { left, right } = diffWords(orig, rev);
    expect(tokenText(left)).toBe(orig);
    expect(tokenText(right)).toBe(rev);
  });

  test("preserves word boundaries", () => {
    const { left, right } = diffWords("foo bar baz", "foo BAR baz");
    const removed = left.filter((t) => t.type === "removed" && t.text.trim());
    const added = right.filter((t) => t.type === "added" && t.text.trim());
    expect(
      removed
        .map((t) => t.text)
        .join("")
        .trim()
    ).toBe("bar");
    expect(
      added
        .map((t) => t.text)
        .join("")
        .trim()
    ).toBe("BAR");
  });
});

describe("diffStats", () => {
  test("counts additions and removals", () => {
    const stats = diffStats("hello world", "hello beautiful world");
    expect(stats.additions).toBe(1);
    expect(stats.removals).toBe(0);
    expect(stats.unchanged).toBe(2);
  });

  test("counts removals", () => {
    const stats = diffStats("hello beautiful world", "hello world");
    expect(stats.additions).toBe(0);
    expect(stats.removals).toBe(1);
    expect(stats.unchanged).toBe(2);
  });

  test("identical text → zero changes", () => {
    const stats = diffStats("same text", "same text");
    expect(stats.additions).toBe(0);
    expect(stats.removals).toBe(0);
    expect(stats.unchanged).toBe(2);
  });

  test("ignores whitespace-only tokens", () => {
    const stats = diffStats("a  b", "a b");
    expect(stats.additions).toBe(0);
    expect(stats.removals).toBe(0);
  });
});

describe("buildAcceptedText", () => {
  test("accepted clauses use revised text", () => {
    const clauses = [
      { original: "old1", revised: "new1", accepted: true },
      { original: "old2", revised: "new2", accepted: false },
    ];
    expect(buildAcceptedText(clauses)).toBe("new1\n\nold2");
  });

  test("undefined accepted defaults to original", () => {
    const clauses = [{ original: "keep", revised: "change" }];
    expect(buildAcceptedText(clauses)).toBe("keep");
  });

  test("empty clauses → empty string", () => {
    expect(buildAcceptedText([])).toBe("");
  });

  test("all accepted → all revised", () => {
    const clauses = [
      { original: "a1", revised: "b1", accepted: true },
      { original: "a2", revised: "b2", accepted: true },
    ];
    expect(buildAcceptedText(clauses)).toBe("b1\n\nb2");
  });
});
