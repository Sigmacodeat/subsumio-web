// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import {
  saveUploadSession,
  getUploadSession,
  deleteUploadSession,
  updateSessionParts,
  cleanupExpiredSessions,
  type UploadSession,
} from "./upload-session-store";

function makeSession(overrides?: Partial<UploadSession>): UploadSession {
  return {
    id: "token-test-file-1000",
    filename: "test.pdf",
    fileSize: 1000,
    fileType: "application/pdf",
    uploadToken: "token",
    uploadId: "upload-123",
    storagePath: "unscanned/tenant/test.pdf",
    partSize: 8 * 1024 * 1024,
    partCount: 1,
    completedParts: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe("upload-session-store", () => {
  beforeEach(async () => {
    // Clean up all entries between tests
    await cleanupExpiredSessions();
  });

  it("saves and retrieves a session", async () => {
    const session = makeSession();
    await saveUploadSession(session);
    const retrieved = await getUploadSession("test.pdf", 1000, "token");
    expect(retrieved).not.toBeNull();
    expect(retrieved!.filename).toBe("test.pdf");
    expect(retrieved!.uploadId).toBe("upload-123");
  });

  it("returns null for non-existent session", async () => {
    const result = await getUploadSession("nonexistent.pdf", 999, "no-token");
    expect(result).toBeNull();
  });

  it("deletes a session", async () => {
    const session = makeSession();
    await saveUploadSession(session);
    await deleteUploadSession("test.pdf", 1000, "token");
    const result = await getUploadSession("test.pdf", 1000, "token");
    expect(result).toBeNull();
  });

  it("updates completed parts", async () => {
    const session = makeSession();
    await saveUploadSession(session);
    const parts = [{ part_number: 1, etag: "abc123" }];
    await updateSessionParts(session, parts);
    const retrieved = await getUploadSession("test.pdf", 1000, "token");
    expect(retrieved).not.toBeNull();
    expect(retrieved!.completedParts).toHaveLength(1);
    expect(retrieved!.completedParts[0].etag).toBe("abc123");
  });

  it("cleans up expired sessions", async () => {
    // Write directly to IndexedDB to set an old updatedAt (saveUploadSession
    // always uses Date.now() for updatedAt, which is correct behavior)
    const oldTime = Date.now() - 25 * 60 * 60 * 1000; // 25h ago
    const expired = makeSession({
      id: "token-old.pdf-1000",
      filename: "old.pdf",
      updatedAt: oldTime,
    });
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("subsumio-uploads", 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains("sessions")) {
          req.result.createObjectStore("sessions", { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction("sessions", "readwrite");
    tx.objectStore("sessions").put({ ...expired, id: "token-old.pdf-1000", updatedAt: oldTime });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();

    // getUploadSession should auto-delete expired
    const result = await getUploadSession("old.pdf", 1000, "token");
    expect(result).toBeNull();
  });

  it("handles different files with same token independently", async () => {
    const s1 = makeSession({ id: "token-fileA-1000", filename: "fileA.pdf" });
    const s2 = makeSession({ id: "token-fileB-2000", filename: "fileB.pdf", fileSize: 2000 });
    await saveUploadSession(s1);
    await saveUploadSession(s2);
    const r1 = await getUploadSession("fileA.pdf", 1000, "token");
    const r2 = await getUploadSession("fileB.pdf", 2000, "token");
    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();
    expect(r1!.filename).toBe("fileA.pdf");
    expect(r2!.filename).toBe("fileB.pdf");
  });
});
