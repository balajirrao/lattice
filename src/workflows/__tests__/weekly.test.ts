import { describe, expect, it } from "vitest";
import { collectOpenItems, parseMarkdown } from "../../core";
import { pruneWeeklies } from "../pruneWeeklies";
import { startNewWeek } from "../startNewWeek";
import type { WorkflowContext } from "../types";

const DAILIES =
  "-Dailies\n  -Mon\n    -TODO daily\n  -Tue\n  -Wed\n  -Thu\n  -Fri\n  -Sat\n  -Sun\n";

function fakeVault(files: Record<string, string>, now: Date) {
  const opened: string[] = [];
  const ctx: WorkflowContext = {
    listNotes: async () => Object.keys(files).sort(),
    readNote: async (t) => files[t] ?? "",
    writeNote: async (t, c) => { files[t] = c; },
    openNote: async (t) => { opened.push(t); },
    now: () => now,
  };
  return { ctx, files, opened };
}

const openCount = (files: Record<string, string>) =>
  Object.entries(files).reduce(
    (n, [t, c]) => n + collectOpenItems(t, parseMarkdown(c)).length,
    0,
  );

// 2026-10-22 is a Thursday in ISO week 2026-W43.
const NOW = new Date(2026, 9, 22);

describe("startNewWeek", () => {
  it("marks the previous week's carried items so they aren't listed twice", async () => {
    const v = fakeVault(
      { "weekly/2026-W42": DAILIES + "-TODO ship it\n-DONE old\n" },
      NOW,
    );
    expect(openCount(v.files)).toBe(2); // "ship it" + Dailies "daily"
    await startNewWeek.run(v.ctx);
    expect(v.opened).toEqual(["weekly/2026-W43"]);
    expect(v.files["weekly/2026-W43"]).toContain("-TODO ship it");
    // "ship it" now lives only in W43; the un-carried Dailies todo stays in W42.
    const w42 = collectOpenItems("w42", parseMarkdown(v.files["weekly/2026-W42"]));
    expect(w42.map((i) => i.text)).toEqual(["daily"]);
    expect(openCount(v.files)).toBe(2);
  });

  it("does not rewrite an existing week", async () => {
    const v = fakeVault(
      {
        "weekly/2026-W42": DAILIES + "-TODO a\n",
        "weekly/2026-W43": DAILIES + "-TODO a\n",
      },
      NOW,
    );
    const before = { ...v.files };
    await startNewWeek.run(v.ctx);
    expect(v.files).toEqual(before);
  });
});

describe("pruneWeeklies", () => {
  it("collapses duplicates across past weeks to a single open item", async () => {
    const v = fakeVault(
      {
        "weekly/2026-W40": "-TODO a\n-TODO gone\n",
        "weekly/2026-W41": "-TODO a\n",
        "weekly/2026-W42": "-TODO a\n",
        "notes/other": "-TODO a\n",
      },
      NOW,
    );
    const res = await pruneWeeklies.run(v.ctx);
    expect(res.message).toBe("Marked 2 items carried in 2 weeks");
    // W42's "a", W40's "gone", and the non-weekly note are untouched.
    expect(openCount(v.files)).toBe(3);
    expect(v.files["notes/other"]).toBe("-TODO a\n");
    const again = await pruneWeeklies.run(v.ctx);
    expect(again.message).toBe("Past weeks are already tidy");
  });
});
