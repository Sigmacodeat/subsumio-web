import { cn } from "@/lib/utils";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  glass?: boolean;
  glow?: boolean;
}

function Card({ className, glass, glow, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "card-shadow hover:card-shadow-hover rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] transition-[border-color,box-shadow] duration-200 hover:border-[color:var(--ds-border-strong)] motion-reduce:transition-none",
        glass && "bg-[color:var(--ds-surface)]/95",
        glow && "shadow-lg shadow-[color:var(--brand-glow)]",
        className
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 p-6 pb-4", className)} {...props} />;
}

function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        "font-display text-base leading-tight font-semibold tracking-normal text-[color:var(--ds-text)]",
        className
      )}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-sm leading-relaxed text-[color:var(--ds-text-muted)]", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6 pt-0", className)} {...props} />;
}

function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 border-t border-[color:var(--ds-border)] p-6 pt-4",
        className
      )}
      {...props}
    />
  );
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
