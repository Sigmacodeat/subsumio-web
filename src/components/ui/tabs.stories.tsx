import type { Meta, StoryObj } from "@storybook/react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./tabs";

const meta: Meta<typeof Tabs> = {
  title: "UI/Tabs",
  component: Tabs,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="overview" className="w-96">
      <TabsList>
        <TabsTrigger value="overview">Übersicht</TabsTrigger>
        <TabsTrigger value="details">Details</TabsTrigger>
        <TabsTrigger value="history">Verlauf</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">Inhalt der Übersicht.</TabsContent>
      <TabsContent value="details">Detailinformationen.</TabsContent>
      <TabsContent value="history">Verlaufseinträge.</TabsContent>
    </Tabs>
  ),
};
