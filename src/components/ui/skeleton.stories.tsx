import type { Meta, StoryObj } from "@storybook/nextjs";
import { Skeleton } from "./skeleton";

const meta: Meta<typeof Skeleton> = {
  title: "UI/Skeleton",
  component: Skeleton,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const TextLine: Story = {
  args: { className: "h-3 w-[200px]" },
};

export const Avatar: Story = {
  args: { className: "h-12 w-12 rounded-full" },
};

export const Badge: Story = {
  args: { className: "h-5 w-12" },
};

export const Card: Story = {
  render: () => (
    <div className="w-[320px] space-y-3 rounded border p-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-2.5 w-1/3" />
        </div>
      </div>
      <Skeleton className="h-2 w-full" />
      <Skeleton className="h-2 w-4/5" />
    </div>
  ),
};

export const TableRow: Story = {
  render: () => (
    <div className="w-[400px] space-y-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3 rounded border p-2">
          <Skeleton className="h-3 flex-1" />
          <Skeleton className="h-5 w-12" />
        </div>
      ))}
    </div>
  ),
};
