import {
  type Block,
  type TodoState,
  STATE_FAMILIES,
  currentTimestamp,
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

export function indent(blocks: Block[], id: string): { tree: Block[]; id: string } | null {
  const copy = clone(blocks);
  const loc = locate(copy, id);
  if (!loc || loc.index === 0) return null;
  const prev = loc.list[loc.index - 1];
  const [moved] = loc.list.splice(loc.index, 1);
  prev.children.push(moved);
  return { tree: copy, id };
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
