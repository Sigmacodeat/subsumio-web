import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DeadlineFormData } from "@/lib/schemas/case-detail";
import type { DeadlineEntry } from "@/lib/legal-types";

vi.mock("@/lib/use-lang", () => ({ useLang: () => ({ t: (k: string) => k, lang: "de" }) }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/cases/akte-1",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock("@/lib/queries/settings", () => ({ useTeam: () => ({ data: { members: [] } }) }));
vi.mock("@/components/legal/CommentThread", () => ({ default: () => null }));
const confirmMock = vi.fn(async () => false);
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => confirmMock }));
const groundAnswer = vi.fn(async () => null);
vi.mock("@/lib/use-grounded-answer", () => ({
  useGroundedAnswer: () => ({ grounding: null, groundAnswer }),
}));
vi.mock("@/components/legal/CitationPanel", () => ({
  CitationPanel: () => <div data-testid="citation-panel" />,
}));
let settings: Record<string, unknown> = { rechtsraumCountry: "AT" };
vi.mock("@/lib/kanzlei-settings", () => ({
  loadKanzleiSettingsStrict: vi.fn(async () => settings),
}));
const csrfFetch = vi.fn();
vi.mock("@/lib/csrf", () => ({ csrfFetch: (...args: unknown[]) => csrfFetch(...args) }));
vi.mock("@/lib/legal/frist-options", async (orig) => {
  const actual = (await orig()) as typeof import("@/lib/legal/frist-options");
  return { ...actual, computeFrist: vi.fn(actual.computeFrist) };
});

// Captured matter context — the tab reads it through useMatterDetail().
let ctx: Record<string, unknown> & {
  deadlineForm: ReturnType<typeof useForm<DeadlineFormData>>;
};
vi.mock("@/lib/matter-detail-context", () => ({ useMatterDetail: () => ctx }));

import { computeFrist } from "@/lib/legal/frist-options";
import { formatDate } from "@/lib/utils";
import { DeadlinesTasksTab } from "./deadlines-tasks-tab";

const saveCaseUpdate = vi.fn();

function Harness({
  deadlines = [],
  jurisdiction,
  detected = [],
  standaloneFailed = false,
}: {
  deadlines?: DeadlineEntry[];
  jurisdiction?: string;
  standaloneFailed?: boolean;
  detected?: Array<{ title: string; date: string; type: string; confidence: number }>;
}) {
  const deadlineForm = useForm<DeadlineFormData>({
    defaultValues: { title: "", due_date: "", type: "deadline", status: "pending" },
  });
  const [ruleKey, setRuleKey] = useState("");
  const [startDate, setStartDate] = useState("2026-03-02");
  const [list, setList] = useState<DeadlineEntry[]>(deadlines);
  const [aiText, setAiText] = useState("");
  const [aiDetected, setAiDetected] = useState(detected);
  ctx = {
    caseData: { slug: "legal/cases/akte-1", title: "Akte", status: "active", jurisdiction },
    slug: "legal/cases/akte-1",
    editingDeadlineIndex: null,
    setEditingDeadlineIndex: vi.fn(),
    deadlineForm,
    deadlineRuleKey: ruleKey,
    setDeadlineRuleKey: setRuleKey,
    deadlineStartDate: startDate,
    setDeadlineStartDate: setStartDate,
    deadlinesList: list,
    setDeadlinesList: setList,
    standaloneDeadlinesFailed: standaloneFailed,
    saveCaseUpdate,
    onDeadlineSubmit: vi.fn(),
    tasks: [],
    setTasks: vi.fn(),
    newTask: "",
    setNewTask: vi.fn(),
    aiDetectText: aiText,
    setAiDetectText: setAiText,
    aiDetecting: false,
    setAiDetecting: vi.fn(),
    aiDetectedDeadlines: aiDetected,
    setAiDetectedDeadlines: setAiDetected,
    confirmSuggestedDeadline: vi.fn(),
    setSaveError: vi.fn(),
    currentUserId: "u1",
    currentUserName: "Anwalt",
    refreshCaseData: vi.fn(),
  };
  return <DeadlinesTasksTab />;
}

async function openForm() {
  fireEvent.click(screen.getByText("cases.detail_dl_add"));
  await waitFor(() =>
    expect(screen.getByTestId("matter-frist-rechtsraum").textContent).toContain("Österreich")
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  settings = { rechtsraumCountry: "AT" };
  confirmMock.mockResolvedValue(false);
});

describe("Akten-Tab Fristen — AT-Engine (FRI-1)", () => {
  it("offers the Austrian Fristarten (§ 464 ZPO) and no German § 517 ZPO option", async () => {
    render(<Harness />);
    await openForm();
    const select = screen.getByTestId("matter-frist-rule") as HTMLSelectElement;
    const labels = Array.from(select.options).map((o) => o.textContent ?? "");
    expect(labels.some((l) => l.includes("§ 464 Abs 1 ZPO"))).toBe(true);
    expect(labels.some((l) => l.includes("§ 517 ZPO"))).toBe(false);
    // No preselected (German) rule.
    expect(select.value).toBe("");
  });

  it("§ 464 Abs 1 ZPO: Berufung ab 2026-03-02 → 2026-03-30, computed with country AT", async () => {
    render(<Harness />);
    await openForm();
    fireEvent.change(screen.getByTestId("matter-frist-rule"), { target: { value: "berufung" } });
    fireEvent.click(screen.getByText("cases.detail_dl_calculate"));
    expect(vi.mocked(computeFrist)).toHaveBeenCalledWith(
      "berufung",
      "2026-03-02",
      expect.objectContaining({ country: "AT" })
    );
    const values = ctx.deadlineForm.getValues();
    expect(values.due_date).toBe("2026-03-30");
    expect(values.law).toBe("§ 464 Abs 1 ZPO");
    expect(values.is_notfrist).toBe(true);
    expect(values.vorfrist_date).toBeTruthy();
  });

  it("a German matter uses German rules and says so", async () => {
    render(<Harness jurisdiction="de" />);
    fireEvent.click(screen.getByText("cases.detail_dl_add"));
    await waitFor(() =>
      expect(screen.getByTestId("matter-frist-rechtsraum").textContent).toContain("Deutschland")
    );
    const select = screen.getByTestId("matter-frist-rule") as HTMLSelectElement;
    expect(Array.from(select.options).some((o) => (o.textContent ?? "").startsWith("[DE]"))).toBe(
      true
    );
  });

  it("unreadable firm settings → no calculation", async () => {
    const { loadKanzleiSettingsStrict } = await import("@/lib/kanzlei-settings");
    vi.mocked(loadKanzleiSettingsStrict).mockRejectedValueOnce(new Error("503"));
    render(<Harness />);
    fireEvent.click(screen.getByText("cases.detail_dl_add"));
    fireEvent.change(await screen.findByTestId("matter-frist-rule"), {
      target: { value: "berufung" },
    });
    await act(async () => {});
    fireEvent.click(screen.getByText("cases.detail_dl_calculate"));
    expect(await screen.findByText(/Rechtsraum\) konnten nicht geladen werden/)).toBeTruthy();
    expect(ctx.deadlineForm.getValues().due_date).toBe("");
  });
});

describe("Akten-Tab Fristen — Ferialsache (FRI-3)", () => {
  it("§ 222 Abs 2 ZPO: Rekurs zugestellt in der vhfZ — erst nach Antwort übernommen; Ferialsache → 2026-08-03", async () => {
    render(<Harness />);
    await openForm();
    fireEvent.change(screen.getByTestId("matter-frist-rule"), { target: { value: "rekurs" } });
    fireEvent.change(screen.getByLabelText("Zustellung / Fristbeginn"), {
      target: { value: "2026-07-20" },
    });
    fireEvent.click(screen.getByText("cases.detail_dl_calculate"));
    // Question shown, nothing applied yet.
    expect(screen.getByText(/Ferialsache \(§ 222 Abs 2 ZPO\)\?/)).toBeTruthy();
    expect(ctx.deadlineForm.getValues().due_date).toBe("");
    fireEvent.click(screen.getByTestId("matter-frist-ferialsache-yes"));
    expect(ctx.deadlineForm.getValues().due_date).toBe("2026-08-03");
    expect(ctx.deadlineForm.getValues().ferialsache).toBe(true);
  });

  it("§ 222 Abs 1 ZPO: „Nein“ → Hemmung, 2026-08-31, Zweitprüfung verlangt", async () => {
    render(<Harness />);
    await openForm();
    fireEvent.change(screen.getByTestId("matter-frist-rule"), { target: { value: "rekurs" } });
    fireEvent.change(screen.getByLabelText("Zustellung / Fristbeginn"), {
      target: { value: "2026-07-20" },
    });
    fireEvent.click(screen.getByText("cases.detail_dl_calculate"));
    fireEvent.click(screen.getByTestId("matter-frist-ferialsache-no"));
    const v = ctx.deadlineForm.getValues();
    expect(v.due_date).toBe("2026-08-31");
    expect(v.second_check_required).toBe(true);
  });
});

describe("Akten-Tab — Löschen, KI-Erkennung, KI-Vorschläge (UIS-3-3)", () => {
  const ordinary: DeadlineEntry = { id: "d2", title: "Replik", due_date: "2026-10-01" };
  const notfrist: DeadlineEntry = {
    id: "d1",
    title: "Berufung",
    due_date: "2026-10-05",
    is_notfrist: true,
  };

  it("deleting a deadline asks first (aria-label) and does nothing when declined", async () => {
    render(<Harness deadlines={[ordinary]} />);
    fireEvent.click(screen.getByLabelText("Frist „Replik“ löschen"));
    await waitFor(() => expect(confirmMock).toHaveBeenCalled());
    expect(saveCaseUpdate).not.toHaveBeenCalled();
  });

  it("deleting after confirmation removes the entry", async () => {
    confirmMock.mockResolvedValueOnce(true);
    render(<Harness deadlines={[ordinary]} />);
    fireEvent.click(screen.getByLabelText("Frist „Replik“ löschen"));
    await waitFor(() => expect(saveCaseUpdate).toHaveBeenCalledWith({ deadlines: [] }));
  });

  it("a Notfrist is cancelled with a mandatory reason instead of deleted", async () => {
    render(<Harness deadlines={[notfrist]} />);
    fireEvent.click(screen.getByLabelText("Notfrist „Berufung“ stornieren"));
    const dialog = screen.getByRole("dialog");
    const button = within(dialog).getByText("Stornieren") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/Begründung/), {
      target: { value: "Rechtsmittel zurückgezogen" },
    });
    fireEvent.click(button);
    expect(saveCaseUpdate).toHaveBeenCalledWith({
      deadlines: [
        expect.objectContaining({
          id: "d1",
          status: "cancelled",
          change_reason: "Rechtsmittel zurückgezogen",
        }),
      ],
    });
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it("a failed KI-Fristerkennung (res.ok false) is shown as an error, not as „keine Fristen“", async () => {
    csrfFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "upstream" }), { status: 502 })
    );
    render(<Harness />);
    fireEvent.change(screen.getByPlaceholderText("cases.detail_dl_ai_ph"), {
      target: { value: "Urteil zugestellt am 2.3.2026" },
    });
    fireEvent.click(screen.getByText("cases.detail_dl_ai_detect"));
    expect(await screen.findByText(/KI-Fristerkennung ist fehlgeschlagen/)).toBeTruthy();
  });

  it("KI-Fristvorschläge are grounded and shown with the citation panel; dates formatted", async () => {
    render(
      <Harness
        detected={[
          { title: "Berufungsfrist", date: "2026-03-30", type: "deadline", confidence: 0.9 },
        ]}
      />
    );
    expect(screen.getByTestId("citation-panel")).toBeTruthy();
    await waitFor(() =>
      expect(groundAnswer).toHaveBeenCalledWith(expect.stringContaining("Berufungsfrist"))
    );
    expect(screen.getByText(formatDate("2026-03-30"))).toBeTruthy();
    expect(screen.queryByText(/^2026-03-30/)).toBeNull();
  });
});

describe("Akten-Tab Fristen — unvollständige Liste (R11-4)", () => {
  it("says so when the matter's standalone deadlines could not be loaded", () => {
    render(<Harness standaloneFailed />);
    expect(screen.getByRole("alert").textContent).toContain("unvollständig");
  });

  it("shows no warning when they loaded", () => {
    render(<Harness />);
    expect(screen.queryByText(/eigenständigen Fristen dieser Akte/)).toBeNull();
  });
});
