import type { Meta, StoryObj } from "@storybook/nextjs";
import { SignaturePad } from "./signature-pad";

const meta: Meta<typeof SignaturePad> = {
  title: "UI/SignaturePad",
  component: SignaturePad,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    instructions:
      "Zeichnen Sie mit Finger, Maus oder Stift im Feld unten. Alternativ können Sie Ihren Namen tippen.",
  },
};

export const TypeMode: Story = {
  args: {
    defaultMode: "type",
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};

export const CustomPlaceholder: Story = {
  args: {
    typedNamePlaceholder: "Dr. Anna Müller",
    canvasAriaLabel: "Anwaltliche Unterschrift",
  },
};
