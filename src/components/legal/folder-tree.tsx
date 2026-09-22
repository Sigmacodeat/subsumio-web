"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderTree as FolderTreeIcon,
  MoreVertical,
  Pencil,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { FolderNode } from "@/lib/folder-tree";

/** dataTransfer-MIME, unter dem Dokument-Slugs auf Ordner gezogen werden. */
export const FOLDER_DND_MIME = "application/x-subsumio-doc";

interface FolderTreeLabels {
  all: string;
  unfiled: string;
  heading: string;
  /** aria-label des ⋯-Buttons / des Kontextmenüs */
  menu: string;
  rename: string;
  newSubfolder: string;
}

interface FolderTreeProps {
  nodes: FolderNode[];
  selected: string;
  onSelect: (path: string) => void;
  labels: FolderTreeLabels;
  /** Anzahl Dokumente ohne Ordner */
  unfiledCount: number;
  totalCount: number;
  /** Dokument per Drag & Drop verschieben (folderPath "" = ohne Ordner). */
  onDropDocument?: (docSlug: string, folderPath: string) => void;
  /** Kontextmenü-Aktionen — undefined = Menü deaktiviert (z. B. archivierte Akte). */
  onRenameFolder?: (path: string) => void;
  onCreateSubfolder?: (parentPath: string) => void;
  /** Suffix für den localStorage-Key des Auf-/Zuklapp-Zustands (pro Akte). */
  persistKey?: string;
}

function readCollapsed(storageKey: string | null): Set<string> {
  if (!storageKey || typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(storageKey);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function FolderTree({
  nodes,
  selected,
  onSelect,
  labels,
  unfiledCount,
  totalCount,
  onDropDocument,
  onRenameFolder,
  onCreateSubfolder,
  persistKey,
}: FolderTreeProps) {
  const storageKey = persistKey ? `subsumio:folder-collapsed:${persistKey}` : null;
  const [collapsed, setCollapsed] = useState<Set<string>>(() => readCollapsed(storageKey));
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);

  const toggleOpen = useCallback(
    (path: string) => {
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        if (storageKey) {
          try {
            window.localStorage.setItem(storageKey, JSON.stringify([...next]));
          } catch {
            /* storage voll/verweigert — Zustand lebt nur in-memory weiter */
          }
        }
        return next;
      });
    },
    [storageKey]
  );

  const hasMenu = Boolean(onRenameFolder || onCreateSubfolder);

  /** Gemeinsame Drop-Handler für Ordner-Zeilen (path "" = „Ohne Ordner"). */
  const dropProps = useCallback(
    (path: string, onHoverExpand?: () => void): DropHandlers =>
      onDropDocument
        ? {
            onDragOver: (e) => {
              if (!e.dataTransfer.types.includes(FOLDER_DND_MIME)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setDropTarget(path);
              onHoverExpand?.();
            },
            onDrop: (e) => {
              e.preventDefault();
              setDropTarget(null);
              const slug = e.dataTransfer.getData(FOLDER_DND_MIME);
              if (slug) onDropDocument(slug, path);
            },
          }
        : {},
    [onDropDocument]
  );

  // Highlight nur löschen, wenn der Drag den Baum komplett verlässt —
  // Zeilen-internes dragleave (relatedTarget noch im nav) ignorieren.
  const onNavDragLeave = (e: React.DragEvent) => {
    const next = e.relatedTarget as Node | null;
    if (!next || !navRef.current?.contains(next)) setDropTarget(null);
  };

  // APG-Tastatur: ↑/↓ fokussiert Zeilen, → expandiert, ← kollabiert bzw.
  // springt zum Eltern-Knoten. Die Zeilen bleiben alle tabbbar (roving
  // tabindex wäre Overkill für die typische Ordnerzahl pro Akte).
  const onNavKeyDown = (e: React.KeyboardEvent) => {
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
    const rows = [...(navRef.current?.querySelectorAll<HTMLElement>("[data-tree-row]") ?? [])];
    const idx = rows.indexOf(document.activeElement as HTMLElement);
    if (idx < 0) return;
    const row = rows[idx];
    e.preventDefault();
    if (e.key === "ArrowDown") rows[Math.min(idx + 1, rows.length - 1)]?.focus();
    else if (e.key === "ArrowUp") rows[Math.max(idx - 1, 0)]?.focus();
    else if (e.key === "ArrowRight") {
      if (row.dataset.expandable === "true" && row.dataset.expanded === "false") {
        toggleOpen(row.dataset.path ?? "");
      }
    } else if (row.dataset.expandable === "true" && row.dataset.expanded === "true") {
      toggleOpen(row.dataset.path ?? "");
    } else if (row.dataset.parent) {
      rows.find((r) => r.dataset.path === row.dataset.parent)?.focus();
    }
  };

  return (
    // role="tree" auf dem äußeren Wrapper: APG-Tastatur-Handler dürfen nicht
    // auf einem nicht-interaktiven Element (<nav>) sitzen — jsx-a11y.
    <div
      ref={navRef}
      role="tree"
      tabIndex={-1}
      aria-label={labels.heading}
      className="space-y-0.5"
      onKeyDown={onNavKeyDown}
      onDragLeave={onNavDragLeave}
    >
      <TreeRow
        depth={0}
        icon={<FolderTreeIcon size={13} />}
        label={labels.all}
        count={totalCount}
        active={selected === "all"}
        onClick={() => onSelect("all")}
      />
      <TreeRow
        depth={0}
        icon={<Folder size={13} />}
        label={labels.unfiled}
        count={unfiledCount}
        active={selected === ""}
        onClick={() => onSelect("")}
        dropProps={dropProps("")}
        isDropTarget={dropTarget === ""}
      />
      {nodes.map((n) => (
        <TreeNode
          key={n.path}
          node={n}
          depth={0}
          parentPath={null}
          selected={selected}
          onSelect={onSelect}
          collapsed={collapsed}
          toggleOpen={toggleOpen}
          dropTarget={dropTarget}
          makeDropProps={dropProps}
          menu={hasMenu ? { labels, onRenameFolder, onCreateSubfolder } : null}
        />
      ))}
    </div>
  );
}

interface TreeMenu {
  labels: FolderTreeLabels;
  onRenameFolder?: (path: string) => void;
  onCreateSubfolder?: (parentPath: string) => void;
}

type DropHandlers = Pick<React.HTMLAttributes<HTMLElement>, "onDragOver" | "onDrop">;

function TreeNode({
  node,
  depth,
  parentPath,
  selected,
  onSelect,
  collapsed,
  toggleOpen,
  dropTarget,
  makeDropProps,
  menu,
}: {
  node: FolderNode;
  depth: number;
  parentPath: string | null;
  selected: string;
  onSelect: (path: string) => void;
  collapsed: Set<string>;
  toggleOpen: (path: string) => void;
  dropTarget: string | null;
  makeDropProps: (path: string, onHoverExpand?: () => void) => DropHandlers;
  menu: TreeMenu | null;
}) {
  const open = !collapsed.has(node.path);
  const active = selected === node.path;
  const hasChildren = node.children.length > 0;
  const [menuOpen, setMenuOpen] = useState(false);
  const expandTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Bei Drag-Hover über einem zugeklappten Ordner nach kurzer Verzögerung
  // aufklappen — Standard-Verhalten aus Datei-Managern (Finder/Explorer).
  const scheduleExpand = useCallback(() => {
    if (!hasChildren || open || expandTimer.current) return;
    expandTimer.current = setTimeout(() => toggleOpen(node.path), 600);
  }, [hasChildren, open, node.path, toggleOpen]);

  useEffect(
    () => () => {
      if (expandTimer.current) clearTimeout(expandTimer.current);
    },
    []
  );

  return (
    <div
      role="treeitem"
      tabIndex={-1}
      aria-expanded={hasChildren ? open : undefined}
      aria-selected={active}
      onContextMenu={
        menu
          ? (e) => {
              // Kinder-Nodes sind verschachtelt — ohne stopPropagation
              // öffnet das Kontextmenü auch auf allen Eltern-Ebenen.
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen(true);
            }
          : undefined
      }
    >
      <div
        className="group flex items-center"
        style={{ paddingLeft: depth * 14 }}
        {...makeDropProps(node.path, scheduleExpand)}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => toggleOpen(node.path)}
            aria-label={`${open ? "Zuklappen" : "Aufklappen"}: ${node.name}`}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none"
          >
            <ChevronRight
              size={12}
              className={`transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`}
            />
          </button>
        ) : (
          <span className="w-5 shrink-0" aria-hidden="true" />
        )}
        <TreeRowButton
          icon={open && hasChildren ? <FolderOpen size={13} /> : <Folder size={13} />}
          label={node.name}
          count={node.totalCount}
          active={active}
          onClick={() => onSelect(node.path)}
          dataAttrs={{
            "data-tree-row": "true",
            "data-path": node.path,
            "data-expandable": String(hasChildren),
            "data-expanded": String(open),
            ...(parentPath ? { "data-parent": parentPath } : {}),
          }}
          isDropTarget={dropTarget === node.path}
        />
        {menu && (
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`${menu.labels.menu}: ${node.name}`}
                className="ml-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[color:var(--ds-text-muted)] opacity-40 transition-opacity hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none md:opacity-0 md:group-hover:opacity-100"
              >
                <MoreVertical size={12} aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="bottom" className="min-w-44">
              {menu.onCreateSubfolder && (
                <DropdownMenuItem onSelect={() => menu.onCreateSubfolder?.(node.path)}>
                  <FolderPlus size={13} className="mr-2" aria-hidden />
                  {menu.labels.newSubfolder}
                </DropdownMenuItem>
              )}
              {menu.onRenameFolder && (
                <DropdownMenuItem onSelect={() => menu.onRenameFolder?.(node.path)}>
                  <Pencil size={13} className="mr-2" aria-hidden />
                  {menu.labels.rename}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {open &&
        node.children.map((c) => (
          <TreeNode
            key={c.path}
            node={c}
            depth={depth + 1}
            parentPath={node.path}
            selected={selected}
            onSelect={onSelect}
            collapsed={collapsed}
            toggleOpen={toggleOpen}
            dropTarget={dropTarget}
            makeDropProps={makeDropProps}
            menu={menu}
          />
        ))}
    </div>
  );
}

function TreeRow({
  depth,
  icon,
  label,
  count,
  active,
  onClick,
  dropProps,
  isDropTarget,
}: {
  depth: number;
  icon: React.ReactNode;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  dropProps?: DropHandlers;
  isDropTarget?: boolean;
}) {
  return (
    <div className="flex items-center" style={{ paddingLeft: depth * 14 }} {...dropProps}>
      <span className="w-5 shrink-0" aria-hidden="true" />
      <TreeRowButton
        icon={icon}
        label={label}
        count={count}
        active={active}
        onClick={onClick}
        isDropTarget={isDropTarget}
      />
    </div>
  );
}

function TreeRowButton({
  icon,
  label,
  count,
  active,
  onClick,
  dataAttrs,
  isDropTarget,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  dataAttrs?: Record<string, string>;
  isDropTarget?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      {...dataAttrs}
      className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-xs transition-colors hover:bg-[color:var(--ds-hover)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none ${
        isDropTarget
          ? "bg-[color:var(--ds-hover)] text-[color:var(--ds-text)] ring-2 ring-[var(--brand-primary)]"
          : active
            ? "bg-[color:var(--ds-hover)] font-semibold text-[color:var(--ds-text)]"
            : "text-[color:var(--ds-text-muted)]"
      }`}
    >
      <span className="shrink-0" aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {count > 0 && (
        <span className="shrink-0 rounded-full bg-[color:var(--ds-surface-2)] px-1.5 py-0.5 font-mono text-[10px] text-[color:var(--ds-text-muted)]">
          {count}
        </span>
      )}
    </button>
  );
}
