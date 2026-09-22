import { describe, it, expect } from "vitest";
import { escapeXml, extractDavToken, parseDavPath, davFileName, davSlugForFile } from "./webdav.ts";

const req = (authorization?: string) =>
  ({ headers: { authorization } }) as Parameters<typeof extractDavToken>[0];

describe("webdav: escapeXml", () => {
  it("escapes all five XML entities", () => {
    expect(escapeXml(`a<b>&"'`)).toBe("a&lt;b&gt;&amp;&quot;&apos;");
  });
});

describe("webdav: extractDavToken", () => {
  it("reads Bearer tokens", () => {
    expect(extractDavToken(req("Bearer gbrain_abc123"))).toBe("gbrain_abc123");
  });
  it("reads the Basic password field (username ignored)", () => {
    const basic = Buffer.from("finder:gbrain_secret42").toString("base64");
    expect(extractDavToken(req(`Basic ${basic}`))).toBe("gbrain_secret42");
  });
  it("returns null without auth or on garbage", () => {
    expect(extractDavToken(req())).toBeNull();
    expect(extractDavToken(req("Basic !!!"))).toBeNull();
    expect(extractDavToken(req("Digest x"))).toBeNull();
  });
});

describe("webdav: parseDavPath", () => {
  it("splits clean paths", () => {
    expect(parseDavPath("/")).toEqual([]);
    expect(parseDavPath("/akte-1/doc.md")).toEqual(["akte-1", "doc.md"]);
  });
  it("decodes percent-encoding", () => {
    expect(parseDavPath("/akte%20x/f.md")).toEqual(["akte x", "f.md"]);
  });
  it("rejects traversal and reserved chars", () => {
    expect(parseDavPath("/../etc")).toBeNull();
    expect(parseDavPath("/%2e%2e/x")).toBeNull();
    expect(parseDavPath("/a?b")).toBeNull();
    expect(parseDavPath("/a:b")).toBeNull();
  });
});

describe("webdav: file name mapping", () => {
  it("flattens slugs with slashes into one filename", () => {
    expect(davFileName("import/akte/doc-1")).toBe("import_akte_doc-1.md");
  });
  it("round-trips via davSlugForFile", () => {
    const slugs = ["doc-a", "import/x/y"];
    expect(davSlugForFile("doc-a.md", slugs)).toBe("doc-a");
    expect(davSlugForFile("import_x_y.md", slugs)).toBe("import/x/y");
    expect(davSlugForFile("missing.md", slugs)).toBeNull();
  });
  it("is case-insensitive for Finder-style lookups", () => {
    expect(davSlugForFile("DOC-A.MD", ["doc-a"])).toBe("doc-a");
  });
});
