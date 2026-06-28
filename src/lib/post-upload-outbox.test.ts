import { afterEach, describe, expect, it, vi } from "vitest";
import { enqueuePostUploadTask } from "@/lib/post-upload-outbox";

describe("post-upload outbox", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("throws when the engine does not persist the task", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("not found", { status: 404 }))
      .mockResolvedValueOnce(new Response("write failed", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      enqueuePostUploadTask(
        {
          doc_slug: "documents/akte/eingabe.pdf",
          case_slug: "legal/cases/1",
          brain_id: "brain-1",
          task_type: "analyze",
        },
        "brain-1"
      )
    ).rejects.toThrow(/task_create_failed_500/);
  });

  it("keeps an already pending task idempotent", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ frontmatter: { status: "pending" } }));
    vi.stubGlobal("fetch", fetchMock);

    await enqueuePostUploadTask(
      {
        doc_slug: "documents/akte/eingabe.pdf",
        brain_id: "brain-1",
        task_type: "analyze",
      },
      "brain-1"
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/legal/post-upload-tasks/analyze/");
  });
});
