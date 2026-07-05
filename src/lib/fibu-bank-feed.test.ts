import { describe, expect, it, vi } from "vitest";
import { HttpBankFeedProvider } from "@/lib/fibu-bank-feed.server";

describe("HttpBankFeedProvider", () => {
  it("maps aggregator transactions into the FiBu model", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            transactions: [
              {
                id: "1",
                bookingDate: "2026-07-05",
                amount: 100,
                debtorName: "Mandant",
                remittanceInformation: "RE-42",
              },
            ],
          }),
          { status: 200 }
        )
      )
    );
    const result = await new HttpBankFeedProvider(
      "https://bank.test",
      "token",
      "DE123"
    ).fetchTransactions({ from: "2026-07-01", to: "2026-07-05" });
    expect(result[0]).toMatchObject({
      id: "bank-1",
      direction: "credit",
      amount: 100,
      purpose: "RE-42",
    });
    vi.unstubAllGlobals();
  });
});
