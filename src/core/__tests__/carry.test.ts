import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetIdCounter, setNowProvider } from "../block";
import { carryForward } from "../carry";
import { parseMarkdown, serializeMarkdown } from "../markdown";

beforeEach(() => {
  resetIdCounter(0);
  setNowProvider(() => "2026-04-17T09:00");
});
afterEach(() => setNowProvider(null));

function md(s: string): string {
  return serializeMarkdown(carryForward(parseMarkdown(s), "2026-W16"));
}

describe("carryForward", () => {
  it("drops DONE blocks entirely", () => {
    expect(md("-DONE ship it\n-TODO next thing\n")).toBe(
      "-TODO next thing @carried_from(2026-W16)\n",
    );
  });

  it("drops ANSWERED blocks entirely", () => {
    expect(md("-ANSWERED done\n-QUESTION open\n")).toBe(
      "-QUESTION open @carried_from(2026-W16)\n",
    );
  });

  it("keeps DOING as DOING", () => {
    expect(md("-DOING mid-task\n")).toBe(
      "-DOING mid-task @carried_from(2026-W16)\n",
    );
  });

  it("preserves original @created on carry", () => {
    const out = md("-TODO write @created(2026-04-10T08:00)\n");
    expect(out).toContain("@created(2026-04-10T08:00)");
    expect(out).toContain("@carried_from(2026-W16)");
  });

  it("overwrites existing carried_from with the new source week", () => {
    const out = md(
      "-TODO drag @created(2026-04-01T09:00) @carried_from(2026-W14)\n",
    );
    expect(out).toBe(
      "-TODO drag @created(2026-04-01T09:00) @carried_from(2026-W16)\n",
    );
  });

  it("drops plain blocks that have no surviving descendants", () => {
    expect(md("-had lunch with Sam\n-DONE ship it\n")).toBe("");
  });

  it("keeps a plain parent if a descendant survives", () => {
    const out = md([
      "-Project X",
      "  -DONE scope it",
      "  -TODO build it",
    ].join("\n") + "\n");
    expect(out).toBe(
      [
        "-Project X @carried_from(2026-W16)",
        "  -TODO build it @carried_from(2026-W16)",
      ].join("\n") + "\n",
    );
  });

  it("drops subtree under a DONE parent even if children were TODO", () => {
    const out = md([
      "-DONE abandoned project",
      "  -TODO buried subtask",
    ].join("\n") + "\n");
    expect(out).toBe("");
  });

  it("is stable: running carry twice produces the same result (just a different source)", () => {
    const input = "-TODO x\n-DOING y\n-DONE z\n";
    const once = carryForward(parseMarkdown(input), "2026-W14");
    const twice = carryForward(once, "2026-W15");
    // All survivors now reflect the latest source week.
    for (const b of twice) {
      expect(b.properties.carried_from).toBe("2026-W15");
    }
    expect(twice).toHaveLength(2); // TODO, DOING
  });
});
