import type { Meta, StoryObj } from "@storybook/react";
import { Pagination } from "./pagination";

const meta: Meta<typeof Pagination> = {
  title: "UI/Pagination",
  component: Pagination,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { currentPage: 3, totalPages: 10, onPageChange: (p: number) => console.log(p) },
};

export const FirstPage: Story = {
  args: { currentPage: 1, totalPages: 10, onPageChange: (p: number) => console.log(p) },
};

export const LastPage: Story = {
  args: { currentPage: 10, totalPages: 10, onPageChange: (p: number) => console.log(p) },
};

export const FewPages: Story = {
  args: { currentPage: 2, totalPages: 5, onPageChange: (p: number) => console.log(p) },
};
