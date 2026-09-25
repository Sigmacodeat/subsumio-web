import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const confirm = vi.fn();
const saveCaseUpdate = vi.fn();
const setEvidenceList = vi.fn();

const evidenceList = [
  { title: "Schwaches Indiz", type: "document", weight: 0.2 },
  { title: "Starkes Gutachten", type: "document", weight: 0.9 },
];

vi.mock("@/lib/matter-detail-context", () => ({
  useMatterDetail: () => ({
    caseData: { slug: "legal/cases/a", status: "open", documents: [] },
    slug: "legal/cases/a",
    evidenceList,
    setEvidenceList,
    saveCaseUpdate,
    evidenceDocuments: [],
    evidenceSourceCount: 0,
    evidenceSourceMode: "manual",
    setEvidenceSourceMode: vi.fn(),
    aiEvidenceCards: [],
    aiEvidenceLoading: false,
    showEvidenceForm: false,
    setShowEvidenceForm: vi.fn(),
    editingEvidenceIndex: null,
    setEditingEvidenceIndex: vi.fn(),
    evidenceForm: { reset: vi.fn(), register: vi.fn(), watch: vi.fn(), handleSubmit: vi.fn() },
    onEvidenceSubmit: vi.fn(),
    navigateToTab: vi.fn(),
    currentUserId: "u",
    currentUserName: "Anwalt",
  }),
}));
vi.mock("@/lib/use-lang", () => ({ useLang: () => ({ t: (k: string) => k, lang: "de" }) }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => confirm }));
vi.mock("@/components/legal/CommentThread", () => ({ default: () => null }));

import { EvidenceTab } from "./evidence-tab";

describe("EvidenceTab — Beweismittel löschen", () => {
  beforeEach(() => vi.clearAllMocks());

  it("asks first and removes exactly the clicked entry of the sorted view", async () => {
    confirm.mockResolvedValue(true);
    render(<EvidenceTab />);
    // Sorted by weight: the strong report is shown first, but stored second.
    const buttons = screen.getAllByRole("button", { name: "Beweis löschen" });
    await userEvent.click(buttons[0]!);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(saveCaseUpdate).toHaveBeenCalledWith({ evidence: [evidenceList[0]] });
  });

  it("keeps everything when the confirmation is cancelled", async () => {
    confirm.mockResolvedValue(false);
    render(<EvidenceTab />);
    await userEvent.click(screen.getAllByRole("button", { name: "Beweis löschen" })[0]!);
    expect(saveCaseUpdate).not.toHaveBeenCalled();
  });
});
