/**
 * Presigned URL upload client — three-step direct-to-storage upload flow.
 *
 * Step 1: POST /api/upload/presign → get presigned URL + upload_token
 * Step 2: PUT file directly to storage (S3/R2) or stream to engine (local)
 * Step 3: POST /api/upload/confirm → trigger extraction + import
 *
 * For local storage (no presigned URL), falls back to streaming PUT
 * to the engine's /api/upload/stream/:token endpoint.
 *
 * Adaptive concurrency: dynamically adjusts parallel uploads based on
 * file size and observed throughput (Harvey-style).
 */

export interface PresignResult {
  mode: "presigned" | "streaming";
  url: string;
  method: string;
  headers: Record<string, string>;
  upload_token: string;
  filename: string;
  content_type: string;
  storage_path?: string;
  expires_at: number;
  upload_url?: string;
}

export interface ConfirmResult {
  slug: string;
  title: string;
  original_persisted: boolean;
  persist_error?: string;
  async?: boolean;
  extraction_status?: string;
  extraction_method?: string;
  split?: boolean;
  part_count?: number;
  part_slugs?: string[];
}

export interface UploadProgress {
  filename: string;
  phase: "presigning" | "uploading" | "confirming" | "done" | "error";
  uploadedBytes: number;
  totalBytes: number;
  percent: number;
  result?: ConfirmResult;
  error?: string;
}

export interface UploadOptions {
  caseSlug?: string;
  title?: string;
  tags?: string[];
  password?: string;
  source?: string;
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
}

/** Adaptive concurrency based on file sizes (Harvey-style). */
function computeConcurrency(files: File[]): number {
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  const avgSize = totalSize / files.length;
  // Small files (< 5MB avg): up to 6 parallel
  // Medium files (< 50MB avg): up to 3 parallel
  // Large files (>= 50MB avg): 2 parallel
  if (avgSize < 5 * 1024 * 1024) return Math.min(6, files.length);
  if (avgSize < 50 * 1024 * 1024) return Math.min(3, files.length);
  return Math.min(2, files.length);
}

/**
 * PUT a file to a URL with real upload progress via XMLHttpRequest.
 * fetch() doesn't support upload progress, so we use XHR for the storage PUT.
 */
function putWithProgress(
  url: string,
  file: File,
  headers: Record<string, string>,
  method: string,
  onProgress?: (uploadedBytes: number, totalBytes: number) => void,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    for (const [k, v] of Object.entries(headers)) {
      xhr.setRequestHeader(k, v);
    }

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress?.(e.loaded, e.total);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Storage upload failed: ${xhr.status}`));
    };

    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.ontimeout = () => reject(new Error("Upload timed out"));

    if (signal) {
      signal.addEventListener("abort", () => {
        xhr.abort();
        reject(new Error("Upload aborted"));
      });
    }

    xhr.send(file);
  });
}

/** Upload a single file via the presigned URL flow. */
export async function uploadFile(file: File, opts: UploadOptions = {}): Promise<ConfirmResult> {
  const { onProgress, signal } = opts;
  const filename = file.name;
  const totalBytes = file.size;

  // Step 1: Presign
  onProgress?.({
    filename,
    phase: "presigning",
    uploadedBytes: 0,
    totalBytes,
    percent: 0,
  });

  const presignRes = await fetch("/api/upload/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename,
      size: file.size,
      content_type: file.type || undefined,
      case_slug: opts.caseSlug,
      title: opts.title,
      tags: opts.tags,
      password: opts.password,
      source: opts.source,
    }),
    signal,
  });

  if (!presignRes.ok) {
    const err = await presignRes.json().catch(() => ({}));
    const msg = (err as Record<string, string>).message ?? "Presign fehlgeschlagen";
    onProgress?.({
      filename,
      phase: "error",
      uploadedBytes: 0,
      totalBytes,
      percent: 0,
      error: msg,
    });
    throw new Error(msg);
  }

  const presign = (await presignRes.json()) as PresignResult;

  // Step 2: Upload to storage
  onProgress?.({
    filename,
    phase: "uploading",
    uploadedBytes: 0,
    totalBytes,
    percent: 0,
  });

  if (presign.mode === "presigned") {
    // Direct PUT to S3/R2 with real progress tracking via XHR
    await putWithProgress(
      presign.url,
      file,
      presign.headers,
      presign.method,
      (uploaded, total) => {
        const pct = total > 0 ? Math.round((uploaded / total) * 100) : 0;
        onProgress?.({
          filename,
          phase: "uploading",
          uploadedBytes: uploaded,
          totalBytes: total,
          percent: pct,
        });
      },
      signal
    );
  } else {
    // Streaming fallback: PUT to engine with progress via XHR
    const streamUrl = presign.upload_url ?? `/api/upload/stream/${presign.upload_token}`;
    try {
      await putWithProgress(
        streamUrl,
        file,
        { "Content-Type": file.type || "application/octet-stream" },
        "PUT",
        (uploaded, total) => {
          const pct = total > 0 ? Math.round((uploaded / total) * 100) : 0;
          onProgress?.({
            filename,
            phase: "uploading",
            uploadedBytes: uploaded,
            totalBytes: total,
            percent: pct,
          });
        },
        signal
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : `Stream upload failed`;
      onProgress?.({
        filename,
        phase: "error",
        uploadedBytes: 0,
        totalBytes,
        percent: 0,
        error: msg,
      });
      throw err;
    }
  }

  onProgress?.({
    filename,
    phase: "uploading",
    uploadedBytes: totalBytes,
    totalBytes,
    percent: 100,
  });

  // Step 3: Confirm (with SSE progress if supported)
  onProgress?.({
    filename,
    phase: "confirming",
    uploadedBytes: totalBytes,
    totalBytes,
    percent: 100,
  });

  const confirmRes = await fetch("/api/upload/confirm", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      upload_token: presign.upload_token,
      case_slug: opts.caseSlug,
      source: opts.source,
    }),
    signal,
  });

  if (!confirmRes.ok) {
    const err = await confirmRes.json().catch(() => ({}));
    const msg = (err as Record<string, string>).message ?? "Confirm fehlgeschlagen";
    onProgress?.({
      filename,
      phase: "error",
      uploadedBytes: totalBytes,
      totalBytes,
      percent: 100,
      error: msg,
    });
    throw new Error(msg);
  }

  // Check if we got an SSE stream or plain JSON
  const contentType = confirmRes.headers.get("content-type") ?? "";
  let result: ConfirmResult;

  if (contentType.includes("text/event-stream")) {
    // Parse SSE events
    const reader = confirmRes.body?.getReader();
    if (!reader) throw new Error("SSE stream not readable");
    const decoder = new TextDecoder();
    let buffer = "";
    let lastResult: ConfirmResult | null = null;
    let lastError: string | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Parse complete SSE events (separated by \n\n)
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";

      for (const eventBlock of events) {
        const lines = eventBlock.split("\n");
        let eventType = "";
        let data = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) eventType = line.slice(7);
          else if (line.startsWith("data: ")) data = line.slice(6);
        }
        if (!eventType || !data) continue;

        try {
          const parsed = JSON.parse(data);
          if (eventType === "progress") {
            // Map server phases to client progress
            const phase = parsed.phase as string;
            if (phase === "downloading") {
              onProgress?.({
                filename,
                phase: "confirming",
                uploadedBytes: totalBytes,
                totalBytes,
                percent: 100,
              });
            } else if (phase === "scanning") {
              onProgress?.({
                filename,
                phase: "confirming",
                uploadedBytes: totalBytes,
                totalBytes,
                percent: 100,
              });
            } else if (phase === "extracting") {
              onProgress?.({
                filename,
                phase: "confirming",
                uploadedBytes: totalBytes,
                totalBytes,
                percent: 100,
              });
            }
          } else if (eventType === "done") {
            lastResult = parsed as ConfirmResult;
          } else if (eventType === "error") {
            lastError = parsed.message ?? parsed.error ?? "Confirm failed";
          }
        } catch {
          // ignore parse errors
        }
      }
    }

    if (lastError) {
      onProgress?.({
        filename,
        phase: "error",
        uploadedBytes: totalBytes,
        totalBytes,
        percent: 100,
        error: lastError,
      });
      throw new Error(lastError);
    }
    if (!lastResult) throw new Error("SSE stream ended without result");
    result = lastResult;
  } else {
    // Plain JSON response
    result = (await confirmRes.json()) as ConfirmResult;
  }
  onProgress?.({
    filename,
    phase: "done",
    uploadedBytes: totalBytes,
    totalBytes,
    percent: 100,
    result,
  });

  return result;
}

/** Upload multiple files with adaptive parallelism. */
export async function uploadFiles(
  files: File[],
  opts: UploadOptions = {}
): Promise<Array<{ file: File; result?: ConfirmResult; error?: string }>> {
  const concurrency = computeConcurrency(files);
  const results: Array<{ file: File; result?: ConfirmResult; error?: string }> = [];
  let index = 0;

  async function worker() {
    while (index < files.length) {
      const current = files[index++];
      try {
        const result = await uploadFile(current, opts);
        results.push({ file: current, result });
      } catch (err) {
        results.push({
          file: current,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  return results;
}

/** Upload a folder of files (webkitdirectory / drag-and-drop). */
export async function uploadFolder(
  fileList: FileList | File[],
  opts: UploadOptions = {}
): Promise<Array<{ file: File; result?: ConfirmResult; error?: string }>> {
  const files = Array.from(fileList).filter((f) => {
    // Skip hidden files and OS metadata
    const name = f.name.split("/").pop() ?? f.name;
    return !name.startsWith(".") && !name.startsWith("~") && f.size > 0;
  });

  if (files.length === 0) {
    return [];
  }

  // Use batch presign for efficiency when > 5 files
  if (files.length > 5) {
    return uploadFilesBatch(files, opts);
  }

  return uploadFiles(files, opts);
}

/** Batch presign: get all presigned URLs in one request, then upload in parallel. */
async function uploadFilesBatch(
  files: File[],
  opts: UploadOptions
): Promise<Array<{ file: File; result?: ConfirmResult; error?: string }>> {
  const { onProgress, signal } = opts;

  // Step 1: Batch presign
  const presignRes = await fetch("/api/upload/presign-batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      files: files.map((f) => ({
        filename: f.name,
        content_type: f.type || undefined,
        size: f.size,
      })),
      case_slug: opts.caseSlug,
      source: opts.source,
    }),
    signal,
  });

  if (!presignRes.ok) {
    const err = await presignRes.json().catch(() => ({}));
    const msg = (err as Record<string, string>).message ?? "Batch presign fehlgeschlagen";
    throw new Error(msg);
  }

  const batchResult = (await presignRes.json()) as {
    mode: string;
    files: Array<{
      filename: string;
      ok: boolean;
      mode?: "presigned" | "streaming";
      url?: string;
      method?: string;
      headers?: Record<string, string>;
      upload_token?: string;
      upload_url?: string;
      expires_at?: number;
      error?: string;
    }>;
    confirm_url: string;
  };

  // Step 2: Upload all files in parallel with adaptive concurrency
  const concurrency = computeConcurrency(files);
  const results: Array<{ file: File; result?: ConfirmResult; error?: string }> = [];
  let fileIdx = 0;

  async function batchWorker() {
    while (fileIdx < files.length) {
      const idx = fileIdx++;
      const file = files[idx];
      const presign = batchResult.files[idx];

      if (!presign || !presign.ok) {
        results.push({
          file,
          error: presign?.error ?? "Presign failed for this file",
        });
        continue;
      }

      try {
        onProgress?.({
          filename: file.name,
          phase: "uploading",
          uploadedBytes: 0,
          totalBytes: file.size,
          percent: 0,
        });

        // Upload to storage with real progress via XHR
        if (presign.mode === "presigned" && presign.url) {
          await putWithProgress(
            presign.url,
            file,
            presign.headers ?? {},
            presign.method ?? "PUT",
            (uploaded, total) => {
              const pct = total > 0 ? Math.round((uploaded / total) * 100) : 0;
              onProgress?.({
                filename: file.name,
                phase: "uploading",
                uploadedBytes: uploaded,
                totalBytes: total,
                percent: pct,
              });
            },
            signal
          );
        } else if (presign.upload_url) {
          await putWithProgress(
            presign.upload_url,
            file,
            { "Content-Type": file.type || "application/octet-stream" },
            "PUT",
            (uploaded, total) => {
              const pct = total > 0 ? Math.round((uploaded / total) * 100) : 0;
              onProgress?.({
                filename: file.name,
                phase: "uploading",
                uploadedBytes: uploaded,
                totalBytes: total,
                percent: pct,
              });
            },
            signal
          );
        }

        onProgress?.({
          filename: file.name,
          phase: "confirming",
          uploadedBytes: file.size,
          totalBytes: file.size,
          percent: 100,
        });

        // Confirm (with SSE progress if supported)
        const confirmRes = await fetch("/api/upload/confirm", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify({
            upload_token: presign.upload_token,
            case_slug: opts.caseSlug,
            source: opts.source,
          }),
          signal,
        });

        if (!confirmRes.ok) {
          const err = await confirmRes.json().catch(() => ({}));
          throw new Error((err as Record<string, string>).message ?? "Confirm failed");
        }

        const contentType = confirmRes.headers.get("content-type") ?? "";
        let result: ConfirmResult;

        if (contentType.includes("text/event-stream")) {
          const reader = confirmRes.body?.getReader();
          if (!reader) throw new Error("SSE stream not readable");
          const decoder = new TextDecoder();
          let buffer = "";
          let lastResult: ConfirmResult | null = null;
          let lastError: string | null = null;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split("\n\n");
            buffer = events.pop() ?? "";
            for (const eventBlock of events) {
              const lines = eventBlock.split("\n");
              let eventType = "";
              let data = "";
              for (const line of lines) {
                if (line.startsWith("event: ")) eventType = line.slice(7);
                else if (line.startsWith("data: ")) data = line.slice(6);
              }
              if (!eventType || !data) continue;
              try {
                const parsed = JSON.parse(data);
                if (eventType === "progress") {
                  onProgress?.({
                    filename: file.name,
                    phase: "confirming",
                    uploadedBytes: file.size,
                    totalBytes: file.size,
                    percent: 100,
                  });
                } else if (eventType === "done") {
                  lastResult = parsed as ConfirmResult;
                } else if (eventType === "error") {
                  lastError = parsed.message ?? parsed.error ?? "Confirm failed";
                }
              } catch {
                /* ignore parse errors */
              }
            }
          }
          if (lastError) throw new Error(lastError);
          if (!lastResult) throw new Error("SSE stream ended without result");
          result = lastResult;
        } else {
          result = (await confirmRes.json()) as ConfirmResult;
        }
        onProgress?.({
          filename: file.name,
          phase: "done",
          uploadedBytes: file.size,
          totalBytes: file.size,
          percent: 100,
          result,
        });

        results.push({ file, result });
      } catch (err) {
        results.push({
          file,
          error: err instanceof Error ? err.message : String(err),
        });
        onProgress?.({
          filename: file.name,
          phase: "error",
          uploadedBytes: 0,
          totalBytes: file.size,
          percent: 0,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => batchWorker());
  await Promise.all(workers);

  return results;
}
