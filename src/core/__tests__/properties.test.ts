import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type TodoState,
  newBlock,
  resetIdCounter,
  setNowProvider,
} from "../block";
import {
  extractProperties,
  parseMarkdown,
  serializeMarkdown,
  serializeProperties,
} from "../markdown";
import { cycleFamily, cycleState, setState } from "../tree";

beforeEach(() => {
  resetIdCounter(0);
  setNowProvider(() => "2026-04-17T09:00");
});
afterEach(() => setNowProvider(null));

describe("extractProperties", () => {
  it("returns clean text and empty map when no props", () => {
    expect(extractProperties("buy milk")).toEqual({
      text: "buy milk",
      properties: {},
    });
  });

  it("extracts a single trailing property", () => {
    expect(extractProperties("buy milk @created(2026-04-17T09:00)")).toEqual({
      text: "buy milk",
      properties: { created: "2026-04-17T09:00" },
    });
  });

  it("extracts multiple properties", () => {
    const r = extractProperties(
      "write doc @created(2026-04-17T09:00) @started(2026-04-17T10:00)",
    );
    expect(r.text).toBe("write doc");
    expect(r.properties).toEqual({
      created: "2026-04-17T09:00",
      started: "2026-04-17T10:00",
    });
  });

  it("extracts property from middle and cleans whitespace", () => {
    const r = extractProperties("hello @priority(high) world");
    expect(r.text).toBe("hello world");
    expect(r.properties).toEqual({ priority: "high" });
  });

  it("preserves [[link]] text when extracting props", () => {
    const r = extractProperties("see [[Other]] @created(2026-04-17T09:00)");
    expect(r.text).toBe("see [[Other]]");
    expect(r.properties.created).toBe("2026-04-17T09:00");
  });
});

describe("serializeProperties", () => {
  it("orders known keys before alphabetical extras", () => {
    const s = serializeProperties({
      priority: "high",
      done: "2026-04-17T09:00",
      created: "2026-04-17T09:00",
      zeta: "z",
    });
    expect(s).toBe(
      "@created(2026-04-17T09:00) @done(2026-04-17T09:00) @priority(high) @zeta(z)",
    );
  });

  it("returns empty string for empty object", () => {
    expect(serializeProperties({})).toBe("");
  });
});

describe("markdown roundtrip with properties", () => {
  it("parses and serializes TODO + props back to canonical form", () => {
    const md = "-TODO buy milk @created(2026-04-17T09:00)\n";
    const tree = parseMarkdown(md);
    expect(tree[0].state).toBe("TODO");
    expect(tree[0].text).toBe("buy milk");
    expect(tree[0].properties.created).toBe("2026-04-17T09:00");
    expect(serializeMarkdown(tree)).toBe(md);
  });

  it("is idempotent over two serialize passes", () => {
    const md =
      "-QUESTION why? @created(2026-04-15T14:22) @source(research_notes)\n" +
      "-IDEA try caching @created(2026-04-16T08:00)\n";
    const once = serializeMarkdown(parseMarkdown(md));
    const twice = serializeMarkdown(parseMarkdown(once));
    expect(twice).toBe(once);
    expect(once).toBe(md);
  });

  it("parses new state keywords", () => {
    const tree = parseMarkdown(
      [
        "-QUESTION why",
        "-ANSWERED because",
        "-IDEA try x",
        "-WAITING on review",
      ].join("\n"),
    );
    expect(tree.map((b) => b.state)).toEqual([
      "QUESTION",
      "ANSWERED",
      "IDEA",
      "WAITING",
    ]);
  });
});

describe("newBlock auto-sets created", () => {
  it("injects created when none provided", () => {
    const b = newBlock("hi");
    expect(b.properties.created).toBe("2026-04-17T09:00");
  });

  it("respects explicitly passed created", () => {
    const b = newBlock("hi", null, { created: "2020-01-01T00:00" });
    expect(b.properties.created).toBe("2020-01-01T00:00");
  });
});

describe("setState auto-timestamps", () => {
  it("adds @started when moving into DOING", () => {
    const b = newBlock("task", "TODO");
    const next = setState([b], b.id, "DOING");
    expect(next[0].properties.started).toBe("2026-04-17T09:00");
  });

  it("adds @done when moving into DONE", () => {
    const b = newBlock("task", "DOING");
    const next = setState([b], b.id, "DONE");
    expect(next[0].properties.done).toBe("2026-04-17T09:00");
  });

  it("adds @done when moving into ANSWERED", () => {
    const b = newBlock("q", "QUESTION");
    const next = setState([b], b.id, "ANSWERED");
    expect(next[0].properties.done).toBe("2026-04-17T09:00");
  });

  it("does not overwrite existing started/done", () => {
    const b = newBlock("task", "TODO", { started: "2020-01-01T00:00" });
    const next = setState([b], b.id, "DOING");
    expect(next[0].properties.started).toBe("2020-01-01T00:00");
  });
});

describe("setState assigns per-note sequential block id", () => {
  it("assigns @id(1) when entering a state from null", () => {
    const b = newBlock("task");
    const next = setState([b], b.id, "TODO");
    expect(next[0].properties.id).toBe("1");
  });

  it("does not assign @id when state is cleared from null", () => {
    const b = newBlock("plain");
    const next = setState([b], b.id, null);
    expect(next[0].properties.id).toBeUndefined();
  });

  it("preserves @id across state transitions and through null", () => {
    const b = newBlock("task");
    let t = setState([b], b.id, "TODO");
    expect(t[0].properties.id).toBe("1");
    t = setState(t, b.id, "DOING");
    t = setState(t, b.id, "DONE");
    t = setState(t, b.id, null);
    t = setState(t, b.id, "TODO");
    expect(t[0].properties.id).toBe("1");
  });

  it("assigns increasing ids across multiple blocks", () => {
    const a = newBlock("a");
    const b = newBlock("b");
    const c = newBlock("c");
    let tree = [a, b, c];
    tree = setState(tree, a.id, "TODO");
    tree = setState(tree, b.id, "TODO");
    tree = setState(tree, c.id, "TODO");
    expect(tree.map((x) => x.properties.id)).toEqual(["1", "2", "3"]);
  });

  it("picks max+1 when ids have gaps", () => {
    const md = "-TODO old @id(7) @created(2026-04-17T09:00)\n-fresh\n";
    const tree = parseMarkdown(md);
    const fresh = tree[1];
    const next = setState(tree, fresh.id, "TODO");
    expect(next[1].properties.id).toBe("8");
  });

  it("serializes @id before other properties", () => {
    const b = newBlock("task");
    const next = setState([b], b.id, "DOING");
    const md = serializeMarkdown(next);
    expect(md).toBe("-DOING task @id(1) @created(2026-04-17T09:00) @started(2026-04-17T09:00)\n");
  });

  it("round-trips @id through parse/serialize", () => {
    const md = "-TODO task @id(7) @created(2026-04-17T09:00)\n";
    const blocks = parseMarkdown(md);
    expect(blocks[0].properties.id).toBe("7");
    expect(serializeMarkdown(blocks)).toBe(md);
  });
});

describe("cycleState stays within family", () => {
  it("TODO family: null -> TODO -> DOING -> DONE -> null", () => {
    let s: TodoState = null;
    const seen: TodoState[] = [s];
    for (let i = 0; i < 4; i++) {
      s = cycleState(s);
      seen.push(s);
    }
    expect(seen).toEqual([null, "TODO", "DOING", "DONE", null]);
  });

  it("QUESTION -> ANSWERED -> null", () => {
    expect(cycleState("QUESTION")).toBe("ANSWERED");
    expect(cycleState("ANSWERED")).toBeNull();
  });

  it("IDEA terminal in one step", () => {
    expect(cycleState("IDEA")).toBeNull();
  });
});

describe("cycleFamily switches family", () => {
  it("null -> TODO -> QUESTION -> IDEA -> WAITING -> null", () => {
    let s: TodoState = null;
    const seen: TodoState[] = [s];
    for (let i = 0; i < 5; i++) {
      s = cycleFamily(s);
      seen.push(s);
    }
    expect(seen).toEqual([null, "TODO", "QUESTION", "IDEA", "WAITING", null]);
  });

  it("jumps to first state of next family from any state in a family", () => {
    expect(cycleFamily("DOING")).toBe("QUESTION");
    expect(cycleFamily("ANSWERED")).toBe("IDEA");
  });
});
