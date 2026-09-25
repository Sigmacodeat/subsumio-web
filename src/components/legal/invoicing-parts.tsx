"use client";

// Small presentational pieces of the invoicing page.
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function InvoiceStat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "warning" | "danger";
}) {
  return (
    <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3">
      <div className="text-xs text-[color:var(--ds-text-muted)]">{label}</div>
      <div
        className={cn(
          "mt-1 text-xl font-semibold tabular-nums",
          tone === "danger"
            ? "text-[color:var(--ds-danger-text)]"
            : tone === "warning"
              ? "text-[color:var(--ds-warning-text)]"
              : "text-[color:var(--ds-text)]"
        )}
      >
        {value}
      </div>
      <div className="mt-0.5 text-xs text-[color:var(--ds-text-muted)] tabular-nums">{sub}</div>
    </div>
  );
}

export function IconAction({
  label,
  onClick,
  disabled,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "rounded-lg p-2 text-[color:var(--ds-text-muted)] transition-[background-color,color] duration-[var(--ds-duration-fast)] hover:bg-[color:var(--ds-surface-2)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none disabled:opacity-40 motion-reduce:transition-none",
        className
      )}
    >
      {children}
    </button>
  );
}

export function HubMenuLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <DropdownMenuItem asChild className="gap-2 text-xs">
      <Link href={href}>
        <Icon size={13} aria-hidden="true" />
        {label}
      </Link>
    </DropdownMenuItem>
  );
}
