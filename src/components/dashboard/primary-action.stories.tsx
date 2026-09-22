import type { Meta, StoryObj } from "@storybook/nextjs";
import Link from "next/link";
import { Upload } from "lucide-react";
import { PrimaryAction } from "./primary-action";

const meta: Meta<typeof PrimaryAction> = {
  title: "Dashboard/PrimaryAction",
  component: PrimaryAction,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: "Neue Akte",
  },
};

export const CustomIcon: Story = {
  args: {
    children: "Hochladen",
    icon: <Upload size={15} aria-hidden="true" />,
  },
};

export const LinkAction: Story = {
  render: () => (
    <PrimaryAction asChild>
      <Link href="/dashboard/cases/new">Neue Akte</Link>
    </PrimaryAction>
  ),
};

export const Disabled: Story = {
  args: {
    children: "Speichern",
    disabled: true,
  },
};
