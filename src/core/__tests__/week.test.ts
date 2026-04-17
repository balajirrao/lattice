import { describe, expect, it } from "vitest";
import {
  isWeeklyTitle,
  mostRecentPrevWeek,
  titleToWeekId,
  weekId,
  weekTitle,
} from "../week";

describe("weekId", () => {
  it("computes ISO week for a mid-week day", () => {
    // 2026-04-17 is a Friday in ISO week 16 of 2026.
    expect(weekId(new Date(2026, 3, 17))).toBe("2026-W16");
  });

  it("rolls into the next week on Monday", () => {
    // 2026-04-20 is a Monday — start of ISO week 17.
    expect(weekId(new Date(2026, 3, 20))).toBe("2026-W17");
  });

  it("handles year-crossing: early-January dates can belong to prev year's last week", () => {
    // 2027-01-01 is a Friday — ISO week 53 of 2026.
    expect(weekId(new Date(2027, 0, 1))).toBe("2026-W53");
  });

  it("handles year-crossing: late-December dates can belong to next year's W01", () => {
    // 2024-12-30 (Monday) is ISO week 1 of 2025.
    expect(weekId(new Date(2024, 11, 30))).toBe("2025-W01");
  });

  it("zero-pads single-digit weeks", () => {
    // 2026-01-05 is Monday — ISO week 2.
    expect(weekId(new Date(2026, 0, 5))).toBe("2026-W02");
  });
});

describe("weekTitle / titleToWeekId / isWeeklyTitle", () => {
  it("round-trips id through title helpers", () => {
    const id = "2026-W17";
    const title = weekTitle(id);
    expect(title).toBe("weekly/2026-W17");
    expect(isWeeklyTitle(title)).toBe(true);
    expect(titleToWeekId(title)).toBe(id);
  });

  it("rejects non-weekly titles", () => {
    expect(isWeeklyTitle("journals/20260417")).toBe(false);
    expect(isWeeklyTitle("weekly/2026-W1")).toBe(false); // not zero-padded
    expect(titleToWeekId("not-weekly")).toBeNull();
  });
});

describe("mostRecentPrevWeek", () => {
  it("returns the largest id strictly less than target", () => {
    expect(
      mostRecentPrevWeek(["2026-W14", "2026-W15", "2026-W17"], "2026-W17"),
    ).toBe("2026-W15");
  });

  it("returns null when no predecessor exists", () => {
    expect(mostRecentPrevWeek(["2026-W17"], "2026-W17")).toBeNull();
    expect(mostRecentPrevWeek([], "2026-W17")).toBeNull();
  });

  it("crosses year boundaries correctly via lexicographic order", () => {
    expect(
      mostRecentPrevWeek(["2025-W52", "2026-W01", "2026-W03"], "2026-W02"),
    ).toBe("2026-W01");
  });
});
