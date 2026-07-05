import { createBankTransaction, type BankTransaction } from "@/lib/fibu";

export interface BankFeedProvider {
  readonly name: string;
  fetchTransactions(input: { from: string; to: string }): Promise<BankTransaction[]>;
}

interface ProviderTransaction {
  id?: string;
  bookingDate?: string;
  date?: string;
  amount: number;
  currency?: string;
  creditorName?: string;
  debtorName?: string;
  creditorIban?: string;
  debtorIban?: string;
  remittanceInformation?: string;
  reference?: string;
}

/** Adapter for an Open-Banking aggregator exposing normalized transaction JSON. */
export class HttpBankFeedProvider implements BankFeedProvider {
  readonly name = "open-banking";
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly iban: string
  ) {}

  async fetchTransactions(input: { from: string; to: string }): Promise<BankTransaction[]> {
    const params = new URLSearchParams({ from: input.from, to: input.to, iban: this.iban });
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/transactions?${params}`, {
      headers: { Authorization: `Bearer ${this.token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Bank feed returned ${response.status}`);
    const payload = (await response.json()) as
      | { transactions?: ProviderTransaction[] }
      | ProviderTransaction[];
    const transactions = Array.isArray(payload) ? payload : (payload.transactions ?? []);
    return transactions.map((item) => ({
      ...createBankTransaction({
        date: item.bookingDate ?? item.date ?? new Date().toISOString().slice(0, 10),
        amount: Math.abs(item.amount),
        direction: item.amount >= 0 ? "credit" : "debit",
        iban: this.iban,
        sender_name: item.debtorName ?? item.creditorName,
        sender_iban: item.debtorIban ?? item.creditorIban,
        reference: item.reference,
        purpose: item.remittanceInformation,
      }),
      id: item.id
        ? `bank-${item.id}`
        : createBankTransaction({ date: "", amount: 0, direction: "credit", iban: this.iban }).id,
    }));
  }
}

export function bankFeedFromEnv(): BankFeedProvider | null {
  const url = process.env.BANK_FEED_API_URL;
  const token = process.env.BANK_FEED_API_TOKEN;
  const iban = process.env.BANK_FEED_IBAN;
  return url && token && iban ? new HttpBankFeedProvider(url, token, iban) : null;
}
