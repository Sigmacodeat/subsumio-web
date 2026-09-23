// @vitest-environment node

import type { BrainPage } from "@/lib/types";
import { describe, test, expect, vi, beforeEach } from "vitest";

// Engine traffic goes through the caller's headers, never the browser client.
vi.mock("./api", () => ({
  api: new Proxy(
    {},
    {
      get() {
        throw new Error("comments must not use the browser API client");
      },
    }
  ),
}));

vi.mock("./engine-page-io", () => ({
  getEnginePage: vi.fn(async () => null),
  writeEnginePage: vi.fn(async () => undefined),
}));

vi.mock("./engine-pages", () => ({
  listEnginePages: vi.fn(async () => []),
}));

vi.mock("./auth/store", () => ({
  getSharedPgPool: vi.fn(() => null),
}));

vi.mock("./env", () => ({
  env: vi.fn((key: string) => process.env[key]),
}));

import {
  extractMentions,
  addComment,
  listComments,
  deleteComment,
  CommentAccessError,
  commentMatterSlug,
} from "./comments";
import { getEnginePage, writeEnginePage } from "./engine-page-io";
import { listEnginePages } from "./engine-pages";

const H = { "x-subsumio-source": "brain-1", "x-subsumio-identity-token": "signed" };
const mockWrite = vi.mocked(writeEnginePage);
const mockList = vi.mocked(listEnginePages);
const mockGet = vi.mocked(getEnginePage);

describe("extractMentions", () => {
  test("returns empty array for no mentions", () => {
    expect(extractMentions("Hello world")).toEqual([]);
  });

  test("extracts single @mention", () => {
    expect(extractMentions("Hello @max")).toEqual(["max"]);
  });

  test("extracts multiple @mentions", () => {
    const result = extractMentions("Hi @max and @anna");
    expect(result).toContain("max");
    expect(result).toContain("anna");
    expect(result).toHaveLength(2);
  });

  test("deduplicates mentions", () => {
    expect(extractMentions("@max @max @max")).toEqual(["max"]);
  });

  test("handles mentions with dots and dashes", () => {
    expect(extractMentions("Hello @max.mustermann")).toContain("max.mustermann");
    expect(extractMentions("Hello @user-name")).toContain("user-name");
  });

  test("ignores @ at start of string with short name", () => {
    // The regex requires at least 2 chars between @ and end: \w[\w.-]{1,30}\w
    expect(extractMentions("@a")).toEqual([]);
  });

  test("handles empty string", () => {
    expect(extractMentions("")).toEqual([]);
  });

  test("handles mentions at different positions", () => {
    const result = extractMentions("@user1 middle @user2 end");
    expect(result).toEqual(["user1", "user2"]);
  });
});

describe("addComment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("creates a comment with correct slug format", async () => {
    await addComment(H, {
      parentSlug: "cases/2024-001",
      parentType: "case",
      authorId: "user-1",
      authorName: "Max",
      content: "Test comment",
    });
    expect(mockWrite).toHaveBeenCalledOnce();
    const call = mockWrite.mock.calls[0][1];
    expect(call.slug).toContain("comment/cases-2024-001/");
    expect(call.type).toBe("comment");
  });

  test("sets frontmatter with parent_slug and author", async () => {
    await addComment(H, {
      parentSlug: "cases/2024-001",
      parentType: "case",
      authorId: "user-1",
      authorName: "Max",
      content: "Test",
    });
    const call = mockWrite.mock.calls[0][1];
    expect(call.frontmatter!).toHaveProperty("parent_slug", "cases/2024-001");
    expect(call.frontmatter!).toHaveProperty("parent_type", "case");
    expect(call.frontmatter!).toHaveProperty("author_id", "user-1");
    expect(call.frontmatter!).toHaveProperty("author_name", "Max");
  });

  test("extracts mentions and stores in frontmatter", async () => {
    await addComment(H, {
      parentSlug: "cases/1",
      parentType: "case",
      authorId: "u1",
      authorName: "Max",
      content: "Hey @anna check this",
    });
    const call = mockWrite.mock.calls[0][1];
    expect(call.frontmatter!).toHaveProperty("mentions");
    expect(call.frontmatter!.mentions).toContain("anna");
  });

  test("sets mentions to null when no mentions", async () => {
    await addComment(H, {
      parentSlug: "cases/1",
      parentType: "case",
      authorId: "u1",
      authorName: "Max",
      content: "No mentions here",
    });
    const call = mockWrite.mock.calls[0][1];
    expect(call.frontmatter!.mentions).toBeNull();
  });

  test("generates threadId from parentCommentId when provided", async () => {
    const result = await addComment(H, {
      parentSlug: "cases/1",
      parentType: "case",
      authorId: "u1",
      authorName: "Max",
      content: "Reply",
      parentCommentId: "comment/cases-1/123",
    });
    expect(result.threadId).toBe("comment/cases-1/123");
  });

  test("generates threadId from slug when no parentCommentId", async () => {
    const result = await addComment(H, {
      parentSlug: "cases/1",
      parentType: "case",
      authorId: "u1",
      authorName: "Max",
      content: "Top level",
    });
    expect(result.threadId).toBe(result.id);
  });

  test("returns Comment object with correct fields", async () => {
    const result = await addComment(H, {
      parentSlug: "cases/1",
      parentType: "case",
      authorId: "u1",
      authorName: "Max",
      content: "Test",
    });
    expect(result.parentSlug).toBe("cases/1");
    expect(result.authorId).toBe("u1");
    expect(result.content).toBe("Test");
  });
});

describe("listComments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns empty array on error", async () => {
    mockList.mockRejectedValueOnce(new Error("fail"));
    const result = await listComments(H, "cases/1");
    expect(result).toEqual([]);
  });

  test("filters comments by parent_slug", async () => {
    mockList.mockResolvedValueOnce([
      {
        slug: "comment/cases-1/1",
        content: "Comment 1",
        frontmatter: {
          parent_slug: "cases/1",
          parent_type: "case",
          author_id: "u1",
          author_name: "Max",
          created_at: "2024-01-01T10:00:00Z",
          thread_id: "t1",
        },
        title: "t",
        created_at: "2024-01-01T10:00:00Z",
        updated_at: "2024-01-01T10:00:00Z",
      },
      {
        slug: "comment/cases-2/2",
        content: "Comment 2",
        frontmatter: {
          parent_slug: "cases/2",
          parent_type: "case",
          author_id: "u2",
          author_name: "Anna",
          created_at: "2024-01-01T11:00:00Z",
          thread_id: "t2",
        },
        created_at: "2024-01-01T11:00:00Z",
        title: "t",
        updated_at: "2024-01-01T10:00:00Z",
      },
    ]);
    const result = await listComments(H, "cases/1");
    expect(result).toHaveLength(1);
    expect(result[0].parentSlug).toBe("cases/1");
  });

  test("shows [gelöscht] for soft-deleted comments", async () => {
    mockList.mockResolvedValueOnce([
      {
        slug: "comment/cases-1/1",
        content: "Original content",
        frontmatter: {
          parent_slug: "cases/1",
          parent_type: "case",
          author_id: "u1",
          author_name: "Max",
          created_at: "2024-01-01T10:00:00Z",
          thread_id: "t1",
          deleted_at: "2024-06-01T00:00:00Z",
        },
        title: "t",
        created_at: "2024-01-01T10:00:00Z",
        updated_at: "2024-01-01T10:00:00Z",
      },
    ]);
    const result = await listComments(H, "cases/1");
    expect(result[0].content).toBe("[gelöscht]");
    expect(result[0].deletedAt).toBe("2024-06-01T00:00:00Z");
  });

  test("sorts comments by createdAt ascending", async () => {
    mockList.mockResolvedValueOnce([
      {
        slug: "c2",
        content: "Later",
        frontmatter: {
          parent_slug: "cases/1",
          created_at: "2024-06-01T10:00:00Z",
          thread_id: "t2",
        },
        created_at: "2024-06-01T10:00:00Z",
        title: "t",
        updated_at: "2024-01-01T10:00:00Z",
      },
      {
        slug: "c1",
        content: "Earlier",
        frontmatter: {
          parent_slug: "cases/1",
          created_at: "2024-01-01T10:00:00Z",
          thread_id: "t1",
        },
        title: "t",
        created_at: "2024-01-01T10:00:00Z",
        updated_at: "2024-01-01T10:00:00Z",
      },
    ]);
    const result = await listComments(H, "cases/1");
    expect(result[0].id).toBe("c1");
    expect(result[1].id).toBe("c2");
  });
});

describe("deleteComment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns success:false when comment not found", async () => {
    mockGet.mockResolvedValueOnce(null as unknown as BrainPage);
    const result = await deleteComment(H, {
      commentId: "comment/nonexistent",
      authorId: "u1",
      userRole: "lawyer",
    });
    expect(result.success).toBe(false);
  });

  test("returns success:false when not author and not admin", async () => {
    mockGet.mockResolvedValueOnce({
      slug: "comment/1",
      frontmatter: { author_id: "u1" },
    } as unknown as BrainPage);
    const result = await deleteComment(H, {
      commentId: "comment/1",
      authorId: "u2",
      userRole: "lawyer",
    });
    expect(result.success).toBe(false);
  });

  test("succeeds when user is author", async () => {
    mockGet.mockResolvedValueOnce({
      slug: "comment/1",
      frontmatter: { author_id: "u1" },
    } as unknown as BrainPage);
    const result = await deleteComment(H, {
      commentId: "comment/1",
      authorId: "u1",
      userRole: "lawyer",
    });
    expect(result.success).toBe(true);
    expect(mockWrite).toHaveBeenCalledOnce();
  });

  test("succeeds when user is admin (even if not author)", async () => {
    mockGet.mockResolvedValueOnce({
      slug: "comment/1",
      frontmatter: { author_id: "u1" },
    } as unknown as BrainPage);
    const result = await deleteComment(H, {
      commentId: "comment/1",
      authorId: "u2",
      userRole: "admin",
    });
    expect(result.success).toBe(true);
    expect(mockWrite).toHaveBeenCalledOnce();
  });

  test("sets content to [gelöscht] and adds deleted_at", async () => {
    mockGet.mockResolvedValueOnce({
      slug: "comment/1",
      frontmatter: { author_id: "u1", parent_slug: "cases/1" },
    } as unknown as BrainPage);
    await deleteComment(H, { commentId: "comment/1", authorId: "u1", userRole: "lawyer" });
    const call = mockWrite.mock.calls[0][1];
    expect(call.content).toBe("[gelöscht]");
    expect(call.frontmatter!).toHaveProperty("deleted_at");
  });
});

describe("matter walls on comment threads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockReset();
    mockList.mockReset();
    mockWrite.mockReset();
  });

  test("derives the matter from matter-tab thread parents", () => {
    expect(commentMatterSlug("legal/cases/c-1/evidence/0")).toBe("legal/cases/c-1");
    expect(commentMatterSlug("legal/cases/c-1")).toBe("legal/cases/c-1");
    expect(commentMatterSlug("cases/1")).toBeUndefined();
  });

  test("listing a thread in a walled matter is refused", async () => {
    mockGet.mockResolvedValueOnce(null);
    await expect(listComments(H, "legal/cases/walled/deadline/0")).rejects.toBeInstanceOf(
      CommentAccessError
    );
    expect(mockGet).toHaveBeenCalledWith(H, "legal/cases/walled");
    expect(mockList).not.toHaveBeenCalled();
  });

  test("commenting in a walled matter is refused and writes nothing", async () => {
    mockGet.mockResolvedValueOnce(null);
    await expect(
      addComment(H, {
        parentSlug: "legal/cases/walled/evidence/1",
        parentType: "evidence",
        authorId: "u1",
        authorName: "Max",
        content: "x",
      })
    ).rejects.toBeInstanceOf(CommentAccessError);
    expect(mockWrite).not.toHaveBeenCalled();
  });

  test("new comments carry the matter as case_slug and their text in frontmatter", async () => {
    mockGet.mockResolvedValueOnce({ slug: "legal/cases/c-1" } as unknown as BrainPage);
    await addComment(H, {
      parentSlug: "legal/cases/c-1/evidence/1",
      parentType: "evidence",
      authorId: "u1",
      authorName: "Max",
      content: "Beweis fehlt",
    });
    const [headers, page] = mockWrite.mock.calls[0];
    expect(headers).toBe(H);
    expect(page.frontmatter).toMatchObject({
      case_slug: "legal/cases/c-1",
      content: "Beweis fehlt",
    });
  });

  test("lists by the thread's slug prefix with the caller's headers", async () => {
    mockGet.mockResolvedValueOnce({ slug: "legal/cases/c-1" } as unknown as BrainPage);
    mockList.mockResolvedValueOnce([
      {
        slug: "comment/legal-cases-c-1-evidence-1/1",
        title: "t",
        content: "",
        frontmatter: {
          parent_slug: "legal/cases/c-1/evidence/1",
          content: "Beweis fehlt",
          created_at: "2026-01-01T00:00:00Z",
        },
      },
    ]);
    const result = await listComments(H, "legal/cases/c-1/evidence/1");
    expect(mockList).toHaveBeenCalledWith(H, "comment", 500, {
      slugPrefix: "comment/legal-cases-c-1-evidence-1/",
    });
    expect(result[0].content).toBe("Beweis fehlt");
  });

  test("deleting a comment in a walled matter fails", async () => {
    mockGet
      .mockResolvedValueOnce({
        slug: "comment/x/1",
        frontmatter: { author_id: "u1", parent_slug: "legal/cases/walled/deadline/0" },
      } as unknown as BrainPage)
      .mockResolvedValueOnce(null);
    const result = await deleteComment(H, {
      commentId: "comment/x/1",
      authorId: "u1",
      userRole: "admin",
    });
    expect(result.success).toBe(false);
    expect(mockWrite).not.toHaveBeenCalled();
  });

  test("delete refuses ids that are not comment pages", async () => {
    const result = await deleteComment(H, {
      commentId: "legal/cases/c-1",
      authorId: "u1",
      userRole: "admin",
    });
    expect(result.success).toBe(false);
    expect(mockGet).not.toHaveBeenCalled();
  });
});
