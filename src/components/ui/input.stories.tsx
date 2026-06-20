import type { Meta, StoryObj } from "@storybook/react";
import { Input } from "./input";
import { Search } from "lucide-react";

const meta: Meta<typeof Input> = {
  title: "UI/Input",
  component: Input,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { placeholder: "Text eingeben…" },
};

export const WithIcon: Story = {
  args: { placeholder: "Suchen…", icon: <Search size={16} /> },
};

export const Disabled: Story = {
  args: { placeholder: "Deaktiviert", disabled: true },
};

export const Password: Story = {
  args: { type: "password", placeholder: "Passwort" },
};
