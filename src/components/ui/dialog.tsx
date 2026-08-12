"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/lib/hooks";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/60 backdrop-blur-sm duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:duration-0",
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

/**
 * Responsive DialogContent — wird auf Mobile (<640px) zum Bottom-Sheet:
 *  - Full-width, unten verankert, oben abgerundet
 *  - Slide-in von unten (nicht zoom-in)
 *  - Grab-Handle als visueller Anker
 *  - Close-Button 44px Touch-Target (WCAG 2.5.5)
 *  - Safe-Area-Inset für Notch-Geräte
 *
 * Auf Desktop (≥640px): zentrierter Dialog wie bisher.
 */
const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          ref={ref}
          className={cn(
            // Bottom-Sheet auf Mobile
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=open]:slide-in-from-bottom-full data-[state=closed]:slide-out-to-bottom-full",
            "fixed inset-x-0 bottom-0 z-50 flex w-full flex-col",
            "border-t border-[color:var(--ds-border-strong)] bg-[color:var(--ds-surface-2)]",
            "max-h-[90vh] rounded-t-2xl shadow-2xl",
            "duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-[transform] motion-reduce:duration-0",
            className
          )}
          {...props}
        >
          {/* Header — Grab-Handle + Close-Button, bleibt durch flex-col sticky */}
          <div className="relative z-10 flex shrink-0 items-center justify-center bg-[color:var(--ds-surface)] px-4 pt-3 pb-2">
            <div className="h-1.5 w-10 rounded-full bg-[color:var(--ds-border)]" aria-hidden="true" />
            <DialogPrimitive.Close className="ring-offset-[color:var(--ds-surface-2)] absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg opacity-60 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-[color:var(--ds-ring)] focus:ring-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 disabled:pointer-events-none">
              <X className="h-5 w-5" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>
          {/* Scrollbarer Content-Bereich — flex-1 + min-h-0 für zuverlässiges Scrollen */}
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            {children}
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    );
  }

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] fixed top-[50%] left-[50%] z-50 grid w-full max-w-lg max-h-[85vh] overflow-y-auto translate-x-[-50%] translate-y-[-50%] gap-4 border border-[color:var(--ds-border-strong)] bg-[color:var(--ds-surface-2)] p-6 shadow-xl duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-[opacity,transform] motion-reduce:duration-0 sm:rounded-xl",
          className
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="ring-offset-[color:var(--ds-surface-2)] absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-[color:var(--ds-ring)] focus:ring-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 disabled:pointer-events-none">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col gap-1.5 text-left", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:gap-2", className)}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg leading-none font-semibold tracking-tight text-[color:var(--ds-text)]",
      className
    )}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-[color:var(--ds-text-muted)]", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
