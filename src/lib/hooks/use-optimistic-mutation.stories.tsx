import type { Meta, StoryObj } from "@storybook/react";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import React from "react";
import { useOptimisticMutation } from "./use-optimistic-mutation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ── Demo-Komponente die den Optimistic-Update-Flow zeigt ──

interface DemoTodo {
  id: number;
  text: string;
  done: boolean;
}

const SEED_TODOS: DemoTodo[] = [
  { id: 1, text: "Erste Aufgabe", done: false },
  { id: 2, text: "Zweite Aufgabe", done: true },
  { id: 3, text: "Dritte Aufgabe", done: false },
];

/**
 * Outer wrapper: erstellt den QueryClient, seedet die Daten,
 * und wrappt alles in den Provider. Das ist die Komponente die
 * Storybook rendert.
 */
function OptimisticDemo({ failMode }: { failMode: "never" | "always" }) {
  // Pro Render ein neuer QueryClient — isoliert Stories voneinander.
  const [qc] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
      }),
  );

  // Seed: 3 Todos
  React.useEffect(() => {
    qc.setQueryData(["demo-todos"], { items: SEED_TODOS });
  }, [qc]);

  return (
    <QueryClientProvider client={qc}>
      <OptimisticDemoInner failMode={failMode} />
    </QueryClientProvider>
  );
}

/**
 * Inner: nutzt useQueryClient (aus dem Provider) + useQuery um die
 * Daten zu lesen. KEIN eigenes `new QueryClient()` — das war der Bug.
 */
function OptimisticDemoInner({ failMode }: { failMode: "never" | "always" }) {
  const queryClient = useQueryClient();

  // Daten aus dem Provider-Client lesen (reaktiv via useQuery).
  const { data } = useQuery({
    queryKey: ["demo-todos"],
    queryFn: () => queryClient.getQueryData<{ items: DemoTodo[] }>(["demo-todos"]) ?? { items: [] },
    initialData: { items: SEED_TODOS },
    staleTime: Infinity, // nie refetchen — Demo-Daten
  });

  // Simulierte Mutation — schlägt fehl wenn failMode = "always".
  const toggleMutation = useOptimisticMutation({
    mutationFn: async (vars: { id: number }) => {
      await new Promise((r) => setTimeout(r, 800));
      if (failMode === "always") throw new Error("Server nicht erreichbar");
      return { ok: true, ...vars };
    },
    queryKey: ["demo-todos"],
    updater: (old: unknown, vars: { id: number }) => {
      const d = old as { items: DemoTodo[] } | undefined;
      if (!d) return d;
      return {
        ...d,
        items: d.items.map((t) => (t.id === vars.id ? { ...t, done: !t.done } : t)),
      };
    },
  });

  const todos = data?.items ?? [];

  return (
    <div className="space-y-4 p-6 max-w-md">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium">Optimistic Toggle Demo</h3>
        <Badge variant={failMode === "always" ? "danger" : "success"}>
          {failMode === "always" ? "Fehler-Modus" : "Erfolgs-Modus"}
        </Badge>
      </div>

      <div className="space-y-2">
        {todos.map((todo) => {
          const isPending = toggleMutation.isPending && toggleMutation.variables?.id === todo.id;
          return (
            <div
              key={todo.id}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-opacity motion-reduce:transition-none ${
                isPending ? "opacity-50" : ""
              }`}
              aria-busy={isPending}
            >
              <input
                type="checkbox"
                checked={todo.done}
                onChange={() => toggleMutation.mutate({ id: todo.id })}
                disabled={isPending}
              />
              <span className={`flex-1 text-sm ${todo.done ? "line-through text-[color:var(--ds-text-muted)]" : ""}`}>
                {todo.text}
              </span>
              {isPending && <Badge variant="warning">pending</Badge>}
              {todo.done && <Badge variant="success">done</Badge>}
            </div>
          );
        })}
      </div>

      <div className="text-xs text-[color:var(--ds-text-muted)] space-y-1">
        <div>Mutation status: <code>{toggleMutation.status}</code></div>
        {toggleMutation.isPending && <div className="text-yellow-600">Optimistic Write aktiv — UI zeigt schon den neuen State.</div>}
        {toggleMutation.isError && <div className="text-red-600">Fehler — Cache wurde zum Snapshot zurückgerollt.</div>}
        {toggleMutation.isSuccess && <div className="text-green-600">Erfolg — Server hat bestätigt.</div>}
      </div>

      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          queryClient.setQueryData(["demo-todos"], { items: SEED_TODOS });
        }}
      >
        Zurücksetzen
      </Button>
    </div>
  );
}

// ── Storybook Meta ──

const meta: Meta<typeof OptimisticDemo> = {
  title: "Hooks/useOptimisticMutation",
  component: OptimisticDemo,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    failMode: {
      control: "select",
      options: ["never", "always"],
      description: "never = Mutation erfolgreich; always = Mutation schlägt fehl (Rollback)",
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Success: Story = {
  args: { failMode: "never" },
  parameters: {
    docs: {
      description: {
        story: "Klicke eine Checkbox — der Toggle passiert sofort (optimistic). Nach 800ms bestätigt der Server.",
      },
    },
  },
};

export const FailureRollback: Story = {
  args: { failMode: "always" },
  parameters: {
    docs: {
      description: {
        story: "Klicke eine Checkbox — der Toggle passiert sofort, aber nach 800ms schlägt der Server fehl und der Cache wird zum Snapshot zurückgerollt.",
      },
    },
  },
};
