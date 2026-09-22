// @vitest-environment node

import { describe, test, expect } from "vitest";
import { buildFolderTree, folderMatches } from "./folder-tree";

describe("buildFolderTree", () => {
  test("builds nested tree from slash-separated paths", () => {
    const tree = buildFolderTree(["Korrespondenz/Ausgehend", "Korrespondenz/Eingehend", "Vertrag"]);
    expect(tree).toHaveLength(2);
    const korr = tree.find((n) => n.name === "Korrespondenz")!;
    expect(korr.children.map((c) => c.name)).toEqual(["Ausgehend", "Eingehend"]);
    expect(korr.path).toBe("Korrespondenz");
    expect(korr.children[0].path).toBe("Korrespondenz/Ausgehend");
  });

  test("accumulates counts from leaf to root", () => {
    const tree = buildFolderTree(["a/b", "a/c", "a"], {
      a: 2,
      "a/b": 3,
      "a/c": 1,
    });
    const a = tree[0];
    expect(a.count).toBe(2);
    expect(a.totalCount).toBe(6);
    expect(a.children.find((c) => c.name === "b")!.count).toBe(3);
  });

  test("handles empty and duplicate paths", () => {
    expect(buildFolderTree([])).toEqual([]);
    const tree = buildFolderTree(["x", "x", ""]);
    expect(tree).toHaveLength(1);
    expect(tree[0].path).toBe("x");
  });

  test("sorts alphabetically (de locale)", () => {
    const tree = buildFolderTree(["Zebra", "Alpha", "Mitte"]);
    expect(tree.map((n) => n.name)).toEqual(["Alpha", "Mitte", "Zebra"]);
  });
});

describe("folderMatches", () => {
  test("all matches everything", () => {
    expect(folderMatches("a/b", "all")).toBe(true);
    expect(folderMatches(undefined, "all")).toBe(true);
  });

  test("empty selection matches only unfiled", () => {
    expect(folderMatches(undefined, "")).toBe(true);
    expect(folderMatches("a", "")).toBe(false);
  });

  test("prefix matching includes subfolders", () => {
    expect(folderMatches("Korrespondenz/Ausgehend", "Korrespondenz")).toBe(true);
    expect(folderMatches("Korrespondenz", "Korrespondenz")).toBe(true);
    expect(folderMatches("KorrespondenzAlt/x", "Korrespondenz")).toBe(false);
    expect(folderMatches(undefined, "Korrespondenz")).toBe(false);
  });
});
