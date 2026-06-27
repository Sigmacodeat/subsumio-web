import type { Meta, StoryObj } from "@storybook/react";
import { Label } from "./label";
import { Input } from "./input";

const meta: Meta<typeof Label> = {
  title: "UI/Label",
  component: Label,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { children: "Feldbezeichnung" },
};

export const WithInput: Story = {
  render: () => (
    <div className="flex w-64 flex-col gap-2">
      <Label htmlFor="email">E-Mail-Adresse</Label>
      <Input id="email" type="email" placeholder="name@kanzlei.de" />
    </div>
  ),
};
