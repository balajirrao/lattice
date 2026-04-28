import { describe, expect, it } from "vitest";
import {
  WEEKDAY_NAMES,
  carryOverWeek,
  dailiesTemplate,
  formatWeekRange,
  isWeeklyTitle,
  mostRecentPrevWeek,
  titleToWeekId,
  weekId,
  weekRange,
  weekTitle,
  weekdayFor,
} from "../week";
import { parseMarkdown, serializeMarkdown } from "../markdown";

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

describe("weekdayFor", () => {
  it("maps Monday..Sunday to Mon..Sun", () => {
    expect(weekdayFor(new Date(2026, 3, 13))).toBe("Mon");
    expect(weekdayFor(new Date(2026, 3, 14))).toBe("Tue");
    expect(weekdayFor(new Date(2026, 3, 15))).toBe("Wed");
    expect(weekdayFor(new Date(2026, 3, 16))).toBe("Thu");
    expect(weekdayFor(new Date(2026, 3, 17))).toBe("Fri");
    expect(weekdayFor(new Date(2026, 3, 18))).toBe("Sat");
    expect(weekdayFor(new Date(2026, 3, 19))).toBe("Sun");
  });

  it("WEEKDAY_NAMES has exactly seven entries starting with Mon", () => {
    expect(WEEKDAY_NAMES).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  });
});

describe("weekRange", () => {
  it("returns Monday–Sunday UTC dates for an ordinary week", () => {
    const { start, end } = weekRange("2026-W17");
    expect(start).toEqual(new Date(Date.UTC(2026, 3, 20)));
    expect(end).toEqual(new Date(Date.UTC(2026, 3, 26)));
  });

  it("handles the final ISO week of a long year (W53)", () => {
    const { start, end } = weekRange("2026-W53");
    // 2026-W53 starts Monday 2026-12-28 and ends Sunday 2027-01-03
    expect(start).toEqual(new Date(Date.UTC(2026, 11, 28)));
    expect(end).toEqual(new Date(Date.UTC(2027, 0, 3)));
  });

  it("throws on malformed input", () => {
    expect(() => weekRange("bogus")).toThrow();
  });
});

describe("formatWeekRange", () => {
  it("collapses month when start and end share one", () => {
    expect(formatWeekRange("2026-W17")).toBe("Apr 20 – 26");
  });

  it("spans months when the week crosses one", () => {
    // 2026-W18 = Apr 27 – May 3
    expect(formatWeekRange("2026-W18")).toBe("Apr 27 – May 3");
  });

  it("spells out both years when the week crosses New Year", () => {
    // 2026-W53 = Dec 28 2026 – Jan 3 2027
    expect(formatWeekRange("2026-W53")).toBe("Dec 28, 2026 – Jan 3, 2027");
  });
});

describe("dailiesTemplate", () => {
  it("creates a Dailies wrapper with empty Mon..Sun children", () => {
    const t = dailiesTemplate();
    expect(t.text).toBe("Dailies");
    expect(t.children.map((c) => c.text)).toEqual([...WEEKDAY_NAMES]);
    expect(t.children.every((c) => c.children.length === 0)).toBe(true);
  });
});

describe("carryOverWeek", () => {
  it("resets the Dailies wrapper's children to empty Mon..Sun", () => {
    const md =
      "-Dailies\n  -Mon\n    -did stuff\n  -Tue\n  -Wed\n  -Thu\n  -Fri\n  -Sat\n  -Sun\n";
    const out = carryOverWeek(parseMarkdown(md));
    const dailies = out[0];
    expect(dailies.text).toBe("Dailies");
    expect(dailies.children.map((c) => c.text)).toEqual([...WEEKDAY_NAMES]);
    expect(dailies.children.every((c) => c.children.length === 0)).toBe(true);
  });

  it("prunes terminal blocks (DONE/ANSWERED/REMEMBER) from non-Dailies subtree", () => {
    const md =
      "-Dailies\n  -Mon\n  -Tue\n  -Wed\n  -Thu\n  -Fri\n  -Sat\n  -Sun\n" +
      "-TODO active\n" +
      "-DONE finished\n" +
      "-ANSWERED resolved\n" +
      "-REMEMBER fact\n" +
      "-WAITING blocked\n";
    const out = carryOverWeek(parseMarkdown(md));
    const titles = out.slice(1).map((b) => `${b.state ?? ""} ${b.text}`.trim());
    expect(titles).toEqual(["TODO active", "WAITING blocked"]);
  });

  it("prunes terminal subtrees including their children", () => {
    const md =
      "-Dailies\n  -Mon\n  -Tue\n  -Wed\n  -Thu\n  -Fri\n  -Sat\n  -Sun\n" +
      "-DONE parent\n  -TODO orphaned child\n";
    const out = carryOverWeek(parseMarkdown(md));
    expect(out).toHaveLength(1); // only Dailies survives
  });

  it("recurses into non-terminal parents and prunes terminal children", () => {
    const md =
      "-Dailies\n  -Mon\n  -Tue\n  -Wed\n  -Thu\n  -Fri\n  -Sat\n  -Sun\n" +
      "-Project\n  -TODO live\n  -DONE shipped\n  -ANSWERED answered q\n";
    const out = carryOverWeek(parseMarkdown(md));
    const project = out[1];
    expect(project.text).toBe("Project");
    expect(project.children.map((c) => c.text)).toEqual(["live"]);
  });

  it("prepends a fresh Dailies template when prev had none", () => {
    const md = "-just notes\n-TODO carry me\n";
    const out = carryOverWeek(parseMarkdown(md));
    expect(out[0].text).toBe("Dailies");
    expect(out[0].children.map((c) => c.text)).toEqual([...WEEKDAY_NAMES]);
    expect(out.slice(1).map((b) => b.text)).toEqual(["just notes", "carry me"]);
  });

  it("preserves @id on the Dailies wrapper itself", () => {
    const md = "-Dailies @id(3)\n  -Mon\n  -Tue\n  -Wed\n  -Thu\n  -Fri\n  -Sat\n  -Sun\n";
    const out = carryOverWeek(parseMarkdown(md));
    // The wrapper keeps any properties it had; only its children are reset.
    expect(out[0].properties.id).toBe("3");
  });

  it("round-trips through markdown serialization", () => {
    const md = "-Dailies\n  -Mon\n  -Tue\n  -Wed\n  -Thu\n  -Fri\n  -Sat\n  -Sun\n-TODO live\n-DONE dead\n";
    const out = carryOverWeek(parseMarkdown(md));
    const expected = "-Dailies\n  -Mon\n  -Tue\n  -Wed\n  -Thu\n  -Fri\n  -Sat\n  -Sun\n-TODO live\n";
    expect(serializeMarkdown(out)).toBe(expected);
  });
});
