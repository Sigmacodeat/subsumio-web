import { createHash } from "crypto";
import { FIRM_TIMEZONE, zonedDateString } from "@/lib/datetime";
import { isPublicHoliday, type Bundesland, type Canton } from "@/lib/legal-deadlines";

/**
 * Ruhetag für Fristen-Benachrichtigungen: Samstag, Sonntag oder gesetzlicher
 * Feiertag im Rechtsraum der Kanzlei (Firmen-Zeitzone, nicht Server-TZ).
 *
 * An Ruhetagen gehen Routine-Digest-Mails, WhatsApp-Digests und die
 * Stufen-Erinnerungen nicht raus — sie werden auf den nächsten Werktag
 * verschoben, nicht verworfen: eine überfällige Frist bleibt überfällig und
 * wird beim nächsten Lauf erneut gefunden. NICHT verschoben werden die
 * Notfrist-Eskalation, Erinnerungen an Notfristen und an heute fällige
 * Fristen — eine versäumte Notfrist darf nicht bis nach einem Feiertagsblock
 * warten (Wiedereinsetzungsfristen laufen ab Wegfall des Hindernisses).
 *
 * Feiertage: für AT ohne Bundesland (die Einstellungsseite speichert für
 * Österreich keinen State) greifen die bundesweiten AT-Feiertage über den
 * Fallback in `isPublicHoliday`.
 */
export function isQuietDay(
  now: Date,
  settings: {
    deadlineQuietDays?: boolean;
    rechtsraumCountry?: "DE" | "AT" | "CH";
    rechtsraumState?: string;
  }
): boolean {
  if (settings.deadlineQuietDays === false) return false;
  const day = new Date(`${zonedDateString(now, FIRM_TIMEZONE)}T00:00:00Z`);
  const dow = day.getUTCDay();
  if (dow === 0 || dow === 6) return true;
  return isPublicHoliday(
    day,
    settings.rechtsraumState as Bundesland | Canton | undefined,
    settings.rechtsraumCountry
  );
}

/**
 * Stabile Identität einer überfälligen Notfrist für die permanente
 * Eskalations-Dedup — eine versäumte Notfrist alarmiert genau einmal, egal
 * wie viele Tage sie überfällig bleibt (sie steht weiterhin in jedem Digest).
 * Ohne `id`-Feld (Akten-eingebettete Fristen haben keine) nehmen wir
 * Titel+Fälligkeit+Akte.
 */
export function notfristEscalationKey(item: {
  title: string;
  dueDate: string;
  caseTitle?: string;
}): string {
  return createHash("sha256")
    .update(`${item.title}|${item.dueDate}|${item.caseTitle ?? ""}`)
    .digest("hex")
    .slice(0, 32);
}
