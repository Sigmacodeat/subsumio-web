import type { Meta, StoryObj } from "@storybook/react";
import { ConfirmProvider, useConfirm } from "./confirm-dialog";
import { Button } from "./button";

const meta: Meta = {
  title: "UI/ConfirmDialog",
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

function ConfirmDemo() {
  const confirm = useConfirm();
  return (
    <Button
      onClick={async () => {
        const ok = await confirm({ title: "Löschen?", message: "Möchten Sie diesen Eintrag wirklich löschen?", confirmLabel: "Löschen", variant: "danger" });
        alert(ok ? "Bestätigt" : "Abgebrochen");
      }}
    >
      Bestätigungsdialog öffnen
    </Button>
  );
}

export const Default: Story = {
  render: () => (
    <ConfirmProvider>
      <ConfirmDemo />
    </ConfirmProvider>
  ),
};
