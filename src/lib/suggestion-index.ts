/**
 * Open (unconfirmed) suggestions for the matter review inbox, each with its
 * index in the ORIGINAL list. Accept/reject address `suggestedDeadlines[i]` /
 * `suggestedParties[i]` by that index — an index into the filtered list would
 * act on the wrong suggestion as soon as one before it is confirmed.
 */
export function openSuggestions<T extends { confirmed?: boolean }>(
  list: readonly T[] | null | undefined,
  max = 3
): Array<{ item: T; index: number }> {
  return (list ?? [])
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !item.confirmed)
    .slice(0, max);
}
