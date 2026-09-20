// Website contact requests (from the concierge chat and the contact page) and
// how well the concierge answers: volume, unanswered questions (the list of
// what the website does not say yet) and sentences the claim check removed.

import { PageHeader } from "@/components/dashboard/page-header";
import { conciergeStats, listLeads } from "@/lib/concierge/store";
import LeadStatusSelect from "./LeadStatusSelect";

export const metadata = { title: "Anfragen" };
export const dynamic = "force-dynamic";

const KIND: Record<string, string> = {
  callback: "Rückruf",
  meeting: "Termin",
  question: "Frage",
  enterprise: "Enterprise",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("de-AT", { dateStyle: "short", timeStyle: "short" });
}

export default async function OpsLeadsPage() {
  const [leads, stats] = await Promise.all([listLeads(), conciergeStats()]);
  const answeredPct =
    stats.turns > 0 ? Math.round(((stats.turns - stats.unanswered) / stats.turns) * 100) : null;

  return (
    <div className="mx-0 w-full space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title="Anfragen & Website-Chat"
        breadcrumbs={[{ label: "Betreiber-Konsole", href: "/ops" }, { label: "Anfragen" }]}
      />

      {answeredPct !== null && answeredPct < 75 && stats.turns >= 20 && (
        <p
          role="alert"
          className="rounded-xl border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] p-4 text-sm text-[color:var(--ds-warning-text)]"
        >
          Nur {answeredPct} % der Chat-Fragen konnten belegt beantwortet werden. Die Liste unten
          zeigt, welche Inhalte auf der Website fehlen.
        </p>
      )}

      <section aria-labelledby="chat-quality" className="grid gap-4 sm:grid-cols-3">
        <h2 id="chat-quality" className="sr-only">
          Qualität des Website-Chats, letzte 30 Tage
        </h2>
        {[
          { label: "Chat-Antworten (30 Tage)", value: stats.turns.toLocaleString("de-AT") },
          {
            label: "Belegt beantwortet",
            value: answeredPct === null ? "—" : `${answeredPct} %`,
          },
          {
            label: "Vom Beleg-Check entfernte Sätze",
            value: stats.dropped.toLocaleString("de-AT"),
          },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5"
          >
            <p className="text-xs text-[color:var(--ds-text-subtle)]">{s.label}</p>
            <p className="mt-1 text-2xl font-semibold text-[color:var(--ds-text)] tabular-nums">
              {s.value}
            </p>
          </div>
        ))}
      </section>

      <div className="overflow-x-auto rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
        <table className="w-full text-sm">
          <caption className="px-5 pt-4 text-left text-sm font-semibold text-[color:var(--ds-text)]">
            Kontaktanfragen
          </caption>
          <thead>
            <tr className="border-b border-[color:var(--ds-border)] text-left text-xs tracking-wider text-[color:var(--ds-text-subtle)] uppercase">
              <th className="px-5 py-3 font-medium">Eingang</th>
              <th className="px-5 py-3 font-medium">Art</th>
              <th className="px-5 py-3 font-medium">Kontakt</th>
              <th className="px-5 py-3 font-medium">Kanzlei</th>
              <th className="px-5 py-3 font-medium">Anliegen</th>
              <th className="px-5 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-5 py-10 text-center text-[color:var(--ds-text-subtle)]"
                >
                  Noch keine Anfragen.
                </td>
              </tr>
            )}
            {leads.map((l) => (
              <tr
                key={l.id}
                className="border-b border-[color:var(--ds-border)]/50 align-top last:border-0"
              >
                <td className="px-5 py-3 whitespace-nowrap text-[color:var(--ds-text-muted)]">
                  {formatDate(l.createdAt)}
                </td>
                <td className="px-5 py-3">{KIND[l.kind] ?? l.kind}</td>
                <td className="px-5 py-3">
                  <div className="font-medium text-[color:var(--ds-text)]">{l.name}</div>
                  <a
                    href={`mailto:${l.email}`}
                    className="text-[color:var(--ds-text-muted)] underline-offset-2 hover:underline"
                  >
                    {l.email}
                  </a>
                  {l.phone && <div className="text-[color:var(--ds-text-muted)]">{l.phone}</div>}
                </td>
                <td className="px-5 py-3 text-[color:var(--ds-text-muted)]">
                  {l.firm ?? "—"}
                  {l.firmSize && <div className="text-xs">{l.firmSize}</div>}
                </td>
                <td className="max-w-md px-5 py-3 text-[color:var(--ds-text-muted)]">
                  {l.message && <p className="line-clamp-4 whitespace-pre-line">{l.message}</p>}
                  {l.preferredTime && (
                    <p className="mt-1 text-xs">Wunschtermin: {l.preferredTime}</p>
                  )}
                  {l.page && <p className="mt-1 text-xs">von {l.page}</p>}
                </td>
                <td className="px-5 py-3">
                  <LeadStatusSelect id={l.id} status={l.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
        <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
          Fragen ohne belegte Antwort
        </h2>
        <p className="mt-1 text-xs text-[color:var(--ds-text-subtle)]">
          Hier fehlt Inhalt auf der Website. Ergänzen Sie die passende Seite; der Chat kennt die
          Antwort danach automatisch.
        </p>
        {stats.topUnanswered.length === 0 ? (
          <p className="mt-4 text-sm text-[color:var(--ds-text-muted)]">Keine offenen Lücken.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {stats.topUnanswered.map((q, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="shrink-0 text-xs text-[color:var(--ds-text-subtle)] tabular-nums">
                  {formatDate(q.createdAt)}
                </span>
                <span className="text-[color:var(--ds-text)]">{q.question}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
