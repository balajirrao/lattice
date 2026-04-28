import {
  type Block,
  type TodoState,
  STATE_FAMILIES,
  currentTimestamp,
  genId,
} from "./block";

export type Location = {
  parent: Block | null;
  list: Block[];
  index: number;
};

export function clone(blocks: Block[]): Block[] {
  return blocks.map((b) => ({
    ...b,
    properties: { ...b.properties },
    children: clone(b.children),
  }));
}

export function locate(blocks: Block[], id: string): Location | null {
  const go = (list: Block[], parent: Block | null): Location | null => {
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === id) return { parent, list, index: i };
      const r = go(list[i].children, list[i]);
      if (r) return r;
    }
    return null;
  };
  return go(blocks, null);
}

/** Returns the chain of ancestor block IDs for `id`, root-first.
 *  Empty if the block is at the root or not found. */
export function ancestorIdsOf(blocks: Block[], id: string): string[] {
  let found: string[] | null = null;
  const go = (list: Block[], chain: string[]) => {
    for (const b of list) {
      if (b.id === id) { found = chain; return; }
      go(b.children, [...chain, b.id]);
      if (found) return;
    }
  };
  go(blocks, []);
  return found ?? [];
}

/** Walk the tree, returning every block that has a `properties.id` set. */
export function statedBlocks(blocks: Block[]): Block[] {
  const out: Block[] = [];
  const walk = (list: Block[]) => {
    for (const b of list) {
      if (b.properties.id) out.push(b);
      walk(b.children);
    }
  };
  walk(blocks);
  return out;
}

/** Find a block by its persistent ref id (`properties.id` as integer). */
export function findByRefId(blocks: Block[], num: number): Block | null {
  let found: Block | null = null;
  const walk = (list: Block[]) => {
    for (const b of list) {
      if (parseInt(b.properties.id ?? "", 10) === num) { found = b; return; }
      walk(b.children);
      if (found) return;
    }
  };
  walk(blocks);
  return found;
}

/**
 * Compute the next available block ref id (per-note sequential integer).
 * Walks the tree, finds the max numeric `properties.id`, returns max + 1.
 * Non-numeric ids (legacy random-string ids) are ignored.
 */
export function nextBlockId(blocks: Block[]): number {
  let max = 0;
  const walk = (list: Block[]) => {
    for (const b of list) {
      const n = parseInt(b.properties.id ?? "", 10);
      if (Number.isFinite(n) && n > max) max = n;
      walk(b.children);
    }
  };
  walk(blocks);
  return max + 1;
}

export type FlatEntry = { block: Block; depth: number };

export function flatten(blocks: Block[]): FlatEntry[] {
  const out: FlatEntry[] = [];
  const walk = (list: Block[], depth: number) => {
    for (const b of list) {
      out.push({ block: b, depth });
      walk(b.children, depth + 1);
    }
  };
  walk(blocks, 0);
  return out;
}

export function updateText(blocks: Block[], id: string, text: string): Block[] {
  const copy = clone(blocks);
  const loc = locate(copy, id);
  if (loc) loc.list[loc.index].text = text;
  return copy;
}

/**
 * Set block state. Auto-records `@started` on first entry into DOING
 * and `@done` on first entry into DONE / ANSWERED.
 */
export function setState(
  blocks: Block[],
  id: string,
  state: TodoState,
): Block[] {
  const copy = clone(blocks);
  const loc = locate(copy, id);
  if (!loc) return copy;
  const blk = loc.list[loc.index];
  blk.state = state;
  if (state !== null && !blk.properties.id) {
    blk.properties.id = String(nextBlockId(copy));
  }
  if (state === "DOING" && !blk.properties.started) {
    blk.properties.started = currentTimestamp();
  }
  if ((state === "DONE" || state === "ANSWERED") && !blk.properties.done) {
    blk.properties.done = currentTimestamp();
  }
  return copy;
}

export function setProperty(
  blocks: Block[],
  id: string,
  key: string,
  value: string | null,
): Block[] {
  const copy = clone(blocks);
  const loc = locate(copy, id);
  if (!loc) return copy;
  const blk = loc.list[loc.index];
  if (value === null) delete blk.properties[key];
  else blk.properties[key] = value;
  return copy;
}

/** Cycle within the block's current state family (⌘Enter). */
export function cycleState(state: TodoState): TodoState {
  if (state === null) return "TODO";
  for (const fam of STATE_FAMILIES) {
    const idx = fam.indexOf(state);
    if (idx >= 0) return idx + 1 < fam.length ? fam[idx + 1] : null;
  }
  return null;
}

/** Switch to the next state family (⌥Enter). */
export function cycleFamily(state: TodoState): TodoState {
  if (state === null) return STATE_FAMILIES[0][0];
  for (let i = 0; i < STATE_FAMILIES.length; i++) {
    if (STATE_FAMILIES[i].includes(state)) {
      return i + 1 < STATE_FAMILIES.length ? STATE_FAMILIES[i + 1][0] : null;
    }
  }
  return null;
}

/**
 * Insert a new block after the target.
 * If the target has children, the new block becomes the first child —
 * unless `asSibling` is set, in which case it is always inserted as the
 * next sibling (used when the target is visually collapsed in the UI).
 * If `afterId` is null, append at root level.
 */
export function insertAfter(
  blocks: Block[],
  afterId: string | null,
  newBlock: Block,
  opts: { asSibling?: boolean } = {},
): { tree: Block[]; id: string } {
  const copy = clone(blocks);
  if (afterId === null) {
    copy.push(newBlock);
    return { tree: copy, id: newBlock.id };
  }
  const loc = locate(copy, afterId);
  if (!loc) {
    copy.push(newBlock);
    return { tree: copy, id: newBlock.id };
  }
  const target = loc.list[loc.index];
  if (!opts.asSibling && target.children.length > 0) {
    target.children.unshift(newBlock);
  } else {
    loc.list.splice(loc.index + 1, 0, newBlock);
  }
  return { tree: copy, id: newBlock.id };
}

export function indent(
  blocks: Block[],
  id: string,
): { tree: Block[]; id: string; parentId: string } | null {
  const copy = clone(blocks);
  const loc = locate(copy, id);
  if (!loc || loc.index === 0) return null;
  const prev = loc.list[loc.index - 1];
  const [moved] = loc.list.splice(loc.index, 1);
  prev.children.push(moved);
  return { tree: copy, id, parentId: prev.id };
}

export function outdent(blocks: Block[], id: string): { tree: Block[]; id: string } | null {
  const copy = clone(blocks);
  const loc = locate(copy, id);
  if (!loc || loc.parent === null) return null;
  const parentLoc = locate(copy, loc.parent.id);
  if (!parentLoc) return null;
  const [moved] = loc.list.splice(loc.index, 1);
  parentLoc.list.splice(parentLoc.index + 1, 0, moved);
  return { tree: copy, id };
}

/** Swap a block with its previous sibling. Returns null if already first. */
export function moveUp(blocks: Block[], id: string): { tree: Block[]; id: string } | null {
  const copy = clone(blocks);
  const loc = locate(copy, id);
  if (!loc || loc.index === 0) return null;
  const i = loc.index;
  [loc.list[i - 1], loc.list[i]] = [loc.list[i], loc.list[i - 1]];
  return { tree: copy, id };
}

/** Swap a block with its next sibling. Returns null if already last. */
export function moveDown(blocks: Block[], id: string): { tree: Block[]; id: string } | null {
  const copy = clone(blocks);
  const loc = locate(copy, id);
  if (!loc || loc.index >= loc.list.length - 1) return null;
  const i = loc.index;
  [loc.list[i], loc.list[i + 1]] = [loc.list[i + 1], loc.list[i]];
  return { tree: copy, id };
}

/**
 * Deep clone blocks with freshly generated IDs. Used for paste so that
 * pasting the same clipboard content repeatedly (or into the same note)
 * never produces duplicate IDs.
 */
export function regenerateIds(blocks: Block[]): Block[] {
  return blocks.map((b) => ({
    ...b,
    id: genId(),
    properties: { ...b.properties },
    children: regenerateIds(b.children),
  }));
}

/**
 * Renumber `properties.id` on `pasted` so it never collides with existing
 * ids in `dest`. Also rewrites any `$N` blockrefs inside pasted block text
 * to point to the new ids, so internal links inside the pasted subtree
 * keep working.
 */
export function renumberPastedRefs(
  dest: Block[],
  pasted: Block[],
): Block[] {
  const used = new Set<number>();
  const collectExisting = (list: Block[]) => {
    for (const b of list) {
      const n = parseInt(b.properties.id ?? "", 10);
      if (Number.isFinite(n)) used.add(n);
      collectExisting(b.children);
    }
  };
  collectExisting(dest);

  const remap = new Map<number, number>();
  let next = 1;
  const allocId = (): number => {
    while (used.has(next)) next += 1;
    used.add(next);
    return next;
  };
  const planRemap = (list: Block[]) => {
    for (const b of list) {
      const cur = parseInt(b.properties.id ?? "", 10);
      if (Number.isFinite(cur) && used.has(cur) && !remap.has(cur)) {
        remap.set(cur, allocId());
      } else if (Number.isFinite(cur)) {
        used.add(cur);
      }
      planRemap(b.children);
    }
  };
  planRemap(pasted);

  const rewriteText = (text: string): string =>
    text.replace(/\$(\d+)/g, (m, d) => {
      const n = parseInt(d, 10);
      const r = remap.get(n);
      return r == null ? m : `$${r}`;
    });

  const apply = (list: Block[]): Block[] =>
    list.map((b) => {
      const cur = parseInt(b.properties.id ?? "", 10);
      const newId = remap.get(cur);
      const props = { ...b.properties };
      if (newId != null) props.id = String(newId);
      return {
        ...b,
        text: rewriteText(b.text),
        properties: props,
        children: apply(b.children),
      };
    });

  return apply(pasted);
}

/**
 * Given a selection (set of block IDs), return the subtrees rooted at the
 * outermost selected blocks in document order. A selected descendant of a
 * selected ancestor is skipped — it is already part of the ancestor's
 * subtree.
 */
export function selectionRoots(
  blocks: Block[],
  selected: Set<string>,
): Block[] {
  const out: Block[] = [];
  const walk = (list: Block[]) => {
    for (const b of list) {
      if (selected.has(b.id)) out.push(b);
      else walk(b.children);
    }
  };
  walk(blocks);
  return out;
}

/**
 * Splice a list of blocks into the tree relative to `afterId`.
 * - If `afterId` is null / not found: append at root.
 * - If the target block is empty (no text, no state, no children):
 *   replace it with the inserted blocks.
 * - Otherwise: insert as the next siblings of the target.
 */
export function insertBlocksAfter(
  blocks: Block[],
  afterId: string | null,
  inserted: Block[],
): { tree: Block[]; lastId: string | null } {
  if (inserted.length === 0) return { tree: clone(blocks), lastId: null };
  const copy = clone(blocks);
  const lastId = inserted[inserted.length - 1].id;
  if (afterId === null) {
    copy.push(...inserted);
    return { tree: copy, lastId };
  }
  const loc = locate(copy, afterId);
  if (!loc) {
    copy.push(...inserted);
    return { tree: copy, lastId };
  }
  const target = loc.list[loc.index];
  const isEmpty =
    target.text === "" && target.state === null && target.children.length === 0;
  if (isEmpty) loc.list.splice(loc.index, 1, ...inserted);
  else loc.list.splice(loc.index + 1, 0, ...inserted);
  return { tree: copy, lastId };
}

/**
 * Remove every block whose id is in `ids`, along with its entire subtree.
 * Returns the id of the block visually preceding the earliest removal
 * (for focus restoration), or null if nothing was removed or the first
 * removal was the very first block.
 */
export function removeBlocks(
  blocks: Block[],
  ids: Set<string>,
): { tree: Block[]; prevId: string | null } {
  if (ids.size === 0) return { tree: clone(blocks), prevId: null };
  const flat = flatten(blocks);
  const firstIdx = flat.findIndex((f) => ids.has(f.block.id));
  const prevId = firstIdx > 0 ? flat[firstIdx - 1].block.id : null;
  const prune = (list: Block[]): Block[] =>
    list
      .filter((b) => !ids.has(b.id))
      .map((b) => ({
        ...b,
        properties: { ...b.properties },
        children: prune(b.children),
      }));
  return { tree: prune(blocks), prevId };
}

export function removeBlock(
  blocks: Block[],
  id: string,
): { tree: Block[]; prevId: string | null } {
  const flat = flatten(blocks);
  const idx = flat.findIndex((f) => f.block.id === id);
  const prevId = idx > 0 ? flat[idx - 1].block.id : null;
  const copy = clone(blocks);
  const loc = locate(copy, id);
  if (loc) loc.list.splice(loc.index, 1);
  return { tree: copy, prevId };
}

export type DropPosition = "before" | "after" | "child";

/**
 * Move the subtrees rooted at `ids` (treated as a selection) to a new
 * location relative to `target`. Returns null if the target is itself one
 * of the moved blocks or a descendant of one (which would orphan the tree).
 *
 * - `before` / `after`: insert as siblings of target.
 * - `child`: insert as the first children of target.
 *
 * Block ids are preserved (this is a move, not a copy), so external refs
 * keep working.
 */
export function moveBlocks(
  blocks: Block[],
  ids: Set<string>,
  target: { id: string; position: DropPosition },
): { tree: Block[]; movedIds: string[] } | null {
  if (ids.size === 0) return null;
  const roots = selectionRoots(blocks, ids);
  if (roots.length === 0) return null;
  const movedIds = roots.map((r) => r.id);
  const inSubtree = (start: Block[], id: string): boolean => {
    for (const b of start) {
      if (b.id === id) return true;
      if (inSubtree(b.children, id)) return true;
    }
    return false;
  };
  if (inSubtree(roots, target.id)) return null;

  const cloned = clone(roots);
  const { tree: pruned } = removeBlocks(blocks, ids);
  const loc = locate(pruned, target.id);
  if (!loc) return null;
  if (target.position === "before") {
    loc.list.splice(loc.index, 0, ...cloned);
  } else if (target.position === "after") {
    loc.list.splice(loc.index + 1, 0, ...cloned);
  } else {
    loc.list[loc.index].children.unshift(...cloned);
  }
  return { tree: pruned, movedIds };
}
