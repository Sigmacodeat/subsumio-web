import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { docProcessingStatus } from "@/lib/doc-processing-status";

const getPages = vi.fn();

const caseData = {
  slug: "legal/cases/m1",
  status: "active",
  documents: [
    {
      id: "1",
      slug: "documents/ok",
      name: "ok.pdf",
      url: "documents/ok",
      uploadedAt: "2026-09-01",
    },
    {
      id: "2",
      slug: "documents/kaputt",
      name: "kaputt.pdf",
      url: "documents/kaputt",
      uploadedAt: "2026-09-01",
    },
    {
      id: "3",
      slug: "documents/teil",
      name: "teil.pdf",
      url: "documents/teil",
      uploadedAt: "2026-09-01",
    },
    {
      id: "4",
      slug: "documents/analyse",
      name: "analyse.pdf",
      url: "documents/analyse",
      uploadedAt: "2026-09-01",
    },
  ],
};

vi.mock("@/lib/matter-detail-context", () => ({
  useMatterDetail: () => ({
    caseData,
    docTypeFilter: "all",
    setDocTypeFilter: vi.fn(),
    linkSearchQuery: "",
    setLinkSearchQuery: vi.fn(),
    linkSearchResults: [],
    setLinkSearchResults: vi.fn(),
    linkSearching: false,
    showLinkDialog: false,
    setShowLinkDialog: vi.fn(),
    uploadQueue: [],
    setUploadQueue: vi.fn(),
    uploadStats: {
      totalFiles: 0,
      completedFiles: 0,
      failedFiles: 0,
      totalBytes: 0,
      uploadedBytes: 0,
    },
    uploadOverallProgress: 0,
    uploadError: null,
    setUploadError: vi.fn(),
    offlinePendingCount: 0,
    offlineSyncing: false,
    scanningFolder: false,
    documentPassword: "",
    setDocumentPassword: vi.fn(),
    handleMultiUpload: vi.fn(),
    refreshCaseData: vi.fn(),
    saveCaseUpdate: vi.fn(),
    pickFolderForCase: vi.fn(),
    folderApi: null,
    formatUploadBytes: () => "0 KB",
    formatUploadEta: () => "",
    uploadStatusLabel: () => "",
    docProcessingStatus,
  }),
}));
vi.mock("@/lib/use-lang", () => ({ useLang: () => ({ t: (k: string) => k, lang: "de" }) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => vi.fn() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/dashboard/cases/m1",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/api", () => ({
  api: new Proxy(
    {},
    {
      get: (_t, ns) =>
        ns === "brain"
          ? { getPages: (...a: unknown[]) => getPages(...a), listPages: vi.fn(async () => []) }
          : new Proxy({}, { get: () => vi.fn(async () => ({})) }),
    }
  ),
}));
vi.mock("@/components/legal/ActImportCockpit", () => ({ ActImportCockpit: () => null }));
vi.mock("@/components/legal/QesSignButton", () => ({ QesSignButton: () => null }));

import { DocumentsTab } from "./documents-tab";

beforeEach(() => {
  getPages.mockResolvedValue({
    "documents/ok": { slug: "documents/ok", frontmatter: { extraction_status: "ready" } },
    "documents/kaputt": { slug: "documents/kaputt", frontmatter: { extraction_status: "failed" } },
    "documents/teil": {
      slug: "documents/teil",
      frontmatter: { extraction_status: "partial", extraction_coverage_percent: 34 },
    },
    "documents/analyse": {
      slug: "documents/analyse",
      frontmatter: { extraction_status: "ready", analysis_status: "failed" },
    },
  });
});

function row(name: string): HTMLElement {
  return screen.getByText(name).closest("[draggable]") as HTMLElement;
}

describe("DocumentsTab — real processing status", () => {
  it("shows failed, partial and failed-analysis documents as such, not 'uploaded'", async () => {
    render(<DocumentsTab />);
    await screen.findByText("Teilweise gelesen (34 %)");
    expect(within(row("kaputt.pdf")).getByText("docstab.extraction_failed")).toBeInTheDocument();
    expect(within(row("analyse.pdf")).getByText("Analyse fehlgeschlagen")).toBeInTheDocument();
    expect(
      within(row("ok.pdf")).getByText("cases.detail_doc_status_confirmed")
    ).toBeInTheDocument();
    expect(screen.queryByText("cases.detail_doc_status_uploaded")).not.toBeInTheDocument();
  });

  it("reads the status of every document, not only the first 50", async () => {
    render(<DocumentsTab />);
    await screen.findByText("Teilweise gelesen (34 %)");
    const asked = getPages.mock.calls.flatMap(([slugs]) => slugs as string[]);
    expect(asked).toEqual(expect.arrayContaining(caseData.documents.map((d) => d.slug)));
  });
});
