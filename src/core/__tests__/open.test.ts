import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetIdCounter, setNowProvider } from "../block";
import { parseMarkdown } from "../markdown";
import { collectOpenItems } from "../open";

beforeEach(() => {
  resetIdCounter(0);
  setNowProvider(() => "2026-04-17T09:00");
});
afterEach(() => setNowProvider(null));

describe("collectOpenItems", () => {
  it("returns non-terminal blocks, ignoring DONE and ANSWERED", () => {
    const tree = parseMarkdown([
      "-TODO write tests",
      "-DONE ship it",
      "-QUESTION caching?",
      "-ANSWERED resolved",
      "-IDEA try caching",
      "-WAITING for review",
      "-DOING refactor",
      "-just a note",
    ].join("\n") + "\n");

    const items = collectOpenItems("project", tree);
    expect(items.map((i) => i.state)).toEqual([
      "TODO", "QUESTION", "IDEA", "WAITING", "DOING",
    ]);
    expect(items.every((i) => i.noteTitle === "project")).toBe(true);
  });

  it("walks nested children and preserves document order", () => {
    const tree = parseMarkdown([
      "-Project X",
      "  -TODO outer",
      "  -notes",
      "    -DOING inner",
      "-TODO sibling",
    ].join("\n") + "\n");

    const items = collectOpenItems("p", tree);
    expect(items.map((i) => i.text)).toEqual(["outer", "inner", "sibling"]);
  });

  it("records the ancestor path (root → immediate parent)", () => {
    const tree = parseMarkdown([
      "-Dailies",
      "  -Mon",
      "    -TODO call Alice",
      "  -Tue",
      "-TODO orphan",
    ].join("\n") + "\n");

    const items = collectOpenItems("w", tree);
    expect(items[0].text).toBe("call Alice");
    expect(items[0].path).toEqual(["Dailies", "Mon"]);
    expect(items[1].text).toBe("orphan");
    expect(items[1].path).toEqual([]);
  });

  it("carries @created through as the age anchor", () => {
    const tree = parseMarkdown(
      "-TODO old @created(2026-03-01T08:00)\n" +
      "-TODO new\n"
    );
    const items = collectOpenItems("p", tree);
    expect(items[0].created).toBe("2026-03-01T08:00");
    expect(items[1].created).toBe(null);
  });

  it("skips items marked @carried", () => {
    const tree = parseMarkdown([
      "-TODO still open",
      "-TODO carried over @carried(1)",
      "-QUESTION hidden @carried(1)",
    ].join("\n") + "\n");
    const items = collectOpenItems("p", tree);
    expect(items.map((i) => i.text)).toEqual(["still open"]);
  });

  it("returns an empty list when nothing is open", () => {
    const tree = parseMarkdown([
      "-DONE a",
      "-ANSWERED b",
      "-just a note",
      "  -DONE nested",
    ].join("\n") + "\n");
    expect(collectOpenItems("p", tree)).toEqual([]);
  });
});
