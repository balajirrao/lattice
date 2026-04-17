import { describe, expect, it } from "vitest";
import { extractLinks, parseInline } from "../inline";

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
