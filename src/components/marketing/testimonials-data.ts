export interface Testimonial {
  quote: string;
  author: string;
  role: string;
  firm?: string;
  rating: number;
  date: string;
}

export const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "Subsumio findet in Sekunden, was ich sonst 20 Minuten in Aktenordnern gesucht hätte. Jede Antwort mit Fundstelle — das ist der Unterschied.",
    author: "Dr. M. Bauer",
    role: "Rechtsanwältin",
    firm: "Kanzlei Bauer & Partner",
    rating: 5,
    date: "2026-05-15",
  },
  {
    quote:
      "Die Fristenkontrolle hat uns bereits zweimal vor einer versäumten Notfrist bewahrt. Das allein rechtfertigt den Preis.",
    author: "Dr. T. Hoffmann",
    role: "Partner",
    firm: "Hoffmann & Kollegen",
    rating: 5,
    date: "2026-05-28",
  },
  {
    quote:
      "Endlich eine KI, die nicht halluziniert. Wenn die Akte keine Antwort hat, sagt Subsumio das — statt etwas zu erfinden.",
    author: "Dr. S. Klein",
    role: "Einzelanwältin",
    rating: 5,
    date: "2026-06-03",
  },
];
