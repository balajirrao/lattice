import { describe, expect, it } from "vitest";
import { popSnapshot, pushSnapshot, type UndoSnapshot } from "../undo";

const snap = (label: string): UndoSnapshot<string> => ({ label, payload: label });

describe("pushSnapshot", () => {
  it("appends in LIFO-insertion order", () => {
    const s0: UndoSnapshot<string>[] = [];
    const s1 = pushSnapshot(s0, snap("a"), 10);
    const s2 = pushSnapshot(s1, snap("b"), 10);
    expect(s2.map((x) => x.label)).toEqual(["a", "b"]);
  });

  it("does not mutate the input stack", () => {
    const s0 = [snap("a")];
    const s1 = pushSnapshot(s0, snap("b"), 10);
    expect(s0.map((x) => x.label)).toEqual(["a"]);
    expect(s1.map((x) => x.label)).toEqual(["a", "b"]);
  });

  it("enforces the cap by dropping the oldest entries", () => {
    let s: UndoSnapshot<string>[] = [];
    for (const label of ["a", "b", "c", "d"]) s = pushSnapshot(s, snap(label), 2);
    expect(s.map((x) => x.label)).toEqual(["c", "d"]);
  });

  it("caps at max even when pushing into an already-full stack", () => {
    const s0 = [snap("a"), snap("b"), snap("c")];
    const s1 = pushSnapshot(s0, snap("d"), 2);
    expect(s1.map((x) => x.label)).toEqual(["c", "d"]);
  });
});

describe("popSnapshot", () => {
  it("returns the last entry and the rest", () => {
    const s0 = [snap("a"), snap("b"), snap("c")];
    const { snap: top, rest } = popSnapshot(s0);
    expect(top?.label).toBe("c");
    expect(rest.map((x) => x.label)).toEqual(["a", "b"]);
  });

  it("returns null on an empty stack", () => {
    const { snap: top, rest } = popSnapshot([]);
    expect(top).toBeNull();
    expect(rest).toEqual([]);
  });

  it("does not mutate the input stack", () => {
    const s0 = [snap("a"), snap("b")];
    popSnapshot(s0);
    expect(s0.map((x) => x.label)).toEqual(["a", "b"]);
  });
});
