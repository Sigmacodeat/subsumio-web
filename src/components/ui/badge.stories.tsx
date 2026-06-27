import type { Meta, StoryObj } from "@storybook/react";
import { Badge } from "./badge";

const meta: Meta<typeof Badge> = {
  title: "UI/Badge",
  component: Badge,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: [
        "default",
        "accent",
        "success",
        "warning",
        "danger",
        "info",
        "person",
        "company",
        "idea",
        "document",
        "event",
        "place",
      ],
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { children: "Default" } };
export const Accent: Story = { args: { children: "Accent", variant: "accent" } };
export const Success: Story = { args: { children: "Success", variant: "success" } };
export const Warning: Story = { args: { children: "Warning", variant: "warning" } };
export const Danger: Story = { args: { children: "Danger", variant: "danger" } };
export const Info: Story = { args: { children: "Info", variant: "info" } };
export const Person: Story = { args: { children: "Person", variant: "person" } };
export const Company: Story = { args: { children: "Company", variant: "company" } };
export const Idea: Story = { args: { children: "Idea", variant: "idea" } };
export const Document: Story = { args: { children: "Document", variant: "document" } };
export const Event: Story = { args: { children: "Event", variant: "event" } };
export const Place: Story = { args: { children: "Place", variant: "place" } };
