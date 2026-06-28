import JSZip from "jszip";

export const ARCHIVE_LIMITS = {
  maxDepth: 2,
  maxEntries: 1_000,
  maxEntryBytes: 50_000_000,
  maxExpandedBytes: 200_000_000,
} as const;

export interface ArchiveBudget {
  entries: number;
  expandedBytes: number;
}

export interface SafeArchiveEntry {
  name: string;
  data: Buffer;
}

export class ArchiveSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArchiveSafetyError";
  }
}

/**
 * Read one ZIP layer while sharing a budget across nested ZIPs. Paths are
 * validated before any content is handed to a parser. Limits are checked from
 * ZIP metadata and again against the actually expanded bytes.
 */
export async function readSafeZipEntries(
  input: Buffer,
  options: { depth?: number; budget?: ArchiveBudget } = {}
): Promise<{ entries: SafeArchiveEntry[]; budget: ArchiveBudget }> {
  const depth = options.depth ?? 0;
  const budget = options.budget ?? { entries: 0, expandedBytes: 0 };
  if (depth > ARCHIVE_LIMITS.maxDepth) {
    throw new ArchiveSafetyError(`ZIP nesting exceeds ${ARCHIVE_LIMITS.maxDepth} levels`);
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(input, { checkCRC32: true });
  } catch (error) {
    throw new ArchiveSafetyError(
      `ZIP cannot be read${error instanceof Error ? `: ${error.message}` : ""}`
    );
  }

  const files = Object.values(zip.files).filter((entry) => !entry.dir);
  if (budget.entries + files.length > ARCHIVE_LIMITS.maxEntries) {
    throw new ArchiveSafetyError(`ZIP contains more than ${ARCHIVE_LIMITS.maxEntries} files`);
  }

  const entries: SafeArchiveEntry[] = [];
  for (const entry of files) {
    const unsafeName = (entry as unknown as { unsafeOriginalName?: string }).unsafeOriginalName;
    const name = unsafeName || entry.name;
    assertSafeArchivePath(name);
    if (name.startsWith("__MACOSX/") || name.split("/").pop() === ".DS_Store") continue;

    const declaredSize = Number(
      (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0
    );
    if (declaredSize > ARCHIVE_LIMITS.maxEntryBytes) {
      throw new ArchiveSafetyError(`ZIP entry ${name} exceeds the per-file limit`);
    }
    if (budget.expandedBytes + declaredSize > ARCHIVE_LIMITS.maxExpandedBytes) {
      throw new ArchiveSafetyError("ZIP expands beyond the 200 MB total limit");
    }

    const data = await entry.async("nodebuffer");
    if (data.byteLength > ARCHIVE_LIMITS.maxEntryBytes) {
      throw new ArchiveSafetyError(`ZIP entry ${name} exceeds the per-file limit`);
    }
    budget.entries += 1;
    budget.expandedBytes += data.byteLength;
    if (budget.entries > ARCHIVE_LIMITS.maxEntries) {
      throw new ArchiveSafetyError(`ZIP contains more than ${ARCHIVE_LIMITS.maxEntries} files`);
    }
    if (budget.expandedBytes > ARCHIVE_LIMITS.maxExpandedBytes) {
      throw new ArchiveSafetyError("ZIP expands beyond the 200 MB total limit");
    }
    entries.push({ name, data });
  }

  return { entries, budget };
}

function assertSafeArchivePath(name: string): void {
  if (!name || name.includes("\0") || name.startsWith("/") || /^[a-z]:[\\/]/i.test(name)) {
    throw new ArchiveSafetyError("ZIP contains an invalid absolute path");
  }
  const normalized = name.replace(/\\/g, "/");
  if (normalized.split("/").some((segment) => segment === "..")) {
    throw new ArchiveSafetyError("ZIP contains a path traversal entry");
  }
}
