/**
 * WP-2.8 Rest: Ordner-Baum für Dokument-Ordner.
 * Ordner sind flache Strings im Frontmatter („folder"); Verschachtelung
 * erfolgt via „/" im Namen („Korrespondenz/Ausgehend"). Diese Lib baut
 * daraus einen echten Baum und liefert Prefix-Matching für den Filter.
 */

export interface FolderNode {
  /** letztes Pfadsegment („Ausgehend") */
  name: string;
  /** voller Pfad („Korrespondenz/Ausgehend") */
  path: string;
  /** Dokumente exakt in diesem Ordner */
  count: number;
  /** Dokumente in diesem Ordner + allen Unterordnern */
  totalCount: number;
  children: FolderNode[];
}

/**
 * Baut den Baum aus Ordner-Pfaden. `counts` mappt voller Pfad → Anzahl
 * Dokumente exakt in diesem Ordner (für Badges). Reihenfolge: Alphabetisch,
 * de-DE-lokalisiert.
 */
export function buildFolderTree(
  paths: string[],
  counts: Record<string, number> = {}
): FolderNode[] {
  const root: FolderNode[] = [];
  const byPath = new Map<string, FolderNode>();

  const sorted = [...new Set(paths.filter(Boolean))].sort((a, b) => a.localeCompare(b, "de"));

  for (const path of sorted) {
    const segments = path.split("/").filter(Boolean);
    let siblings = root;
    let prefix = "";
    for (const seg of segments) {
      prefix = prefix ? `${prefix}/${seg}` : seg;
      let node = byPath.get(prefix);
      if (!node) {
        node = { name: seg, path: prefix, count: 0, totalCount: 0, children: [] };
        byPath.set(prefix, node);
        siblings.push(node);
        siblings.sort((a, b) => a.name.localeCompare(b.name, "de"));
      }
      siblings = node.children;
    }
  }

  const accumulate = (nodes: FolderNode[]): number => {
    let total = 0;
    for (const n of nodes) {
      n.count = counts[n.path] ?? 0;
      n.totalCount = n.count + accumulate(n.children);
      total += n.totalCount;
    }
    return total;
  };
  accumulate(root);

  return root;
}

/** true wenn `folder` dem gewählten Baum-Knoten entspricht (inkl. Kinder). */
export function folderMatches(folder: string | undefined, selected: string): boolean {
  if (selected === "all") return true;
  if (selected === "") return !folder;
  if (!folder) return false;
  return folder === selected || folder.startsWith(`${selected}/`);
}
