"use client";

import { Fragment } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

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

function normalizeBreadcrumb(item: BreadcrumbItemShape): BreadcrumbItemShape {
  if (item.href === "/dashboard" && item.label === "Dashboard") {
    return { ...item, label: "Kanzlei-Cockpit" };
  }
  if (item.href === "/dashboard" && item.label === "Übersicht") {
    return { ...item, label: "Kanzlei-Cockpit" };
  }
  return item;
}

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  className,
}: PageHeaderProps) {
  const normalizedBreadcrumbs = breadcrumbs?.map(normalizeBreadcrumb);

  return (
    <div className={cn("mb-8", className)}>
      {normalizedBreadcrumbs && normalizedBreadcrumbs.length > 0 && (
        <Breadcrumb className="mb-3 text-xs">
          {normalizedBreadcrumbs.map((item, i) => (
            <Fragment key={item.label}>
              {i > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {item.href ? (
                  <BreadcrumbLink asChild>
                    <Link
                      href={item.href}
                      className="transition-colors hover:text-[color:var(--ds-text)]"
                    >
                      {item.label}
                    </Link>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbLink>
                    <span className="font-medium text-[color:var(--ds-text)]">{item.label}</span>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          ))}
        </Breadcrumb>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[1.5rem] leading-tight font-bold tracking-tight text-[color:var(--ds-text)] md:text-2xl">
            {title}
          </h1>
          {description && (
            <p className="mt-2 text-sm leading-relaxed text-[color:var(--ds-text-muted)]">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2.5">{actions}</div>}
      </div>
    </div>
  );
}
