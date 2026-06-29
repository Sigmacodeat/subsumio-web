import type { Meta, StoryObj } from "@storybook/react";
import { ChatPanel } from "./chat-panel";

const meta: Meta<typeof ChatPanel> = {
  title: "Chat/ChatPanel",
  component: ChatPanel,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    context: {
      control: "object",
    },
    initialQuery: { control: "text" },
    placeholder: { control: "text" },
  },
  args: {
    context: { type: "global" },
    features: {
      fileUpload: true,
      modelSelector: true,
      modeSelector: true,
      caseSelector: true,
      jurisdictionSelector: true,
      markdownRendering: true,
      sessionHistory: true,
      tokenWidget: true,
      brainStatus: true,
      exampleQueries: true,
      exportChat: true,
      messageActions: true,
    },
    persistHistory: true,
    placeholder: "Frage den Copilot…",
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Global: Story = {};

export const WithInitialQuery: Story = {
  args: {
    initialQuery: "Wie berechnet sich die Klagefrist?",
  },
};

export const CaseContext: Story = {
  args: {
    context: { type: "case", caseSlug: "fall-muster-2026" },
    title: "Fall: Muster Mandant",
  },
};

export const Minimal: Story = {
  args: {
    features: {
      fileUpload: false,
      modelSelector: false,
      modeSelector: true,
      caseSelector: false,
      jurisdictionSelector: false,
      markdownRendering: true,
      sessionHistory: false,
      tokenWidget: false,
      brainStatus: false,
      exampleQueries: false,
      exportChat: false,
      messageActions: true,
    },
  },
};
