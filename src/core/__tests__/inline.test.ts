import { describe, expect, it } from "vitest";
import { extractLinks, parseInline, renderedToSourceOffset } from "../inline";

describe("parseInline", () => {
  it("returns single text part for plain text", () => {
    expect(parseInline("hello world")).toEqual([{ type: "text", value: "hello world" }]);
  });

  it("returns empty array for empty input", () => {
    expect(parseInline("")).toEqual([]);
  });

  it("parses a [[link]]", () => {
    expect(parseInline("[[Foo]]")).toEqual([{ type: "link", title: "Foo" }]);
  });

  it("parses **bold**", () => {
    expect(parseInline("**hello**")).toEqual([{ type: "bold", value: "hello" }]);
  });

  it("parses _italic_", () => {
    expect(parseInline("_world_")).toEqual([{ type: "italic", value: "world" }]);
  });

  it("parses #tag", () => {
    expect(parseInline("#todo")).toEqual([{ type: "tag", value: "todo" }]);
  });

  it("parses mixed content", () => {
    expect(parseInline("see **bold** and [[Link]] #tag")).toEqual([
      { type: "text", value: "see " },
      { type: "bold", value: "bold" },
      { type: "text", value: " and " },
      { type: "link", title: "Link" },
      { type: "text", value: " " },
      { type: "tag", value: "tag" },
    ]);
  });

  it("treats unclosed [[ as plain text", () => {
    expect(parseInline("[[open")).toEqual([{ type: "text", value: "[[open" }]);
  });

  it("trims whitespace inside [[link titles]]", () => {
    const parts = parseInline("[[ Foo Bar ]]");
    expect(parts).toEqual([{ type: "link", title: "Foo Bar" }]);
  });

  it("supports multi-word link title", () => {
    expect(parseInline("[[Hello World]]")).toEqual([{ type: "link", title: "Hello World" }]);
  });

  it("handles adjacent links", () => {
    expect(parseInline("[[A]][[B]]")).toEqual([
      { type: "link", title: "A" },
      { type: "link", title: "B" },
    ]);
  });

  it("handles text before and after a link", () => {
    expect(parseInline("go to [[Page]] now")).toEqual([
      { type: "text", value: "go to " },
      { type: "link", title: "Page" },
      { type: "text", value: " now" },
    ]);
  });

  it("does not match single asterisk as bold", () => {
    const parts = parseInline("*not bold*");
    expect(parts.every((p) => p.type !== "bold")).toBe(true);
  });

  it("supports hyphenated tags", () => {
    expect(parseInline("#my-tag")).toEqual([{ type: "tag", value: "my-tag" }]);
  });
});

describe("extractLinks", () => {
  it("extracts link titles in order, deduplicated", () => {
    expect(extractLinks("[[A]] and [[B]] and [[A]]")).toEqual(["A", "B"]);
  });

  it("returns empty for plain text", () => {
    expect(extractLinks("no links here")).toEqual([]);
  });

  it("ignores bold/italic/tags", () => {
    expect(extractLinks("**bold** _ital_ #tag")).toEqual([]);
  });
});

describe("renderedToSourceOffset", () => {
  it("is identity for plain text", () => {
    expect(renderedToSourceOffset("hello", 0)).toBe(0);
    expect(renderedToSourceOffset("hello", 3)).toBe(3);
    expect(renderedToSourceOffset("hello", 5)).toBe(5);
  });

  it("clamps offsets past the end to text.length", () => {
    expect(renderedToSourceOffset("hi", 99)).toBe(2);
  });

  it("skips wiki-link brackets", () => {
    // source: "[[Foo]] bar" rendered: "Foo bar"
    expect(renderedToSourceOffset("[[Foo]] bar", 0)).toBe(2); // before F, inside brackets
    expect(renderedToSourceOffset("[[Foo]] bar", 3)).toBe(7); // after Foo, skips `]]` and lands on space
    expect(renderedToSourceOffset("[[Foo]] bar", 4)).toBe(8); // on 'b'
  });

  it("skips bold markers", () => {
    // source: "**hi** world" rendered: "hi world"
    expect(renderedToSourceOffset("**hi** world", 0)).toBe(2);
    expect(renderedToSourceOffset("**hi** world", 2)).toBe(6); // past closing **
    expect(renderedToSourceOffset("**hi** world", 3)).toBe(7);
  });

  it("skips italic markers", () => {
    // source: "_hi_ x" rendered: "hi x"
    expect(renderedToSourceOffset("_hi_ x", 0)).toBe(1);
    expect(renderedToSourceOffset("_hi_ x", 2)).toBe(4); // past closing _
    expect(renderedToSourceOffset("_hi_ x", 3)).toBe(5);
  });

  it("tags are identity", () => {
    // source: "#todo" rendered: "#todo"
    expect(renderedToSourceOffset("#todo", 0)).toBe(0);
    expect(renderedToSourceOffset("#todo", 5)).toBe(5);
  });

  it("handles mixed content", () => {
    // source: "a [[B]] c" rendered: "a B c"
    expect(renderedToSourceOffset("a [[B]] c", 0)).toBe(0);
    expect(renderedToSourceOffset("a [[B]] c", 2)).toBe(4); // on B (past `[[`)
    expect(renderedToSourceOffset("a [[B]] c", 3)).toBe(7); // past `]]` onto space
    expect(renderedToSourceOffset("a [[B]] c", 4)).toBe(8); // on c
  });
});

