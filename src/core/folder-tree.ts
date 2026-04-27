/**
 * Build a hierarchical tree from a flat list of slash-separated note
 * titles, so the sidebar can render `a/b` as a folder `a` containing a
 * leaf `b` rather than as the literal string "a/b".
 *
 * Pure: no DOM/React deps. Order is folders first (alpha), then leaves
 * (alpha), matching how most file explorers render.
 *
 * Edge cases:
 * - Empty titles are dropped.
 * - A title that is exactly the prefix of a folder (e.g. both `"a"` and
 *   `"a/b"` exist) — `"a"` is shown as a leaf alongside the folder.
 *   Folders are keyed on path so the two coexist without collision.
 */

export type FolderTreeNode =
  | { kind: "folder"; name: string; path: string; children: FolderTreeNode[] }
  | { kind: "leaf"; title: string; name: string };

interface FolderBuilder {
  // map of segment → folder builder (folders only)
  folders: Map<string, FolderBuilder & { name: string; path: string }>;
  // leaves at this level
  leaves: { title: string; name: string }[];
}

function emptyBuilder(): FolderBuilder {
  return { folders: new Map(), leaves: [] };
}

function insert(root: FolderBuilder, title: string, displayPath: string): void {
  const segs = displayPath.split("/").filter((s) => s.length > 0);
  if (segs.length === 0) return;
  let node = root;
  let pathSoFar = "";
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i];
    pathSoFar = pathSoFar ? `${pathSoFar}/${seg}` : seg;
    let child = node.folders.get(seg);
    if (!child) {
      child = { ...emptyBuilder(), name: seg, path: pathSoFar };
      node.folders.set(seg, child);
    }
    node = child;
  }
  const leafName = segs[segs.length - 1];
  node.leaves.push({ title, name: leafName });
}

function finalize(node: FolderBuilder): FolderTreeNode[] {
  const folders: FolderTreeNode[] = [];
  // Sort folder names alphabetically, case-insensitive for stability.
  const names = [...node.folders.keys()].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
  for (const n of names) {
    const f = node.folders.get(n)!;
    folders.push({
      kind: "folder",
      name: f.name,
      path: f.path,
      children: finalize(f),
    });
  }
  const leaves: FolderTreeNode[] = [...node.leaves]
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    )
    .map((l) => ({ kind: "leaf", title: l.title, name: l.name }));
  return [...folders, ...leaves];
}

/**
 * If `stripPrefix` is given, that prefix is stripped from each title
 * for the purposes of building the tree, but the leaf `title` field
 * keeps the full original title (so callers like `openNote(title)` are
 * unaffected). Titles that don't start with the prefix are skipped —
 * callers should filter their inputs first.
 */
export function buildFolderTree(
  titles: string[],
  opts?: { stripPrefix?: string },
): FolderTreeNode[] {
  const prefix = opts?.stripPrefix ?? "";
  const root = emptyBuilder();
  for (const t of titles) {
    if (prefix && !t.startsWith(prefix)) continue;
    const display = prefix ? t.slice(prefix.length) : t;
    insert(root, t, display);
  }
  return finalize(root);
}
