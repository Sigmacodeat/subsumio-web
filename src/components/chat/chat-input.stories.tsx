import type { Meta, StoryObj } from "@storybook/nextjs";
import { ChatInput } from "./chat-input";
import { fn } from "storybook/test";

const meta: Meta<typeof ChatInput> = {
  title: "Chat/ChatInput",
  component: ChatInput,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    isStreaming: { control: "boolean" },
    disabled: { control: "boolean" },
  },
  args: {
    onSend: fn(),
    onStop: fn(),
    isStreaming: false,
    disabled: false,
    placeholder: "Frage den Copilot…",
    features: { fileUpload: true },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Streaming: Story = {
  args: {
    isStreaming: true,
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};

export const WithoutFileUpload: Story = {
  args: {
    features: { fileUpload: false },
  },
};
