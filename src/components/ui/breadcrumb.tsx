import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface BreadcrumbProps {
  children: React.ReactNode;
  className?: string;
}

export function Breadcrumb({ children, className }: BreadcrumbProps) {
  return (
    <nav aria-label="breadcrumb" className={cn("", className)}>
      <ol className="flex flex-wrap items-center gap-1.5 break-words text-sm text-[color:var(--ds-text-muted)]">
        {children}
      </ol>
    </nav>
  );
}

export function BreadcrumbItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return <li className={cn("inline-flex items-center gap-1.5", className)}>{children}</li>;
}

export function BreadcrumbLink({ href, children, className, asChild }: { href?: string; children: React.ReactNode; className?: string; asChild?: boolean }) {
  if (asChild) {
    return <>{children}</>;
  }
  if (href) {
    return (
      <a href={href} className={cn("hover:text-[color:var(--ds-text)] transition-colors", className)}>
        {children}
      </a>
    );
  }
  return <span className={cn("text-[color:var(--ds-text)]", className)}>{children}</span>;
}

export function BreadcrumbSeparator({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <li role="presentation" aria-hidden="true" className={cn("[&>svg]:w-3.5 [&>svg]:h-3.5", className)}>
      {children ?? <ChevronRight className="text-[color:var(--ds-text-muted)]" />}
    </li>
  );
}
