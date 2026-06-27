// @vitest-environment node

import { describe, test, expect, vi, beforeEach } from "vitest";

// Mock the api module
vi.mock("./api", () => ({
  api: {
    brain: {
      createPage: vi.fn(async () => ({})),
      listPages: vi.fn(async () => []),
      getPage: vi.fn(async () => null),
      updatePage: vi.fn(async () => ({})),
    },
  },
}));

vi.mock("./auth/store", () => ({
  getSharedPgPool: vi.fn(() => null),
}));

vi.mock("./env", () => ({
  env: vi.fn((key: string) => process.env[key]),
}));

import { extractMentions, addComment, listComments, deleteComment } from "./comments";
import { api } from "./api";

const mockCreatePage = vi.mocked(api.brain.createPage);
const mockListPages = vi.mocked(api.brain.listPages);
const mockGetPage = vi.mocked(api.brain.getPage);
const mockUpdatePage = vi.mocked(api.brain.updatePage);

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
    await addComment({
      parentSlug: "cases/2024-001",
      parentType: "case",
      authorId: "user-1",
      authorName: "Max",
      content: "Test comment",
    });
    expect(mockCreatePage).toHaveBeenCalledOnce();
    const call = mockCreatePage.mock.calls[0][0];
    expect(call.slug).toContain("comment/cases-2024-001/");
    expect(call.type).toBe("comment");
  });

  test("sets frontmatter with parent_slug and author", async () => {
    await addComment({
      parentSlug: "cases/2024-001",
      parentType: "case",
      authorId: "user-1",
      authorName: "Max",
      content: "Test",
    });
    const call = mockCreatePage.mock.calls[0][0];
    expect(call.frontmatter).toHaveProperty("parent_slug", "cases/2024-001");
    expect(call.frontmatter).toHaveProperty("parent_type", "case");
    expect(call.frontmatter).toHaveProperty("author_id", "user-1");
    expect(call.frontmatter).toHaveProperty("author_name", "Max");
  });

  test("extracts mentions and stores in frontmatter", async () => {
    await addComment({
      parentSlug: "cases/1",
      parentType: "case",
      authorId: "u1",
      authorName: "Max",
      content: "Hey @anna check this",
    });
    const call = mockCreatePage.mock.calls[0][0];
    expect(call.frontmatter).toHaveProperty("mentions");
    expect(call.frontmatter.mentions).toContain("anna");
  });

  test("sets mentions to null when no mentions", async () => {
    await addComment({
      parentSlug: "cases/1",
      parentType: "case",
      authorId: "u1",
      authorName: "Max",
      content: "No mentions here",
    });
    const call = mockCreatePage.mock.calls[0][0];
    expect(call.frontmatter.mentions).toBeNull();
  });

  test("generates threadId from parentCommentId when provided", async () => {
    const result = await addComment({
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
    const result = await addComment({
      parentSlug: "cases/1",
      parentType: "case",
      authorId: "u1",
      authorName: "Max",
      content: "Top level",
    });
    expect(result.threadId).toBe(result.id);
  });

  test("returns Comment object with correct fields", async () => {
    const result = await addComment({
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
    mockListPages.mockRejectedValueOnce(new Error("fail"));
    const result = await listComments("cases/1");
    expect(result).toEqual([]);
  });

  test("filters comments by parent_slug", async () => {
    mockListPages.mockResolvedValueOnce([
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
        created_at: "2024-01-01T10:00:00Z",
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
      },
    ]);
    const result = await listComments("cases/1");
    expect(result).toHaveLength(1);
    expect(result[0].parentSlug).toBe("cases/1");
  });

  test("shows [gelöscht] for soft-deleted comments", async () => {
    mockListPages.mockResolvedValueOnce([
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
        created_at: "2024-01-01T10:00:00Z",
      },
    ]);
    const result = await listComments("cases/1");
    expect(result[0].content).toBe("[gelöscht]");
    expect(result[0].deletedAt).toBe("2024-06-01T00:00:00Z");
  });

  test("sorts comments by createdAt ascending", async () => {
    mockListPages.mockResolvedValueOnce([
      {
        slug: "c2",
        content: "Later",
        frontmatter: {
          parent_slug: "cases/1",
          created_at: "2024-06-01T10:00:00Z",
          thread_id: "t2",
        },
        created_at: "2024-06-01T10:00:00Z",
      },
      {
        slug: "c1",
        content: "Earlier",
        frontmatter: {
          parent_slug: "cases/1",
          created_at: "2024-01-01T10:00:00Z",
          thread_id: "t1",
        },
        created_at: "2024-01-01T10:00:00Z",
      },
    ]);
    const result = await listComments("cases/1");
    expect(result[0].id).toBe("c1");
    expect(result[1].id).toBe("c2");
  });
});

describe("deleteComment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns success:false when comment not found", async () => {
    mockGetPage.mockResolvedValueOnce(null);
    const result = await deleteComment({
      commentId: "nonexistent",
      authorId: "u1",
      userRole: "lawyer",
    });
    expect(result.success).toBe(false);
  });

  test("returns success:false when not author and not admin", async () => {
    mockGetPage.mockResolvedValueOnce({
      slug: "comment/1",
      frontmatter: { author_id: "u1" },
    });
    const result = await deleteComment({
      commentId: "comment/1",
      authorId: "u2",
      userRole: "lawyer",
    });
    expect(result.success).toBe(false);
  });

  test("succeeds when user is author", async () => {
    mockGetPage.mockResolvedValueOnce({
      slug: "comment/1",
      frontmatter: { author_id: "u1" },
    });
    const result = await deleteComment({
      commentId: "comment/1",
      authorId: "u1",
      userRole: "lawyer",
    });
    expect(result.success).toBe(true);
    expect(mockUpdatePage).toHaveBeenCalledOnce();
  });

  test("succeeds when user is admin (even if not author)", async () => {
    mockGetPage.mockResolvedValueOnce({
      slug: "comment/1",
      frontmatter: { author_id: "u1" },
    });
    const result = await deleteComment({
      commentId: "comment/1",
      authorId: "u2",
      userRole: "admin",
    });
    expect(result.success).toBe(true);
    expect(mockUpdatePage).toHaveBeenCalledOnce();
  });

  test("sets content to [gelöscht] and adds deleted_at", async () => {
    mockGetPage.mockResolvedValueOnce({
      slug: "comment/1",
      frontmatter: { author_id: "u1", parent_slug: "cases/1" },
    });
    await deleteComment({ commentId: "comment/1", authorId: "u1", userRole: "lawyer" });
    const call = mockUpdatePage.mock.calls[0][0];
    expect(call.content).toBe("[gelöscht]");
    expect(call.frontmatter).toHaveProperty("deleted_at");
  });
});
