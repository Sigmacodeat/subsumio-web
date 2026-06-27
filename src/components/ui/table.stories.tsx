import type { Meta, StoryObj } from "@storybook/react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
} from "./table";

const meta: Meta<typeof Table> = {
  title: "UI/Table",
  component: Table,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Table className="w-96">
      <TableCaption>Übersicht der Akten</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Akte</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Datum</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>AZ-001</TableCell>
          <TableCell>Aktiv</TableCell>
          <TableCell>01.03.2025</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>AZ-002</TableCell>
          <TableCell>Geschlossen</TableCell>
          <TableCell>15.02.2025</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
};
