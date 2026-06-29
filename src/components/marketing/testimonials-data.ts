export interface Testimonial {
  quote: string;
  author: string;
  role: string;
  firm?: string;
  rating: number;
  date: string;
}

// NOTE: Testimonials are intentionally empty until we have REAL, written
// consent from named firms. Fabricated reviews are a Google manual-action
// risk (fake review structured data) and a UWG violation (irreführende
// Werbung) in the DACH market. When real references arrive, add them here —
// the testimonials section and the Review/AggregateRating JSON-LD both
// light up automatically (they are guarded on TESTIMONIALS.length).
export const TESTIMONIALS: Testimonial[] = [];
