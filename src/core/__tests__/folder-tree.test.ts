import { describe, expect, it } from "vitest";
import { buildFolderTree } from "../folder-tree";

describe("buildFolderTree", () => {
  it("returns empty for empty input", () => {
    expect(buildFolderTree([])).toEqual([]);
  });

  it("flat titles produce only leaves", () => {
    expect(buildFolderTree(["a", "b"])).toEqual([
      { kind: "leaf", title: "a", name: "a" },
      { kind: "leaf", title: "b", name: "b" },
    ]);
  });

  it("nests one level under a folder", () => {
    const tree = buildFolderTree(["a/b", "a/c"]);
    expect(tree).toEqual([
      {
        kind: "folder",
        name: "a",
        path: "a",
        children: [
          { kind: "leaf", title: "a/b", name: "b" },
          { kind: "leaf", title: "a/c", name: "c" },
        ],
      },
    ]);
  });

  it("nests multiple levels", () => {
    const tree = buildFolderTree(["a/b/c"]);
    expect(tree).toEqual([
      {
        kind: "folder",
        name: "a",
        path: "a",
        children: [
          {
            kind: "folder",
            name: "b",
            path: "a/b",
            children: [{ kind: "leaf", title: "a/b/c", name: "c" }],
          },
        ],
      },
    ]);
  });

  it("folders sort before leaves at the same level", () => {
    const tree = buildFolderTree(["zeta", "a/b"]);
    expect(tree.map((n) => n.kind)).toEqual(["folder", "leaf"]);
  });

  it("leaves are sorted alphabetically (case-insensitive)", () => {
    const tree = buildFolderTree(["b", "A", "c"]);
    expect(tree).toEqual([
      { kind: "leaf", title: "A", name: "A" },
      { kind: "leaf", title: "b", name: "b" },
      { kind: "leaf", title: "c", name: "c" },
    ]);
  });

  it("a leaf and a folder with the same prefix coexist", () => {
    const tree = buildFolderTree(["a", "a/b"]);
    expect(tree).toEqual([
      {
        kind: "folder",
        name: "a",
        path: "a",
        children: [{ kind: "leaf", title: "a/b", name: "b" }],
      },
      { kind: "leaf", title: "a", name: "a" },
    ]);
  });

  it("ignores empty titles", () => {
    expect(buildFolderTree(["", "a"])).toEqual([
      { kind: "leaf", title: "a", name: "a" },
    ]);
  });

  it("preserves the full title on leaves so callers can openNote()", () => {
    const tree = buildFolderTree(["journals/20260417"]);
    const folder = tree[0];
    expect(folder.kind).toBe("folder");
    if (folder.kind !== "folder") return;
    expect(folder.children[0]).toEqual({
      kind: "leaf",
      title: "journals/20260417",
      name: "20260417",
    });
  });

  it("stripPrefix removes the prefix for tree-building but keeps full title on leaves", () => {
    const tree = buildFolderTree(["core/a", "core/b/c"], { stripPrefix: "core/" });
    expect(tree).toEqual([
      {
        kind: "folder",
        name: "b",
        path: "b",
        children: [{ kind: "leaf", title: "core/b/c", name: "c" }],
      },
      { kind: "leaf", title: "core/a", name: "a" },
    ]);
  });

  it("stripPrefix skips titles that don't match", () => {
    const tree = buildFolderTree(["core/a", "other"], { stripPrefix: "core/" });
    expect(tree).toEqual([{ kind: "leaf", title: "core/a", name: "a" }]);
  });
});
