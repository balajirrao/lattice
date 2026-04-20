import { beforeEach, describe, expect, it } from "vitest";
import { type Block, newBlock, resetIdCounter } from "../block";
import {
  clone,
  flatten,
  indent,
  insertAfter,
  insertBlocksAfter,
  locate,
  moveDown,
  moveUp,
  outdent,
  regenerateIds,
  removeBlock,
  selectionRoots,
  setState,
  updateText,
} from "../tree";

beforeEach(() => resetIdCounter(0));

/** Build the tree:
 *  - a
 *    - a1
 *      - a1a
 *    - a2
 *  - b
 */
function sample() {
  const a1a = newBlock("a1a");
  const a1 = { ...newBlock("a1"), children: [a1a] };
  const a2 = newBlock("a2");
  const a = { ...newBlock("a"), children: [a1, a2] };
  const b = newBlock("b");
  return [a, b];
}

describe("locate", () => {
  it("finds a nested block and reports parent + index", () => {
    const tree = sample();
    const a2 = tree[0].children[1];
    const loc = locate(tree, a2.id)!;
    expect(loc.parent).toBe(tree[0]);
    expect(loc.index).toBe(1);
  });

  it("returns null for unknown id", () => {
    expect(locate(sample(), "does-not-exist")).toBeNull();
  });

  it("finds root block with null parent", () => {
    const tree = sample();
    const rootA = tree[0];
    const loc = locate(tree, rootA.id)!;
    expect(loc.parent).toBeNull();
    expect(loc.index).toBe(0);
    expect(loc.list).toBe(tree);
  });

  it("finds deeply nested block", () => {
    const tree = sample();
    const a1a = tree[0].children[0].children[0];
    const loc = locate(tree, a1a.id)!;
    expect(loc.parent).toBe(tree[0].children[0]);
    expect(loc.index).toBe(0);
  });
});

describe("flatten", () => {
  it("returns DFS order with correct depths", () => {
    const tree = sample();
    const flat = flatten(tree);
    expect(flat.map((f) => f.block.text)).toEqual(["a", "a1", "a1a", "a2", "b"]);
    expect(flat.map((f) => f.depth)).toEqual([0, 1, 2, 1, 0]);
  });

  it("returns empty array for empty tree", () => {
    expect(flatten([])).toEqual([]);
  });
});

describe("clone", () => {
  it("produces a deep copy", () => {
    const tree = sample();
    const copy = clone(tree);
    expect(copy).toEqual(tree);
    expect(copy).not.toBe(tree);
    expect(copy[0]).not.toBe(tree[0]);
    expect(copy[0].children[0]).not.toBe(tree[0].children[0]);
  });
});

describe("updateText", () => {
  it("updates the target block's text", () => {
    const tree = sample();
    const a1 = tree[0].children[0];
    const next = updateText(tree, a1.id, "updated");
    expect(locate(next, a1.id)!.list[0].text).toBe("updated");
  });

  it("does not mutate the input tree", () => {
    const tree = sample();
    const a1 = tree[0].children[0];
    const originalText = a1.text;
    updateText(tree, a1.id, "different");
    expect(a1.text).toBe(originalText);
  });

  it("is a no-op when id is missing", () => {
    const tree = sample();
    const next = updateText(tree, "missing", "x");
    expect(flatten(next).map((f) => f.block.text)).toEqual(
      flatten(tree).map((f) => f.block.text),
    );
  });
});

describe("setState", () => {
  it("sets the TODO state on the target", () => {
    const tree = sample();
    const b = tree[1];
    const next = setState(tree, b.id, "TODO");
    expect(locate(next, b.id)!.list[1].state).toBe("TODO");
  });

  it("does not affect other blocks", () => {
    const tree = sample();
    const next = setState(tree, tree[0].id, "DOING");
    expect(locate(next, tree[1].id)!.list[1].state).toBeNull();
  });
});

describe("insertAfter", () => {
  it("inserts as next sibling when target has no children", () => {
    const tree = sample();
    const b = tree[1];
    const nb = newBlock("c");
    const { tree: next, id } = insertAfter(tree, b.id, nb);
    expect(id).toBe(nb.id);
    expect(flatten(next).map((f) => f.block.text)).toEqual([
      "a",
      "a1",
      "a1a",
      "a2",
      "b",
      "c",
    ]);
  });

  it("inserts as first child when target has children", () => {
    const tree = sample();
    const a = tree[0];
    const nb = newBlock("a0");
    const { tree: next } = insertAfter(tree, a.id, nb);
    expect(flatten(next).map((f) => f.block.text)).toEqual([
      "a",
      "a0",
      "a1",
      "a1a",
      "a2",
      "b",
    ]);
  });

  it("appends to root when afterId is null", () => {
    const tree = sample();
    const nb = newBlock("end");
    const { tree: next } = insertAfter(tree, null, nb);
    const flat = flatten(next);
    expect(flat[flat.length - 1].block.text).toBe("end");
    expect(flat[flat.length - 1].depth).toBe(0);
  });
});

describe("indent", () => {
  it("nests block under previous sibling", () => {
    const tree = sample();
    const b = tree[1];
    const result = indent(tree, b.id);
    expect(result).not.toBeNull();
    const flat = flatten(result!.tree);
    expect(flat.map((f) => f.block.text)).toEqual(["a", "a1", "a1a", "a2", "b"]);
    expect(flat.map((f) => f.depth)).toEqual([0, 1, 2, 1, 1]);
  });

  it("returns null when block is the first sibling", () => {
    const tree = sample();
    expect(indent(tree, tree[0].id)).toBeNull();
  });

  it("returns null when block is the first child of its parent", () => {
    const tree = sample();
    const a1 = tree[0].children[0];
    expect(indent(tree, a1.id)).toBeNull();
  });
});

describe("outdent", () => {
  it("moves block up one level, inserted after its former parent", () => {
    const tree = sample();
    const a2 = tree[0].children[1];
    const result = outdent(tree, a2.id);
    expect(result).not.toBeNull();
    const flat = flatten(result!.tree);
    expect(flat.map((f) => f.block.text)).toEqual(["a", "a1", "a1a", "a2", "b"]);
    expect(flat.map((f) => f.depth)).toEqual([0, 1, 2, 0, 0]);
  });

  it("returns null for blocks at root level", () => {
    const tree = sample();
    expect(outdent(tree, tree[0].id)).toBeNull();
  });
});

describe("moveUp", () => {
  it("swaps a block with its previous sibling", () => {
    const tree = sample();
    const a2 = tree[0].children[1];
    const r = moveUp(tree, a2.id)!;
    expect(r).not.toBeNull();
    const flat = flatten(r.tree);
    expect(flat.map((f) => f.block.text)).toEqual(["a", "a2", "a1", "a1a", "b"]);
  });

  it("returns null when block is already first among siblings", () => {
    const tree = sample();
    expect(moveUp(tree, tree[0].id)).toBeNull();
    expect(moveUp(tree, tree[0].children[0].id)).toBeNull();
  });

  it("works at root level", () => {
    const tree = sample();
    const r = moveUp(tree, tree[1].id)!;
    expect(r.tree.map((b) => b.text)).toEqual(["b", "a"]);
  });
});

describe("moveDown", () => {
  it("swaps a block with its next sibling", () => {
    const tree = sample();
    const a1 = tree[0].children[0];
    const r = moveDown(tree, a1.id)!;
    const flat = flatten(r.tree);
    expect(flat.map((f) => f.block.text)).toEqual(["a", "a2", "a1", "a1a", "b"]);
  });

  it("returns null when block is already last among siblings", () => {
    const tree = sample();
    expect(moveDown(tree, tree[1].id)).toBeNull();
    expect(moveDown(tree, tree[0].children[1].id)).toBeNull();
  });
});

describe("removeBlock", () => {
  it("removes the block and all descendants", () => {
    const tree = sample();
    const a1 = tree[0].children[0];
    const { tree: next } = removeBlock(tree, a1.id);
    expect(flatten(next).map((f) => f.block.text)).toEqual(["a", "a2", "b"]);
  });

  it("returns the previous block's id for focus restoration", () => {
    const tree = sample();
    const a1 = tree[0].children[0]; // flatten index 1; prev is 'a'
    const { prevId } = removeBlock(tree, a1.id);
    expect(prevId).toBe(tree[0].id);
  });

  it("returns null prevId when first block is removed", () => {
    const tree = sample();
    const { prevId } = removeBlock(tree, tree[0].id);
    expect(prevId).toBeNull();
  });

  it("leaves tree unchanged when id is missing", () => {
    const tree = sample();
    const { tree: next } = removeBlock(tree, "missing");
    expect(flatten(next).map((f) => f.block.text)).toEqual(
      flatten(tree).map((f) => f.block.text),
    );
  });
});

describe("regenerateIds", () => {
  it("gives every block in the subtree a fresh id", () => {
    const tree = sample();
    const originalIds = flatten(tree).map((f) => f.block.id);
    const next = regenerateIds(tree);
    const newIds = flatten(next).map((f) => f.block.id);
    expect(newIds).toHaveLength(originalIds.length);
    for (const id of newIds) expect(originalIds).not.toContain(id);
  });

  it("preserves text, state, properties, and structure", () => {
    const tree = sample();
    const next = regenerateIds(tree);
    const shape = (list: Block[]): unknown =>
      list.map((b) => ({ text: b.text, children: shape(b.children) }));
    expect(shape(next)).toEqual(shape(tree));
  });
});

describe("selectionRoots", () => {
  it("returns only outermost selected blocks in document order", () => {
    const tree = sample();
    const a = tree[0];
    const a1 = a.children[0];
    const a1a = a1.children[0];
    const b = tree[1];
    // Select a, a1a, b → a1a is inside a's subtree so it drops out.
    const roots = selectionRoots(tree, new Set([a.id, a1a.id, b.id]));
    expect(roots.map((r) => r.text)).toEqual(["a", "b"]);
  });

  it("returns non-adjacent selected siblings in document order", () => {
    const tree = sample();
    const a1 = tree[0].children[0];
    const a2 = tree[0].children[1];
    const roots = selectionRoots(tree, new Set([a2.id, a1.id]));
    expect(roots.map((r) => r.text)).toEqual(["a1", "a2"]);
  });

  it("returns [] for empty selection", () => {
    expect(selectionRoots(sample(), new Set())).toEqual([]);
  });
});

describe("insertBlocksAfter", () => {
  it("replaces target block when it is empty", () => {
    const empty = newBlock("");
    const tree = [empty];
    const fresh = [newBlock("x"), newBlock("y")];
    const { tree: next, lastId } = insertBlocksAfter(tree, empty.id, fresh);
    expect(next.map((b) => b.text)).toEqual(["x", "y"]);
    expect(lastId).toBe(fresh[1].id);
  });

  it("inserts after target as siblings when target has content", () => {
    const tree = sample();
    const a = tree[0];
    const fresh = [newBlock("new1"), newBlock("new2")];
    const { tree: next } = insertBlocksAfter(tree, a.id, fresh);
    expect(next.map((b) => b.text)).toEqual(["a", "new1", "new2", "b"]);
  });

  it("appends at root when afterId is null", () => {
    const tree = sample();
    const fresh = [newBlock("z")];
    const { tree: next } = insertBlocksAfter(tree, null, fresh);
    expect(next.map((b) => b.text)).toEqual(["a", "b", "z"]);
  });

  it("appends at root when afterId is not found", () => {
    const tree = sample();
    const fresh = [newBlock("z")];
    const { tree: next } = insertBlocksAfter(tree, "missing", fresh);
    expect(next.map((b) => b.text)).toEqual(["a", "b", "z"]);
  });

  it("is a no-op when inserted list is empty", () => {
    const tree = sample();
    const { tree: next, lastId } = insertBlocksAfter(tree, tree[0].id, []);
    expect(next.map((b) => b.text)).toEqual(["a", "b"]);
    expect(lastId).toBeNull();
  });
});
