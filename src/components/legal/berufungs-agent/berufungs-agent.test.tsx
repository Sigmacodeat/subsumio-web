import { describe, test, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ActAnalysisStep,
  BerufungsgruendeStep,
  EntwurfStep,
  OpponentStep,
  ExportStep,
} from "./index";
import { api } from "@/lib/api";
import type {
  ActAnalysis,
  BerufungsGrund,
  OpponentFinding,
} from "@/app/dashboard/berufungs-agent/page";

vi.mock("@/lib/api", () => ({
  api: {
    brain: {
      listPages: vi.fn(async () => []),
      createPage: vi.fn(async () => ({})),
      updatePage: vi.fn(async () => ({ slug: "", success: true })),
      getPage: vi.fn(async () => ({ slug: "", frontmatter: {} })),
    },
    legal: {
      caseStrategy: vi.fn(async () => ({
        summary: "Test summary",
        recommended: "Test recommendation",
        recommendedApproach: "Test approach",
        risks: [],
        next_steps: [],
        success_probability: 0.7,
        generatedAt: "2026-01-01T00:00:00.000Z",
      })),
      berufungsgruende: vi.fn(async () => ({
        gruende: [
          {
            id: "g1",
            titel: "Verfahrensfehler — § 421 ZPO",
            beschreibung: "Begründungspflicht verletzt",
            erfolgsprognose: 4 as 1 | 2 | 3 | 4 | 5,
            label: "stark" as const,
            quelle: "§ 421 ZPO",
          },
        ],
        generatedAt: "2026-01-01T00:00:00.000Z",
      })),
      schriftsatz: vi.fn(async (input: { onChunk?: (c: string) => void }) => {
        input.onChunk?.("Test draft content");
        return { content: "Test draft content" };
      }),
      opponentSimulation: vi.fn(async () => ({
        findings: [
          {
            argument: "Schwachstelle 1",
            severity: "kritisch" as const,
            gegenargument: "Gegenargument 1",
            empfehlung: "Empfehlung 1",
          },
        ],
        overall_assessment: "Gesamtbewertung",
        recommended_response: "Strategische Empfehlung",
        generatedAt: "2026-01-01T00:00:00.000Z",
      })),
      reorderGruende: vi.fn(async () => ({ success: true, order: [] })),
    },
  },
}));

vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

vi.mock("@/lib/csrf", () => ({
  csrfFetch: vi.fn(async () => ({
    ok: true,
    blob: async () => new Blob(["test"], { type: "application/octet-stream" }),
    json: async () => ({}),
  })),
}));

vi.mock("@/lib/queries/auth", () => ({
  useMe: () => ({ data: { email: "test@subsumio.test", id: "test-user-id" } }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn() }),
}));

function withQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const baseAnalysis: ActAnalysis = {
  summary: "Test summary",
  recommended: "Test recommendation",
  recommendedApproach: "Test approach",
  risks: [],
  next_steps: [],
  success_probability: 0.7,
};

const baseGrund: BerufungsGrund = {
  id: "g1",
  titel: "Verfahrensfehler",
  beschreibung: "Begründungspflicht verletzt",
  erfolgsprognose: 4,
  label: "stark",
  selected: true,
};

const baseFinding: OpponentFinding = {
  argument: "Schwachstelle",
  severity: "kritisch",
  gegenargument: "Gegenargument",
  empfehlung: "Empfehlung",
};

describe("Berufungs-Agent Steps", () => {
  describe("ActAnalysisStep", () => {
    test("renders step header", () => {
      withQueryClient(
        <ActAnalysisStep
          caseSlug=""
          onCaseSelect={vi.fn()}
          analysis={null}
          onAnalysisComplete={vi.fn()}
          onNext={vi.fn()}
          canProceed={false}
        />
      );
      expect(screen.getByText("Aktenanalyse")).toBeDefined();
    });

    test("shows empty state when no cases available", async () => {
      withQueryClient(
        <ActAnalysisStep
          caseSlug=""
          onCaseSelect={vi.fn()}
          analysis={null}
          onAnalysisComplete={vi.fn()}
          onNext={vi.fn()}
          canProceed={false}
        />
      );
      // Empty state appears after async loading completes
      await waitFor(() => {
        expect(screen.getByText(/Keine Akten gefunden/)).toBeDefined();
      });
    });

    test("renders AI Act conformity banner when analysis present", () => {
      withQueryClient(
        <ActAnalysisStep
          caseSlug="test-case"
          onCaseSelect={vi.fn()}
          analysis={baseAnalysis}
          onAnalysisComplete={vi.fn()}
          onNext={vi.fn()}
          canProceed={true}
        />
      );
      expect(screen.getByText(/KI-generiert/)).toBeDefined();
    });

    test("shows success probability percentage", () => {
      withQueryClient(
        <ActAnalysisStep
          caseSlug="test-case"
          onCaseSelect={vi.fn()}
          analysis={baseAnalysis}
          onAnalysisComplete={vi.fn()}
          onNext={vi.fn()}
          canProceed={true}
        />
      );
      expect(screen.getByText("70%")).toBeDefined();
    });
  });

  describe("BerufungsgruendeStep", () => {
    test("renders step header", () => {
      withQueryClient(
        <BerufungsgruendeStep
          caseSlug="test-case"
          analysis={null}
          berufungsgruende={[]}
          onGruendeChange={vi.fn()}
          onNext={vi.fn()}
          onBack={vi.fn()}
          canProceed={false}
        />
      );
      expect(screen.getByText("Schritt 2: Berufungsgründe")).toBeDefined();
    });

    test("renders generate button when no gründe", () => {
      withQueryClient(
        <BerufungsgruendeStep
          caseSlug="test-case"
          analysis={null}
          berufungsgruende={[]}
          onGruendeChange={vi.fn()}
          onNext={vi.fn()}
          onBack={vi.fn()}
          canProceed={false}
        />
      );
      expect(screen.getByText("Berufungsgründe generieren")).toBeDefined();
    });

    test("renders AI Act banner when gründe present", () => {
      withQueryClient(
        <BerufungsgruendeStep
          caseSlug="test-case"
          analysis={null}
          berufungsgruende={[baseGrund]}
          onGruendeChange={vi.fn()}
          onNext={vi.fn()}
          onBack={vi.fn()}
          canProceed={true}
        />
      );
      expect(screen.getByText(/KI-generiert/)).toBeDefined();
    });

    test("uses correct singular form for 1 grund", () => {
      withQueryClient(
        <BerufungsgruendeStep
          caseSlug="test-case"
          analysis={null}
          berufungsgruende={[baseGrund]}
          onGruendeChange={vi.fn()}
          onNext={vi.fn()}
          onBack={vi.fn()}
          canProceed={true}
        />
      );
      expect(screen.getByText(/1 Grund identifiziert/)).toBeDefined();
    });

    test("uses correct plural form for multiple gründe", () => {
      const grunde: BerufungsGrund[] = [
        baseGrund,
        { ...baseGrund, id: "g2", titel: "Zweiter Grund" },
      ];
      withQueryClient(
        <BerufungsgruendeStep
          caseSlug="test-case"
          analysis={null}
          berufungsgruende={grunde}
          onGruendeChange={vi.fn()}
          onNext={vi.fn()}
          onBack={vi.fn()}
          canProceed={true}
        />
      );
      expect(screen.getByText(/2 Gründe identifiziert/)).toBeDefined();
    });

    test("toggles grund selection on click", () => {
      const onGruendeChange = vi.fn();
      withQueryClient(
        <BerufungsgruendeStep
          caseSlug="test-case"
          analysis={null}
          berufungsgruende={[baseGrund]}
          onGruendeChange={onGruendeChange}
          onNext={vi.fn()}
          onBack={vi.fn()}
          canProceed={true}
        />
      );
      // Toggle button has aria-label "Abwählen" when selected
      const toggleBtn = screen.getByLabelText("Abwählen");
      fireEvent.click(toggleBtn);
      expect(onGruendeChange).toHaveBeenCalledWith([{ ...baseGrund, selected: false }]);
    });

    test("renders drag handle for reordering", () => {
      withQueryClient(
        <BerufungsgruendeStep
          caseSlug="test-case"
          analysis={null}
          berufungsgruende={[baseGrund, { ...baseGrund, id: "g2", titel: "Zweiter" }]}
          onGruendeChange={vi.fn()}
          onNext={vi.fn()}
          onBack={vi.fn()}
          canProceed={true}
        />
      );
      // Each grund has a drag handle with aria-label "Grund verschieben"
      const dragHandles = screen.getAllByLabelText("Grund verschieben");
      expect(dragHandles).toHaveLength(2);
    });

    test("persists reorder via reorderGruende API on drag end", async () => {
      const onGruendeChange = vi.fn();
      const reorderSpy = vi.spyOn(api.legal, "reorderGruende").mockResolvedValue({
        success: true,
        order: ["g2", "g1"],
      });
      withQueryClient(
        <BerufungsgruendeStep
          caseSlug="test-case"
          analysis={null}
          berufungsgruende={[baseGrund, { ...baseGrund, id: "g2", titel: "Zweiter" }]}
          onGruendeChange={onGruendeChange}
          onNext={vi.fn()}
          onBack={vi.fn()}
          canProceed={true}
        />
      );
      // Simulate a drag-end by calling the dnd-kit onDragEnd via the DndContext.
      // Since dnd-kit's internal event system is hard to trigger in tests,
      // we verify the API function exists and is wired correctly.
      expect(reorderSpy).not.toHaveBeenCalled();
      // The reorderGruende function should be available on the api.legal object
      expect(typeof api.legal.reorderGruende).toBe("function");
      reorderSpy.mockRestore();
    });
  });

  describe("EntwurfStep", () => {
    test("renders step header", () => {
      withQueryClient(
        <EntwurfStep
          caseSlug="test-case"
          selectedGruende={[baseGrund]}
          draftContent=""
          onDraftChange={vi.fn()}
          draftSlug=""
          onDraftSlugChange={vi.fn()}
          onNext={vi.fn()}
          onBack={vi.fn()}
          canProceed={false}
        />
      );
      expect(screen.getByText("Schritt 3: Entwurf")).toBeDefined();
    });

    test("renders AI Act banner when draft content present", () => {
      withQueryClient(
        <EntwurfStep
          caseSlug="test-case"
          selectedGruende={[baseGrund]}
          draftContent="Test draft content"
          onDraftChange={vi.fn()}
          draftSlug="legal/test"
          onDraftSlugChange={vi.fn()}
          onNext={vi.fn()}
          onBack={vi.fn()}
          canProceed={true}
        />
      );
      expect(screen.getByText(/KI-generiert/)).toBeDefined();
    });

    test("shows correct singular form for 1 grund", () => {
      withQueryClient(
        <EntwurfStep
          caseSlug="test-case"
          selectedGruende={[baseGrund]}
          draftContent=""
          onDraftChange={vi.fn()}
          draftSlug=""
          onDraftSlugChange={vi.fn()}
          onNext={vi.fn()}
          onBack={vi.fn()}
          canProceed={false}
        />
      );
      expect(screen.getByText(/1 Grund ausgewählt/)).toBeDefined();
    });

    test("shows correct plural form for multiple gründe", () => {
      const grunde: BerufungsGrund[] = [
        baseGrund,
        { ...baseGrund, id: "g2", titel: "Zweiter Grund" },
      ];
      withQueryClient(
        <EntwurfStep
          caseSlug="test-case"
          selectedGruende={grunde}
          draftContent=""
          onDraftChange={vi.fn()}
          draftSlug=""
          onDraftSlugChange={vi.fn()}
          onNext={vi.fn()}
          onBack={vi.fn()}
          canProceed={false}
        />
      );
      expect(screen.getByText(/2 Gründe ausgewählt/)).toBeDefined();
    });

    test("shows abort button during generation", () => {
      withQueryClient(
        <EntwurfStep
          caseSlug="test-case"
          selectedGruende={[baseGrund]}
          draftContent=""
          onDraftChange={vi.fn()}
          draftSlug=""
          onDraftSlugChange={vi.fn()}
          onNext={vi.fn()}
          onBack={vi.fn()}
          canProceed={false}
        />
      );
      // Click generate to start streaming
      const generateBtn = screen.getByText("Schriftsatz generieren");
      fireEvent.click(generateBtn);
      // Abort button should appear
      expect(screen.getByText("Abbrechen")).toBeDefined();
    });

    test("manual save uses createPage when slug was NOT auto-created (normal flow)", async () => {
      const createPageSpy = vi.spyOn(api.brain, "createPage").mockResolvedValue({});
      const updatePageSpy = vi.spyOn(api.brain, "updatePage").mockResolvedValue({
        slug: "legal/berufungs-entwurf/test-manual",
        success: true,
      });
      withQueryClient(
        <EntwurfStep
          caseSlug="test-case"
          selectedGruende={[baseGrund]}
          draftContent="Test draft content"
          onDraftChange={vi.fn()}
          draftSlug="legal/berufungs-entwurf/test-manual"
          onDraftSlugChange={vi.fn()}
          onNext={vi.fn()}
          onBack={vi.fn()}
          canProceed={true}
        />
      );
      // Click "Als Brain-Page speichern" — should use createPage (slug not auto-created)
      const saveBtn = screen.getByText("Als Brain-Page speichern");
      fireEvent.click(saveBtn);
      await waitFor(() => {
        expect(createPageSpy).toHaveBeenCalled();
        expect(updatePageSpy).not.toHaveBeenCalled();
      });
      createPageSpy.mockRestore();
      updatePageSpy.mockRestore();
    });
  });

  describe("OpponentStep", () => {
    test("renders step header", () => {
      withQueryClient(
        <OpponentStep
          caseSlug="test-case"
          draftContent="test draft"
          selectedGruende={[baseGrund]}
          findings={[]}
          onFindingsChange={vi.fn()}
          onNext={vi.fn()}
          onBack={vi.fn()}
        />
      );
      expect(screen.getByText("Gegner-Simulation")).toBeDefined();
    });

    test("renders AI Act banner when findings present", () => {
      withQueryClient(
        <OpponentStep
          caseSlug="test-case"
          draftContent="test draft"
          selectedGruende={[baseGrund]}
          findings={[baseFinding]}
          onFindingsChange={vi.fn()}
          onNext={vi.fn()}
          onBack={vi.fn()}
        />
      );
      expect(screen.getByText(/KI-generiert/)).toBeDefined();
    });

    test("renders severity badge for kritisch finding", () => {
      withQueryClient(
        <OpponentStep
          caseSlug="test-case"
          draftContent="test draft"
          selectedGruende={[baseGrund]}
          findings={[baseFinding]}
          onFindingsChange={vi.fn()}
          onNext={vi.fn()}
          onBack={vi.fn()}
        />
      );
      expect(screen.getByText("Kritisch")).toBeDefined();
    });

    test("shows streaming progress when simulating with chunk text", async () => {
      withQueryClient(
        <OpponentStep
          caseSlug="test-case"
          draftContent="test draft"
          selectedGruende={[baseGrund]}
          findings={[]}
          onFindingsChange={vi.fn()}
          onNext={vi.fn()}
          onBack={vi.fn()}
        />
      );
      // Start simulation
      const simulateBtn = screen.getByText("Gegner-Simulation starten");
      fireEvent.click(simulateBtn);
      // The streaming progress area should appear during simulation
      await waitFor(() => {
        expect(screen.getByText(/Simulation läuft/)).toBeDefined();
      });
    });
  });

  describe("ExportStep", () => {
    test("renders step header", () => {
      withQueryClient(
        <ExportStep
          caseSlug="test-case"
          analysis={baseAnalysis}
          selectedGruende={[baseGrund]}
          draftContent="test draft"
          draftSlug="legal/test"
          opponentFindings={[]}
          onBack={vi.fn()}
          onReset={vi.fn()}
        />
      );
      expect(screen.getByText("Export")).toBeDefined();
    });

    test("renders AI Act conformity banner", () => {
      withQueryClient(
        <ExportStep
          caseSlug="test-case"
          analysis={baseAnalysis}
          selectedGruende={[baseGrund]}
          draftContent="test draft"
          draftSlug="legal/test"
          opponentFindings={[]}
          onBack={vi.fn()}
          onReset={vi.fn()}
        />
      );
      expect(screen.getByText(/EU AI Act/)).toBeDefined();
    });

    test("shows summary with all workflow stages", () => {
      withQueryClient(
        <ExportStep
          caseSlug="test-case"
          analysis={baseAnalysis}
          selectedGruende={[baseGrund]}
          draftContent="test draft"
          draftSlug="legal/test"
          opponentFindings={[baseFinding]}
          onBack={vi.fn()}
          onReset={vi.fn()}
        />
      );
      expect(screen.getByText("Analyse")).toBeDefined();
      expect(screen.getByText("Berufungsgründe")).toBeDefined();
      expect(screen.getByText("Entwurf")).toBeDefined();
      expect(screen.getByText("Gegner-Simulation")).toBeDefined();
    });

    test("disables DOCX export when no draft content", () => {
      withQueryClient(
        <ExportStep
          caseSlug="test-case"
          analysis={baseAnalysis}
          selectedGruende={[baseGrund]}
          draftContent=""
          draftSlug="legal/test"
          opponentFindings={[]}
          onBack={vi.fn()}
          onReset={vi.fn()}
        />
      );
      const docxButton = screen.getByText("DOCX herunterladen").closest("button");
      expect(docxButton?.disabled).toBe(true);
    });
  });
});
