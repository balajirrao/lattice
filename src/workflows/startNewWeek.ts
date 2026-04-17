import {
  carryForward,
  mostRecentPrevWeek,
  parseMarkdown,
  serializeMarkdown,
  titleToWeekId,
  weekId,
  weekTitle,
} from "../core";
import type { Workflow, WorkflowContext, WorkflowResult } from "./types";

export const startNewWeek: Workflow = {
  id: "start-new-week",
  title: "Start new week",
  description:
    "Open (or create) this week's note. On create, carries non-terminal blocks forward from the most recent previous week.",
  async run(ctx: WorkflowContext): Promise<WorkflowResult> {
    const currentId = weekId(ctx.now());
    const currentTitle = weekTitle(currentId);
    const all = await ctx.listNotes();

    // Idempotent: if the note already exists, just open it.
    if (all.includes(currentTitle)) {
      await ctx.openNote(currentTitle);
      return { message: `Opened ${currentId}` };
    }

    const existingWeekIds = all
      .map(titleToWeekId)
      .filter((id): id is string => id !== null);
    const prevId = mostRecentPrevWeek(existingWeekIds, currentId);

    let body = "";
    let carriedCount = 0;
    if (prevId) {
      const prevContent = await ctx.readNote(weekTitle(prevId));
      const prevBlocks = parseMarkdown(prevContent);
      const carried = carryForward(prevBlocks, prevId);
      carriedCount = countBlocks(carried);
      body = serializeMarkdown(carried);
    }

    await ctx.writeNote(currentTitle, body);
    await ctx.openNote(currentTitle);

    if (prevId) {
      return {
        message: `Created ${currentId} — carried ${carriedCount} block${carriedCount === 1 ? "" : "s"} from ${prevId}`,
      };
    }
    return { message: `Created ${currentId} (no previous week to carry from)` };
  },
};

function countBlocks(list: { children: unknown[] }[]): number {
  let n = 0;
  const walk = (l: { children: unknown[] }[]) => {
    for (const b of l) {
      n += 1;
      walk(b.children as { children: unknown[] }[]);
    }
  };
  walk(list);
  return n;
}
