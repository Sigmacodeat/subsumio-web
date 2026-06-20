import type { Meta, StoryObj } from "@storybook/react";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "./accordion";

const meta: Meta<typeof Accordion> = {
  title: "UI/Accordion",
  component: Accordion,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Accordion defaultValue="item-1" className="w-80">
      <AccordionItem value="item-1">
        <AccordionTrigger>Abschnitt 1</AccordionTrigger>
        <AccordionContent>Inhalt des ersten Abschnitts.</AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2">
        <AccordionTrigger>Abschnitt 2</AccordionTrigger>
        <AccordionContent>Inhalt des zweiten Abschnitts.</AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-3">
        <AccordionTrigger>Abschnitt 3</AccordionTrigger>
        <AccordionContent>Inhalt des dritten Abschnitts.</AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};

export const SingleItem: Story = {
  render: () => (
    <Accordion className="w-80">
      <AccordionItem value="only">
        <AccordionTrigger>Einzelner Abschnitt</AccordionTrigger>
        <AccordionContent>Nur ein Abschnitt.</AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};
