import { describe, expect, it } from "vitest";
import { extractLinks, renderTextParts } from "../links";

describe("extractLinks", () => {
  it("returns empty array when no links are present", () => {
    expect(extractLinks("just some text")).toEqual([]);
  });

  it("extracts a single link", () => {
    expect(extractLinks("see [[Foo]]")).toEqual(["Foo"]);
  });

  it("extracts multiple links in order", () => {
    expect(extractLinks("[[A]] and [[B]] and [[C]]")).toEqual(["A", "B", "C"]);
  });

  it("deduplicates repeated links", () => {
    expect(extractLinks("[[Foo]] and [[Foo]] again")).toEqual(["Foo"]);
  });

  it("trims whitespace inside brackets", () => {
    expect(extractLinks("[[ Foo Bar ]]")).toEqual(["Foo Bar"]);
  });

  it("ignores unclosed brackets", () => {
    expect(extractLinks("[[Foo")).toEqual([]);
    expect(extractLinks("Foo]]")).toEqual([]);
  });

  it("supports multi-word titles with spaces", () => {
    expect(extractLinks("[[Hello World]]")).toEqual(["Hello World"]);
  });
});

describe("renderTextParts", () => {
  it("returns a single text part for plain text", () => {
    expect(renderTextParts("hello")).toEqual([{ type: "text", value: "hello" }]);
  });

  it("returns empty array for empty input", () => {
    expect(renderTextParts("")).toEqual([]);
  });

  it("returns a single link part when input is only a link", () => {
    expect(renderTextParts("[[Foo]]")).toEqual([{ type: "link", title: "Foo" }]);
  });

  it("splits text with a link in the middle", () => {
    expect(renderTextParts("see [[Foo]] today")).toEqual([
      { type: "text", value: "see " },
      { type: "link", title: "Foo" },
      { type: "text", value: " today" },
    ]);
  });

  it("handles adjacent links", () => {
    expect(renderTextParts("[[A]][[B]]")).toEqual([
      { type: "link", title: "A" },
      { type: "link", title: "B" },
    ]);
  });

  it("treats unclosed brackets as text", () => {
    expect(renderTextParts("[[unclosed")).toEqual([
      { type: "text", value: "[[unclosed" },
    ]);
  });

  it("handles multiple links interleaved with text", () => {
    expect(renderTextParts("a [[X]] b [[Y]] c")).toEqual([
      { type: "text", value: "a " },
      { type: "link", title: "X" },
      { type: "text", value: " b " },
      { type: "link", title: "Y" },
      { type: "text", value: " c" },
    ]);
  });
});
