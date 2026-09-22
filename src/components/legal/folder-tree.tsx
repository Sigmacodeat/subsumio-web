"use client";

import { useState } from "react";
import { ChevronRight, Folder, FolderOpen, FolderTree as FolderTreeIcon } from "lucide-react";
import type { FolderNode } from "@/lib/folder-tree";

interface FolderTreeProps {
  nodes: FolderNode[];
  selected: string;
  onSelect: (path: string) => void;
  labels: {
    all: string;
    unfiled: string;
    heading: string;
  };
  /** Anzahl Dokumente ohne Ordner */
  unfiledCount: number;
  totalCount: number;
}

export function FolderTree({
  nodes,
  selected,
  onSelect,
  labels,
  unfiledCount,
  totalCount,
}: FolderTreeProps) {
  return (
    <nav aria-label={labels.heading} className="space-y-0.5">
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
      />
      {nodes.map((n) => (
        <TreeNode key={n.path} node={n} depth={0} selected={selected} onSelect={onSelect} />
      ))}
    </nav>
  );
}

function TreeNode({
  node,
  depth,
  selected,
  onSelect,
}: {
  node: FolderNode;
  depth: number;
  selected: string;
  onSelect: (path: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const active = selected === node.path;
  const hasChildren = node.children.length > 0;

  return (
    <div role="treeitem" aria-expanded={hasChildren ? open : undefined} aria-selected={active}>
      <div className="flex items-center" style={{ paddingLeft: depth * 14 }}>
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
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
        />
      </div>
      {open &&
        node.children.map((c) => (
          <TreeNode
            key={c.path}
            node={c}
            depth={depth + 1}
            selected={selected}
            onSelect={onSelect}
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
}: {
  depth: number;
  icon: React.ReactNode;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex items-center" style={{ paddingLeft: depth * 14 }}>
      <span className="w-5 shrink-0" aria-hidden="true" />
      <TreeRowButton icon={icon} label={label} count={count} active={active} onClick={onClick} />
    </div>
  );
}

function TreeRowButton({
  icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-xs transition-colors hover:bg-[color:var(--ds-hover)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none ${
        active
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
