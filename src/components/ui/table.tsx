import * as React from "react";
import { cn } from "@/lib/utils";

interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  /**
   * Extra classes for the wrapper div. Typical use: `lg:overflow-x-visible`
   * for a table that fits on wide screens — without a scroll container around
   * it, a `sticky` header sticks to the viewport instead of this div.
   */
  wrapperClassName?: string;
}

const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, wrapperClassName, ...props }, ref) => (
    // overflow-x-auto, not the `overflow-auto` shorthand: a wide table needs its
    // own horizontal scrollbar, but must never clip vertically. Note that ANY
    // non-visible overflow makes this div the scroll container of a sticky
    // header inside it, so `sticky top-0` then pins to this div (which never
    // scrolls vertically) — pass `wrapperClassName="lg:overflow-x-visible"`
    // where the header must stick to the viewport. overscroll-x-contain stops a
    // horizontal swipe at the table edge from falling through to the browser's
    // back/forward gesture; it does not affect vertical scrolling.
    <div className={cn("relative w-full overflow-x-auto overscroll-x-contain", wrapperClassName)}>
      <table ref={ref} className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  )
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn("border-b border-[color:var(--ds-border)]", className)}
    {...props}
  />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
));
TableBody.displayName = "TableBody";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        "border-b border-[color:var(--ds-border)] transition-[background-color,border-color,color] hover:bg-[color:var(--ds-surface-2)] data-[state=selected]:bg-[color:var(--ds-surface-2)] motion-reduce:transition-none",
        className
      )}
      {...props}
    />
  )
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-12 px-4 text-left align-middle font-medium text-[color:var(--ds-text-muted)] tabular-nums",
      className
    )}
    {...props}
  />
));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td ref={ref} className={cn("p-4 align-middle tabular-nums", className)} {...props} />
));
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-[color:var(--ds-text-muted)]", className)}
    {...props}
  />
));
TableCaption.displayName = "TableCaption";

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableCaption };
