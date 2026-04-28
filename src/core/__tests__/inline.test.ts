import { describe, expect, it } from "vitest";
import {
  extractLinks,
  parseCodeBlock,
  parseInline,
  renderedToSourceOffset,
} from "../inline";

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

  it("parses $N as a blockref", () => {
    expect(parseInline("see $7 there")).toEqual([
      { type: "text", value: "see " },
      { type: "blockref", num: 7 },
      { type: "text", value: " there" },
    ]);
  });

  it("parses bare $N at start", () => {
    expect(parseInline("$42")).toEqual([{ type: "blockref", num: 42 }]);
  });

  it("does not treat $ without digits as blockref", () => {
    expect(parseInline("cost $abc")).toEqual([{ type: "text", value: "cost $abc" }]);
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

  it("parses bare http URL", () => {
    expect(parseInline("http://x.com")).toEqual([{ type: "url", value: "http://x.com" }]);
  });

  it("parses bare https URL", () => {
    expect(parseInline("https://example.com/p?q=1")).toEqual([
      { type: "url", value: "https://example.com/p?q=1" },
    ]);
  });

  it("strips trailing sentence punctuation from URL", () => {
    expect(parseInline("see https://x.com.")).toEqual([
      { type: "text", value: "see " },
      { type: "url", value: "https://x.com" },
      { type: "text", value: "." },
    ]);
  });

  it("does not match non-http scheme as URL", () => {
    const parts = parseInline("ftp://x.com");
    expect(parts.every((p) => p.type !== "url")).toBe(true);
  });

  it("parses `inline code`", () => {
    expect(parseInline("`npm test`")).toEqual([{ type: "code", value: "npm test" }]);
  });

  it("parses inline code between other text", () => {
    expect(parseInline("run `npm test` to verify")).toEqual([
      { type: "text", value: "run " },
      { type: "code", value: "npm test" },
      { type: "text", value: " to verify" },
    ]);
  });

  it("inline code suppresses other inline markers", () => {
    // **bold** inside a code span stays literal.
    expect(parseInline("`**not bold**`")).toEqual([
      { type: "code", value: "**not bold**" },
    ]);
  });

  it("treats unclosed single backtick as plain text", () => {
    expect(parseInline("a `unclosed")).toEqual([
      { type: "text", value: "a `unclosed" },
    ]);
  });

  it("handles adjacent inline code spans", () => {
    expect(parseInline("`a``b`")).toEqual([
      { type: "code", value: "a" },
      { type: "code", value: "b" },
    ]);
  });
});

describe("parseCodeBlock", () => {
  it("returns null for plain text", () => {
    expect(parseCodeBlock("hello")).toBeNull();
  });

  it("returns null without a closing fence", () => {
    expect(parseCodeBlock("```js\nconst x = 1;")).toBeNull();
  });

  it("parses a multi-line fenced block with language", () => {
    expect(parseCodeBlock("```js\nconst x = 1;\nconsole.log(x);\n```")).toEqual({
      lang: "js",
      code: "const x = 1;\nconsole.log(x);",
    });
  });

  it("parses a fenced block without language", () => {
    expect(parseCodeBlock("```\nraw\n```")).toEqual({ lang: "", code: "raw" });
  });

  it("parses a single-line fenced block", () => {
    expect(parseCodeBlock("```js\n1+1\n```")).toEqual({ lang: "js", code: "1+1" });
  });

  it("does not match inline backticks without newline after opener", () => {
    // Inline `code` on a single line isn't a fenced block.
    expect(parseCodeBlock("`hi`")).toBeNull();
  });

  it("preserves indentation inside the code body", () => {
    const src = "```py\ndef f():\n    return 1\n```";
    expect(parseCodeBlock(src)).toEqual({
      lang: "py",
      code: "def f():\n    return 1",
    });
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

  it("skips inline-code backticks", () => {
    // source: "`hi` x" rendered: "hi x"
    expect(renderedToSourceOffset("`hi` x", 0)).toBe(1); // on h (past opening `)
    expect(renderedToSourceOffset("`hi` x", 2)).toBe(4); // past closing ` onto space
    expect(renderedToSourceOffset("`hi` x", 3)).toBe(5); // on x
  });
});

