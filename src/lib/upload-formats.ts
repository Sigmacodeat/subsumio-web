/** Canonical browser/web upload contract. The engine mirrors this list and
 * verifies/extracts the bytes again; this module keeps every web entry point
 * on the same advertised format surface. */
export const UPLOAD_ACCEPT: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "application/zip": [".zip"],
  "application/x-zip-compressed": [".zip"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.ms-word.document.macroenabled.12": [".docm"],
  "application/rtf": [".rtf"],
  "application/vnd.oasis.opendocument.text": [".odt"],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/vnd.ms-excel.sheet.macroenabled.12": [".xlsm"],
  "application/vnd.oasis.opendocument.spreadsheet": [".ods"],
  "application/vnd.ms-powerpoint": [".ppt"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
  "application/vnd.ms-powerpoint.presentation.macroenabled.12": [".pptm"],
  "application/vnd.oasis.opendocument.presentation": [".odp"],
  "message/rfc822": [".eml"],
  "application/vnd.ms-outlook": [".msg", ".pst"],
  "application/x-pst": [".pst"],
  "text/plain": [".txt"],
  "text/markdown": [".md"],
  "text/html": [".html", ".htm"],
  "text/csv": [".csv"],
  "text/tab-separated-values": [".tsv"],
  "application/json": [".json"],
  "application/xml": [".xml"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/tiff": [".tif", ".tiff"],
  "image/gif": [".gif"],
  "image/webp": [".webp"],
  "image/heic": [".heic"],
  "image/heif": [".heif"],
  "image/avif": [".avif"],
  "image/bmp": [".bmp"],
  "audio/mpeg": [".mp3"],
  "audio/wav": [".wav"],
  "audio/mp4": [".m4a"],
  "audio/ogg": [".ogg"],
  "audio/flac": [".flac"],
  // Browser MIME reporting for iWork is inconsistent; extension validation
  // below is authoritative and the engine converts these in an isolated LO process.
  "application/vnd.apple.pages": [".pages"],
  "application/vnd.apple.keynote": [".key"],
  "application/vnd.apple.numbers": [".numbers"],
  "application/x-iwork-pages-sffpages": [".pages"],
  "application/x-iwork-keynote-sffkey": [".key"],
  "application/x-iwork-numbers-sffnumbers": [".numbers"],
  "application/octet-stream": [
    ".zip",
    ".doc",
    ".docx",
    ".docm",
    ".xls",
    ".xlsx",
    ".xlsm",
    ".ppt",
    ".pptx",
    ".pptm",
    ".msg",
    ".pst",
    ".pages",
    ".key",
    ".numbers",
  ],
};

export const SUPPORTED_UPLOAD_EXTENSIONS = new Set(Object.values(UPLOAD_ACCEPT).flat());
export const UPLOAD_ACCEPT_ATTRIBUTE = [...SUPPORTED_UPLOAD_EXTENSIONS].sort().join(",");
export const SUPPORTED_UPLOAD_MIME_TYPES = new Set([
  ...Object.keys(UPLOAD_ACCEPT),
  "text/xml",
  "text/rtf",
  "text/x-markdown",
  "application/x-rtf",
  "audio/x-wav",
  "audio/x-m4a",
  "audio/x-flac",
  "application/x-iwork-pages-sffpages",
  "application/x-iwork-keynote-sffkey",
  "application/x-iwork-numbers-sffnumbers",
]);

export const UPLOAD_FOLDER_ACCEPT_RE = new RegExp(
  `\\.(${[...SUPPORTED_UPLOAD_EXTENSIONS]
    .map((ext) => ext.slice(1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|")})$`,
  "i"
);

export function uploadExtension(name: string): string {
  const match = name.toLowerCase().match(/\.[^.]+$/);
  return match?.[0] ?? "";
}

export function isSupportedUploadName(name: string): boolean {
  return SUPPORTED_UPLOAD_EXTENSIONS.has(uploadExtension(name));
}
