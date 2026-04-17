import { beforeEach, describe, expect, it } from "vitest";
import { newBlock, resetIdCounter } from "../block";
import { cycleState, setState } from "../tree";

beforeEach(() => resetIdCounter(0));

describe("cycleState", () => {
  it("cycles null -> TODO -> DOING -> DONE -> null", () => {
    expect(cycleState(null)).toBe("TODO");
    expect(cycleState("TODO")).toBe("DOING");
    expect(cycleState("DOING")).toBe("DONE");
    expect(cycleState("DONE")).toBeNull();
  });

  it("forms a complete loop of length 4", () => {
    let s = null as ReturnType<typeof cycleState>;
    const seen: (typeof s)[] = [s];
    for (let i = 0; i < 4; i++) {
      s = cycleState(s);
      seen.push(s);
    }
    expect(seen).toEqual([null, "TODO", "DOING", "DONE", null]);
  });
});

describe("setState", () => {
  it("updates only the target block", () => {
    const a = newBlock("a");
    const b = newBlock("b");
    const tree = [a, b];
    const next = setState(tree, a.id, "DOING");
    expect(next[0].state).toBe("DOING");
    expect(next[1].state).toBeNull();
  });

  it("clears the state when set to null", () => {
    const a = { ...newBlock("a"), state: "DONE" as const };
    const tree = [a];
    const next = setState(tree, a.id, null);
    expect(next[0].state).toBeNull();
  });

  it("does not mutate the input tree", () => {
    const a = newBlock("a");
    const tree = [a];
    setState(tree, a.id, "TODO");
    expect(a.state).toBeNull();
  });
});
