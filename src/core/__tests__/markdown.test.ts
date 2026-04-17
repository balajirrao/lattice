import { beforeEach, describe, expect, it } from "vitest";
import { resetIdCounter } from "../block";
import { parseMarkdown, serializeMarkdown } from "../markdown";
import { flatten } from "../tree";

beforeEach(() => resetIdCounter(0));

describe("parseMarkdown", () => {
  it("returns empty array for empty input", () => {
    expect(parseMarkdown("")).toEqual([]);
  });

  it("parses a single top-level bullet", () => {
    const tree = parseMarkdown("- hello");
    expect(tree).toHaveLength(1);
    expect(tree[0].text).toBe("hello");
    expect(tree[0].state).toBeNull();
    expect(tree[0].children).toEqual([]);
  });

  it("parses 2-level nesting", () => {
    const tree = parseMarkdown(["- parent", "  - child"].join("\n"));
    expect(tree).toHaveLength(1);
    expect(tree[0].text).toBe("parent");
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].text).toBe("child");
  });

  it("parses 3-level nesting", () => {
    const md = ["- a", "  - b", "    - c"].join("\n");
    const flat = flatten(parseMarkdown(md));
    expect(flat.map((f) => f.block.text)).toEqual(["a", "b", "c"]);
    expect(flat.map((f) => f.depth)).toEqual([0, 1, 2]);
  });

  it("parses multiple siblings at the same level", () => {
    const md = ["- a", "  - a1", "  - a2", "- b"].join("\n");
    const flat = flatten(parseMarkdown(md));
    expect(flat.map((f) => f.block.text)).toEqual(["a", "a1", "a2", "b"]);
    expect(flat.map((f) => f.depth)).toEqual([0, 1, 1, 0]);
  });

  it("extracts TODO/DOING/DONE state prefixes", () => {
    const md = ["- TODO buy milk", "- DOING write code", "- DONE ship it", "- plain"].join(
      "\n",
    );
    const tree = parseMarkdown(md);
    expect(tree.map((b) => b.state)).toEqual(["TODO", "DOING", "DONE", null]);
    expect(tree.map((b) => b.text)).toEqual(["buy milk", "write code", "ship it", "plain"]);
  });

  it("ignores non-bullet lines", () => {
    const md = ["# heading", "", "- a", "some prose", "- b"].join("\n");
    const tree = parseMarkdown(md);
    expect(tree.map((b) => b.text)).toEqual(["a", "b"]);
  });

  it("preserves [[link]] text verbatim", () => {
    const tree = parseMarkdown("- see [[Other Note]] for details");
    expect(tree[0].text).toBe("see [[Other Note]] for details");
  });

  it("treats TODO-only as the state, with empty text", () => {
    const tree = parseMarkdown("- TODO ");
    expect(tree[0].state).toBe("TODO");
    expect(tree[0].text).toBe("");
  });
});

describe("serializeMarkdown", () => {
  it("returns empty string for empty tree", () => {
    expect(serializeMarkdown([])).toBe("");
  });

  it("serializes a single block with trailing newline", () => {
    const tree = parseMarkdown("- hi");
    expect(serializeMarkdown(tree)).toBe("-hi\n");
  });

  it("serializes nested structure with 2-space indent", () => {
    const tree = parseMarkdown(["- a", "  - b", "    - c"].join("\n"));
    expect(serializeMarkdown(tree)).toBe("-a\n  -b\n    -c\n");
  });

  it("serializes TODO/DOING/DONE states", () => {
    const tree = parseMarkdown(["- TODO x", "- DOING y", "- DONE z"].join("\n"));
    expect(serializeMarkdown(tree)).toBe("-TODO x\n-DOING y\n-DONE z\n");
  });
});

describe("parse/serialize roundtrip", () => {
  const fixtures: { name: string; md: string }[] = [
    { name: "empty", md: "" },
    { name: "single", md: "-hello\n" },
    { name: "nested", md: "-a\n  -b\n    -c\n" },
    {
      name: "siblings + state",
      md: "-TODO a\n  -a1\n  -a2\n-DONE b\n-DOING [[Linked]] note\n",
    },
  ];

  for (const { name, md } of fixtures) {
    it(`is idempotent for: ${name}`, () => {
      const once = serializeMarkdown(parseMarkdown(md));
      const twice = serializeMarkdown(parseMarkdown(once));
      expect(twice).toBe(once);
    });
  }

  it("is stable through a second parse/serialize cycle when input already canonical", () => {
    const tree = parseMarkdown("-a\n  -b\n");
    const md = serializeMarkdown(tree);
    expect(md).toBe("-a\n  -b\n");
    expect(serializeMarkdown(parseMarkdown(md))).toBe(md);
  });
});
