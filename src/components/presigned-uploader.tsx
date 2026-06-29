"use client";

import { useCallback, useRef, useState } from "react";
import { uploadFile, uploadFolder, type UploadProgress } from "@/lib/presigned-upload";
import { FolderOpen, X } from "lucide-react";

interface FileEntry {
  name: string;
  size: number;
  progress: UploadProgress | null;
  result?: { slug: string; title: string };
  error?: string;
}

interface PresignedUploaderProps {
  caseSlug?: string;
  source?: string;
  onUploaded?: (slug: string, title: string) => void;
}

export function PresignedUploader({
  caseSlug,
  source = "documents",
  onUploaded,
}: PresignedUploaderProps) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const updateFileProgress = (filename: string, progress: UploadProgress) => {
    setFiles((prev) =>
      prev.map((f) =>
        f.name === filename
          ? {
              ...f,
              progress,
              result: progress.result
                ? { slug: progress.result.slug, title: progress.result.title }
                : f.result,
              error: progress.error,
            }
          : f
      )
    );
  };

  const handleFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const fileArray = Array.from(fileList);
      if (fileArray.length === 0) return;

      // Client-side validation: reject empty files immediately
      const validFiles: File[] = [];
      const emptyFiles: string[] = [];
      for (const f of fileArray) {
        if (f.size === 0) {
          emptyFiles.push(f.name);
        } else {
          validFiles.push(f);
        }
      }

      const entries: FileEntry[] = fileArray.map((f) => ({
        name: f.name,
        size: f.size,
        progress: null,
        error: f.size === 0 ? "Leere Datei — wird übersprungen." : undefined,
      }));
      setFiles(entries);

      if (emptyFiles.length > 0 && validFiles.length === 0) {
        return;
      }

      setIsUploading(true);

      try {
        const filesToUpload = validFiles;
        if (filesToUpload.length > 1) {
          const results = await uploadFolder(filesToUpload, {
            caseSlug,
            source,
            onProgress: (p) => updateFileProgress(p.filename, p),
          });
          for (const r of results) {
            if (r.result) onUploaded?.(r.result.slug, r.result.title);
          }
        } else if (filesToUpload.length === 1) {
          const result = await uploadFile(filesToUpload[0]!, {
            caseSlug,
            source,
            onProgress: (p) => updateFileProgress(p.filename, p),
          });
          onUploaded?.(result.slug, result.title);
        }
      } finally {
        setIsUploading(false);
      }
    },
    [caseSlug, source, onUploaded]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles]
  );

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const phaseLabel = (phase: UploadProgress["phase"]) => {
    switch (phase) {
      case "presigning":
        return "Vorbereitung…";
      case "uploading":
        return "Wird hochgeladen…";
      case "confirming":
        return "Wird verarbeitet…";
      case "done":
        return "Fertig";
      case "error":
        return "Fehler";
    }
  };

  const totalProgress =
    files.length > 0
      ? Math.round(files.reduce((sum, f) => sum + (f.progress?.percent ?? 0), 0) / files.length)
      : 0;

  return (
    <div className="w-full">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors ${dragOver ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20" : "border-gray-300 hover:border-gray-400 dark:border-gray-700 dark:hover:border-gray-600"} ${isUploading ? "pointer-events-none opacity-60" : ""}`}
      >
        <svg
          className="mb-3 h-10 w-10 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
          />
        </svg>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Dateien hierher ziehen oder klicken zum Auswählen
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
          PDF, DOCX, Bilder, Audio — bis 500 MB · Ordner-Upload unterstützt
        </p>

        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
          accept=".pdf,.doc,.docx,.docm,.rtf,.odt,.xls,.xlsx,.xlsm,.ods,.ppt,.pptx,.pptm,.odp,.eml,.msg,.pst,.csv,.tsv,.txt,.md,.html,.htm,.json,.xml,.zip,.jpg,.jpeg,.png,.gif,.webp,.tif,.tiff,.bmp,.heic,.heif,.avif,.svg,.mp3,.wav,.m4a,.ogg,.flac,.mp4,.pages,.key,.numbers"
        />
        <input
          ref={folderInputRef}
          type="file"
          multiple
          className="hidden"
          // @ts-expect-error — webkitdirectory is non-standard but widely supported
          webkitdirectory=""
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />

        {/* Folder upload button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            folderInputRef.current?.click();
          }}
          disabled={isUploading}
          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-gray-400 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-600"
        >
          <FolderOpen size={14} />
          Ordner hochladen
        </button>
      </div>

      {files.length > 0 && (
        <div className="mt-4 space-y-2">
          {/* Overall progress */}
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-300">
              {isUploading ? "Wird hochgeladen…" : "Upload abgeschlossen"}
            </span>
            <div className="flex items-center gap-3">
              <span className="text-gray-500">{totalProgress}%</span>
              {!isUploading && (
                <button
                  type="button"
                  onClick={() => setFiles([])}
                  className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  <X size={12} /> Liste leeren
                </button>
              )}
            </div>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-300"
              style={{ width: `${totalProgress}%` }}
            />
          </div>

          {/* Per-file list */}
          <div className="max-h-64 space-y-1.5 overflow-y-auto">
            {files.map((file, idx) => (
              <div
                key={`${file.name}-${idx}`}
                className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-800"
              >
                {/* Status icon */}
                <div className="flex-shrink-0">
                  {file.progress?.phase === "done" ? (
                    <svg
                      className="h-5 w-5 text-green-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4.5 12.75l6 6 9-13.5"
                      />
                    </svg>
                  ) : file.progress?.phase === "error" ? (
                    <svg
                      className="h-5 w-5 text-red-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                      />
                    </svg>
                  ) : file.progress?.phase === "uploading" ||
                    file.progress?.phase === "confirming" ? (
                    <svg
                      className="h-5 w-5 animate-spin text-blue-500"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="h-5 w-5 text-gray-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                      />
                    </svg>
                  )}
                </div>

                {/* File info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-gray-700 dark:text-gray-300">
                      {file.name}
                    </span>
                    <span className="flex-shrink-0 text-xs text-gray-500">
                      {formatSize(file.size)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          file.progress?.phase === "error"
                            ? "bg-red-500"
                            : file.progress?.phase === "done"
                              ? "bg-green-500"
                              : "bg-blue-500"
                        }`}
                        style={{ width: `${file.progress?.percent ?? 0}%` }}
                      />
                    </div>
                    <span className="flex-shrink-0 text-xs text-gray-500">
                      {file.error && !file.progress
                        ? "Übersprungen"
                        : file.progress
                          ? phaseLabel(file.progress.phase)
                          : "Wartet…"}
                    </span>
                  </div>
                  {file.error && <p className="mt-0.5 text-xs text-red-500">{file.error}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
