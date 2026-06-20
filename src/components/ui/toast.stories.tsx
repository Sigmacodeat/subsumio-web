import type { Meta, StoryObj } from "@storybook/react";
import { ToastProvider, useToast } from "./toast";
import { Button } from "./button";

const meta: Meta = {
  title: "UI/Toast",
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

function ToastDemo() {
  const { addToast } = useToast();
  return (
    <div className="flex flex-col gap-2">
      <Button onClick={() => addToast({ type: "success", title: "Erfolg", description: "Aktion erfolgreich ausgeführt." })}>
        Success Toast
      </Button>
      <Button variant="danger" onClick={() => addToast({ type: "error", title: "Fehler", description: "Ein Fehler ist aufgetreten." })}>
        Error Toast
      </Button>
      <Button variant="secondary" onClick={() => addToast({ type: "warning", title: "Warnung", description: "Bitte beachten Sie dies." })}>
        Warning Toast
      </Button>
      <Button variant="ghost" onClick={() => addToast({ type: "info", title: "Info", description: "Weitere Informationen." })}>
        Info Toast
      </Button>
    </div>
  );
}

export const Default: Story = {
  render: () => (
    <ToastProvider>
      <ToastDemo />
    </ToastProvider>
  ),
};
