/**
 * `POST /api/intake` answers `{ intake: { slug, title, content, frontmatter } }`.
 * Returns that record so the acceptance wizard can open on it, or `null` when
 * the response carries no usable record.
 */
export function createdIntakeRecord<T extends { slug: string }>(result: unknown): T | null {
  if (!result || typeof result !== "object") return null;
  const intake = (result as { intake?: unknown }).intake;
  if (!intake || typeof intake !== "object") return null;
  const record = intake as { slug?: unknown; frontmatter?: unknown };
  if (typeof record.slug !== "string" || !record.slug) return null;
  if (!record.frontmatter || typeof record.frontmatter !== "object") return null;
  return intake as T;
}
