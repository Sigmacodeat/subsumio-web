import type { Meta, StoryObj } from "@storybook/react";
import { ChatInput } from "./chat-input";
import { fn } from "@storybook/test";

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
    queryMode: { control: "select", options: ["balanced", "precise", "creative"] },
  },
  args: {
    onSend: fn(),
    onStop: fn(),
    onQueryModeChange: fn(),
    onModelChange: fn(),
    isStreaming: false,
    disabled: false,
    placeholder: "Frage den Copilot…",
    features: { fileUpload: true, modelSelector: true, modeSelector: true },
    queryMode: "balanced",
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

export const WithFileUploadOnly: Story = {
  args: {
    features: { fileUpload: true, modelSelector: false, modeSelector: false },
  },
};
