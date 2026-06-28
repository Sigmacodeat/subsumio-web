import { describe, it, expect } from "vitest";
import {
  organizationLd,
  softwareApplicationLd,
  breadcrumbLd,
  faqPageLd,
  howToLd,
  serviceLd,
  localBusinessLd,
  productLd,
  apiReferenceLd,
  reviewLd,
  aggregateRatingLd,
} from "./jsonld";

describe("JSON-LD Schema Functions", () => {
  describe("organizationLd", () => {
    it("returns Organization with @context and @type", () => {
      const data = organizationLd();
      expect(data["@context"]).toBe("https://schema.org");
      expect(data["@type"]).toBe("Organization");
      expect(data.name).toBe("Subsumio");
      expect(data.url).toBeTruthy();
      expect(data.logo).toContain("/icon-512.png");
    });

    it("includes alternateName and sameAs", () => {
      const data = organizationLd();
      expect(data.alternateName).toBe("Subsumio Legal AI");
      expect(Array.isArray(data.sameAs)).toBe(true);
      expect(data.sameAs.length).toBeGreaterThan(0);
    });
  });

  describe("softwareApplicationLd", () => {
    it("returns SoftwareApplication with offers", () => {
      const data = softwareApplicationLd("de");
      expect(data["@type"]).toBe("SoftwareApplication");
      expect(data.applicationCategory).toBe("BusinessApplication");
      expect(Array.isArray(data.offers)).toBe(true);
      expect(data.offers.length).toBeGreaterThan(0);
    });

    it("localizes description", () => {
      const de = softwareApplicationLd("de");
      const en = softwareApplicationLd("en");
      expect(de.description).toContain("KI-Kanzleisoftware");
      expect(en.description).toContain("AI legal software");
    });
  });

  describe("breadcrumbLd", () => {
    it("builds BreadcrumbList with positions", () => {
      const data = breadcrumbLd([
        { name: "Home", url: "/" },
        { name: "Pricing", url: "/pricing" },
      ]);
      expect(data["@type"]).toBe("BreadcrumbList");
      expect(data.itemListElement).toHaveLength(2);
      expect(data.itemListElement[0].position).toBe(1);
      expect(data.itemListElement[1].position).toBe(2);
    });

    it("expands relative URLs", () => {
      const data = breadcrumbLd([{ name: "Test", url: "/test" }]);
      expect(data.itemListElement[0].item).toContain("https://");
    });
  });

  describe("faqPageLd", () => {
    it("builds FAQPage with questions", () => {
      const data = faqPageLd([
        { q: "What is Subsumio?", a: "AI legal software" },
        { q: "Is it secure?", a: "Yes" },
      ]);
      expect(data["@type"]).toBe("FAQPage");
      expect(data.mainEntity).toHaveLength(2);
      expect(data.mainEntity[0]["@type"]).toBe("Question");
      expect(data.mainEntity[0].acceptedAnswer.text).toBe("AI legal software");
    });
  });

  describe("howToLd", () => {
    it("builds HowTo with steps", () => {
      const data = howToLd([{ title: "Upload", desc: "Upload documents" }], "en");
      expect(data["@type"]).toBe("HowTo");
      expect(data.step).toHaveLength(1);
      expect(data.step[0].position).toBe(1);
    });
  });

  describe("serviceLd", () => {
    it("builds Service with provider and areaServed", () => {
      const data = serviceLd({
        name: "Legal AI",
        description: "AI for lawyers",
        url: "/solutions/law-firms",
        lang: "en",
      });
      expect(data["@type"]).toBe("Service");
      expect(data.provider.name).toBe("Subsumio");
      expect(data.areaServed).toEqual(["AT", "DE", "CH"]);
      expect(data.url).toContain("https://");
    });

    it("includes audience when provided", () => {
      const data = serviceLd({
        name: "Test",
        description: "Test",
        url: "/test",
        lang: "de",
        audience: "Rechtsanwälte in Wien",
      });
      expect(data.audience!.name).toBe("Rechtsanwälte in Wien");
    });
  });

  describe("localBusinessLd", () => {
    it("returns LegalService with address and geo", () => {
      const data = localBusinessLd();
      expect(data["@type"]).toBe("LegalService");
      expect(data.address.addressCountry).toBe("AT");
      expect(data.address.addressLocality).toBe("Vienna");
      expect(data.geo.latitude).toBe(48.2028);
      expect(data.geo.longitude).toBe(16.3746);
    });
  });

  describe("productLd", () => {
    it("builds Product with offers", () => {
      const data = productLd({
        name: "Subsumio",
        description: "AI legal software",
        url: "/pricing",
        offers: [{ name: "Pro", price: "290", priceCurrency: "EUR" }],
      });
      expect(data["@type"]).toBe("Product");
      expect(data.offers).toHaveLength(1);
      expect(data.offers[0].price).toBe("290");
    });
  });

  describe("apiReferenceLd", () => {
    it("builds APIReference with endpoints", () => {
      const data = apiReferenceLd({
        name: "Subsumio API",
        description: "REST API",
        url: "/docs",
        endpoints: [
          { name: "Matters", description: "List matters", method: "GET", path: "/api/matters" },
        ],
      });
      expect(data["@type"]).toBe("APIReference");
      expect(data.programmingLanguage).toBe("REST");
      expect(data.subComponent!).toHaveLength(1);
      expect(data.subComponent![0].httpMethod).toBe("GET");
    });
  });

  describe("reviewLd", () => {
    it("builds Review with rating", () => {
      const data = reviewLd({
        author: "Dr. Müller",
        rating: 5,
        body: "Great software",
        date: "2026-05-15",
      });
      expect(data["@type"]).toBe("Review");
      expect(data.author.name).toBe("Dr. Müller");
      expect(data.reviewRating.ratingValue).toBe(5);
      expect(data.reviewRating.bestRating).toBe(5);
      expect(data.datePublished).toBe("2026-05-15");
    });
  });

  describe("aggregateRatingLd", () => {
    it("builds AggregateRating with reviews", () => {
      const reviews = [
        reviewLd({ author: "A", rating: 5, body: "Good" }),
        reviewLd({ author: "B", rating: 5, body: "Great" }),
      ];
      const data = aggregateRatingLd({
        ratingValue: 5,
        reviewCount: 2,
        reviews,
      });
      expect(data["@type"]).toBe("AggregateRating");
      expect(data.ratingValue).toBe(5);
      expect(data.reviewCount).toBe(2);
      expect(data.review).toHaveLength(2);
    });
  });
});

describe("JSON-LD Schema Consistency", () => {
  it("all schema functions include @context", () => {
    const schemas = [
      organizationLd(),
      softwareApplicationLd("de"),
      breadcrumbLd([{ name: "A", url: "/" }]),
      faqPageLd([{ q: "Q", a: "A" }]),
      howToLd([{ title: "T", desc: "D" }], "de"),
      serviceLd({ name: "N", description: "D", url: "/", lang: "de" }),
      localBusinessLd(),
      productLd({ name: "N", description: "D", url: "/", offers: [] }),
      apiReferenceLd({ name: "N", description: "D", url: "/" }),
      aggregateRatingLd({ ratingValue: 5, reviewCount: 1, reviews: [] }),
    ];
    for (const s of schemas) {
      expect(s["@context"]).toBe("https://schema.org");
    }
  });

  it("all schema functions have @type", () => {
    const schemas = [
      organizationLd(),
      softwareApplicationLd("de"),
      breadcrumbLd([{ name: "A", url: "/" }]),
      faqPageLd([{ q: "Q", a: "A" }]),
      howToLd([{ title: "T", desc: "D" }], "de"),
      serviceLd({ name: "N", description: "D", url: "/", lang: "de" }),
      localBusinessLd(),
      productLd({ name: "N", description: "D", url: "/", offers: [] }),
      apiReferenceLd({ name: "N", description: "D", url: "/" }),
      aggregateRatingLd({ ratingValue: 5, reviewCount: 1, reviews: [] }),
    ];
    for (const s of schemas) {
      expect(s["@type"]).toBeTruthy();
    }
  });
});
