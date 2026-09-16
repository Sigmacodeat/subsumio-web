/**
 * Name helpers for greetings and salutations.
 *
 * Austrian and German lawyers carry academic and professional titles in their
 * display name ("Dr. Anna Müller", "Mag. Max Berger", "Univ.-Prof. DDr. …").
 * A naive `name.split(" ")[0]` greets them with "Guten Tag, Dr." — so strip
 * the leading title tokens first and fall back to the full name when nothing
 * but titles is left.
 */
const TITLE_TOKEN =
  /^(?:dr|ddr|mag|mmag|prof|univ|priv|doz|dipl|ing|di|bsc|msc|mba|llm|ll|ra|raa|hon|jur|iur|rer|nat|phil|med|habil|hr|ao|o|em)\.?(?:-[a-zäöü]+\.?)*$/i;

export function firstNameOf(name: string | null | undefined): string {
  const tokens = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "";
  const withoutTitles = tokens.filter((t) => !TITLE_TOKEN.test(t.replace(/[()]/g, "")));
  const first = withoutTitles[0];
  if (first) return first.replace(/,$/, "");
  // Only titles supplied ("Dr."): better the whole string than a bare title.
  return tokens.join(" ");
}
