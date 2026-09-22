import { describe, it, expect } from "vitest";
import { buildFolderTree, folderMatches } from "@/lib/folder-tree";

describe("buildFolderTree", () => {
  it("builds flat root nodes sorted de-DE", () => {
    const tree = buildFolderTree(["Verträge", "Korrespondenz", "Ämter"]);
    expect(tree.map((n) => n.path)).toEqual(["Ämter", "Korrespondenz", "Verträge"]);
  });

  it("nests paths via / and creates implicit intermediate nodes", () => {
    const tree = buildFolderTree(["Korrespondenz/Ausgehend"]);
    expect(tree).toHaveLength(1);
    const root = tree[0];
    expect(root.name).toBe("Korrespondenz");
    expect(root.path).toBe("Korrespondenz");
    expect(root.count).toBe(0);
    expect(root.children.map((c) => c.path)).toEqual(["Korrespondenz/Ausgehend"]);
  });

  it("merges shared prefixes into one parent", () => {
    const tree = buildFolderTree([
      "Korrespondenz/Ausgehend",
      "Korrespondenz/Eingehend",
      "Verträge",
    ]);
    expect(tree).toHaveLength(2);
    expect(tree[0].children.map((c) => c.name)).toEqual(["Ausgehend", "Eingehend"]);
  });

  it("accumulates count per exact path and totalCount incl. children", () => {
    const tree = buildFolderTree(
      ["Korrespondenz", "Korrespondenz/Ausgehend", "Korrespondenz/Ausgehend/2026"],
      {
        Korrespondenz: 3,
        "Korrespondenz/Ausgehend": 5,
        "Korrespondenz/Ausgehend/2026": 2,
      }
    );
    const root = tree[0];
    expect(root.count).toBe(3);
    expect(root.totalCount).toBe(10);
    expect(root.children[0].totalCount).toBe(7);
    expect(root.children[0].children[0].totalCount).toBe(2);
  });

  it("deduplicates paths and ignores empty entries", () => {
    const tree = buildFolderTree(["A", "A", "", "A/B"]);
    expect(tree).toHaveLength(1);
    expect(tree[0].children).toHaveLength(1);
  });

  it("handles deeper nesting levels", () => {
    const tree = buildFolderTree(["a/b/c/d"]);
    let node = tree[0];
    for (const seg of ["a", "b", "c", "d"]) {
      expect(node.name).toBe(seg);
      node = node.children[0];
    }
  });

  it("defaults missing counts to 0", () => {
    const tree = buildFolderTree(["X/Y"], {});
    expect(tree[0].totalCount).toBe(0);
    expect(tree[0].children[0].totalCount).toBe(0);
  });
});

describe("folderMatches", () => {
  it('"all" matches everything including unfiled', () => {
    expect(folderMatches("Korrespondenz", "all")).toBe(true);
    expect(folderMatches(undefined, "all")).toBe(true);
  });

  it('"" matches only unfiled documents', () => {
    expect(folderMatches(undefined, "")).toBe(true);
    expect(folderMatches("Korrespondenz", "")).toBe(false);
  });

  it("matches the exact folder", () => {
    expect(folderMatches("Korrespondenz", "Korrespondenz")).toBe(true);
  });

  it("matches descendants of the selected folder", () => {
    expect(folderMatches("Korrespondenz/Ausgehend", "Korrespondenz")).toBe(true);
    expect(folderMatches("Korrespondenz/Ausgehend/2026", "Korrespondenz")).toBe(true);
  });

  it("does not match siblings or prefix-lookalikes", () => {
    expect(folderMatches("Verträge", "Korrespondenz")).toBe(false);
    expect(folderMatches("Korrespondenz-Alt", "Korrespondenz")).toBe(false);
    expect(folderMatches("Korrespondenz2/X", "Korrespondenz")).toBe(false);
  });

  it("unfiled docs never match a folder selection", () => {
    expect(folderMatches(undefined, "Korrespondenz")).toBe(false);
  });
});
