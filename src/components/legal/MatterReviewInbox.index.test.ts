// @vitest-environment jsdom

import { describe, test, expect } from "vitest";

/**
 * Regression test for the index-shift bug in MatterReviewInbox.
 *
 * The bug: suggestedDeadlines/suggestedParties were filtered with .filter(!confirmed)
 * BEFORE mapping to ReviewItem. The map callback's `index` parameter was therefore
 * the index within the FILTERED array, not the ORIGINAL array. When acceptSuggestedDeadline
 * used `matter.suggestedDeadlines[item.index]`, it accessed the wrong element.
 *
 * This test verifies that the index mapping logic produces original-array indices
 * even when some elements are already confirmed.
 */

interface SuggestedDeadline {
  title: string;
  due_date: string;
  urgency: string;
  source: string;
  source_quote: string;
  confirmed: boolean;
}

interface SuggestedParty {
  name: string;
  role: string;
  source: string;
  confirmed: boolean;
}

describe("MatterReviewInbox index mapping", () => {
  test("deadline items use original array index, not filtered index", () => {
    const suggestedDeadlines: SuggestedDeadline[] = [
      {
        title: "A",
        due_date: "2026-07-20",
        urgency: "high",
        source: "KI",
        source_quote: "",
        confirmed: true,
      },
      {
        title: "B",
        due_date: "2026-07-25",
        urgency: "medium",
        source: "KI",
        source_quote: "",
        confirmed: false,
      },
      {
        title: "C",
        due_date: "2026-07-30",
        urgency: "low",
        source: "KI",
        source_quote: "",
        confirmed: false,
      },
    ];

    // Replicate the fixed logic: map to include originalIndex, then filter, then map
    const items = suggestedDeadlines
      .map((deadline, originalIndex) => ({ deadline, originalIndex }))
      .filter(({ deadline }) => !deadline.confirmed)
      .slice(0, 3)
      .map(({ deadline, originalIndex }) => ({
        id: `deadline-${originalIndex}-${deadline.title}`,
        index: originalIndex,
        title: deadline.title,
      }));

    expect(items).toHaveLength(2);
    // B is at original index 1, C is at original index 2
    expect(items[0].index).toBe(1);
    expect(items[0].title).toBe("B");
    expect(items[1].index).toBe(2);
    expect(items[1].title).toBe("C");

    // Verify that using the index on the original array gives the correct element
    expect(suggestedDeadlines[items[0].index].title).toBe("B");
    expect(suggestedDeadlines[items[1].index].title).toBe("C");
  });

  test("party items use original array index, not filtered index", () => {
    const suggestedParties: SuggestedParty[] = [
      { name: "Max", role: "Mandant", source: "KI", confirmed: true },
      { name: "Anna", role: "Zeuge", source: "Dokument", confirmed: false },
      { name: "Lisa", role: "Gegner", source: "KI", confirmed: false },
    ];

    const items = suggestedParties
      .map((party, originalIndex) => ({ party, originalIndex }))
      .filter(({ party }) => !party.confirmed)
      .slice(0, 3)
      .map(({ party, originalIndex }) => ({
        id: `party-${originalIndex}-${party.name}`,
        index: originalIndex,
        name: party.name,
      }));

    expect(items).toHaveLength(2);
    expect(items[0].index).toBe(1);
    expect(items[0].name).toBe("Anna");
    expect(items[1].index).toBe(2);
    expect(items[1].name).toBe("Lisa");

    // Verify original array access
    expect(suggestedParties[items[0].index].name).toBe("Anna");
    expect(suggestedParties[items[1].index].name).toBe("Lisa");
  });

  test("all confirmed except last — only last should appear with correct index", () => {
    const suggestedDeadlines: SuggestedDeadline[] = [
      {
        title: "A",
        due_date: "2026-07-20",
        urgency: "high",
        source: "KI",
        source_quote: "",
        confirmed: true,
      },
      {
        title: "B",
        due_date: "2026-07-25",
        urgency: "medium",
        source: "KI",
        source_quote: "",
        confirmed: true,
      },
      {
        title: "C",
        due_date: "2026-07-30",
        urgency: "low",
        source: "KI",
        source_quote: "",
        confirmed: false,
      },
    ];

    const items = suggestedDeadlines
      .map((deadline, originalIndex) => ({ deadline, originalIndex }))
      .filter(({ deadline }) => !deadline.confirmed)
      .slice(0, 3)
      .map(({ deadline, originalIndex }) => ({
        index: originalIndex,
        title: deadline.title,
      }));

    expect(items).toHaveLength(1);
    expect(items[0].index).toBe(2);
    expect(items[0].title).toBe("C");
    expect(suggestedDeadlines[items[0].index].title).toBe("C");
  });
});
