import type { Meta, StoryObj } from "@storybook/react";
import { Textarea } from "./textarea";

const meta: Meta<typeof Textarea> = {
  title: "UI/Textarea",
  component: Textarea,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { placeholder: "Text eingeben…" },
};

export const WithValue: Story = {
  args: { defaultValue: "Vorbelegter Text\nZweite Zeile" },
};

export const Disabled: Story = {
  args: { placeholder: "Deaktiviert", disabled: true },
};
