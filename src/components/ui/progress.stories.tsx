import type { Meta, StoryObj } from "@storybook/react";
import { Progress } from "./progress";

const meta: Meta<typeof Progress> = {
  title: "UI/Progress",
  component: Progress,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { value: 60 } };

export const Zero: Story = { args: { value: 0 } };

export const Full: Story = { args: { value: 100 } };

export const Partial: Story = { args: { value: 33 } };
