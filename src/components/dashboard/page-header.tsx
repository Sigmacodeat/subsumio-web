"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator } from "@/components/ui/breadcrumb";

interface BreadcrumbItemShape {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: BreadcrumbItemShape[];
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, breadcrumbs, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("mb-8", className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumb className="mb-3 text-xs">
          {breadcrumbs.map((item, i) => (
            <BreadcrumbItem key={item.label}>
              {i > 0 && <BreadcrumbSeparator />}
              {item.href ? (
                <BreadcrumbLink asChild>
                  <Link href={item.href} className="hover:text-[color:var(--ds-text)] transition-colors">
                    {item.label}
                  </Link>
                </BreadcrumbLink>
              ) : (
                <BreadcrumbLink>
                  <span className="text-[color:var(--ds-text)] font-medium">{item.label}</span>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          ))}
        </Breadcrumb>
      )}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-[1.5rem] md:text-2xl font-bold text-[color:var(--ds-text)] tracking-tight leading-tight">{title}</h1>
          {description && <p className="mt-2 text-sm text-[color:var(--ds-text-muted)] leading-relaxed">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2.5 shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
