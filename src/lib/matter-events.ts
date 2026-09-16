/**
 * Window-level events that let globally mounted quick-create dialogs (they live
 * in the dashboard shell, outside any matter provider) tell the matter
 * contexts that their data changed. Contexts refetch; nothing else is coupled.
 */
export const DEADLINE_CREATED_EVENT = "subsumio:deadline-created";

export interface DeadlineCreatedDetail {
  caseSlug?: string;
}

export function emitDeadlineCreated(caseSlug?: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<DeadlineCreatedDetail>(DEADLINE_CREATED_EVENT, { detail: { caseSlug } })
  );
}

/** True when an event for `caseSlug` (or a global one without slug) concerns this matter. */
export function deadlineEventConcerns(event: Event, slug: string): boolean {
  const detail = (event as CustomEvent<DeadlineCreatedDetail>).detail;
  return !detail?.caseSlug || detail.caseSlug === slug;
}
