import type { Meta, StoryObj } from "@storybook/react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "./card";
import { Button } from "./button";

const meta: Meta<typeof Card> = {
  title: "UI/Card",
  component: Card,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card className="w-96">
      <CardHeader>
        <CardTitle>Aktentitel</CardTitle>
        <CardDescription>Beschreibung der Akte mit Details.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm">Inhalt der Karte mit weiteren Informationen.</p>
      </CardContent>
      <CardFooter>
        <Button size="sm">Aktion</Button>
      </CardFooter>
    </Card>
  ),
};

export const Glass: Story = {
  render: () => (
    <Card glass className="w-96">
      <CardHeader>
        <CardTitle>Glass Card</CardTitle>
        <CardDescription>Mit Backdrop-Blur-Effekt.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm">Transparenter Hintergrund mit Blur.</p>
      </CardContent>
    </Card>
  ),
};

export const Glow: Story = {
  render: () => (
    <Card glow className="w-96">
      <CardHeader>
        <CardTitle>Glow Card</CardTitle>
        <CardDescription>Mit Glüh-Effekt.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm">Brand-colored Shadow.</p>
      </CardContent>
    </Card>
  ),
};
