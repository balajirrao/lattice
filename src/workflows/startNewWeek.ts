import {
  carryOverWeek,
  dailiesTemplate,
  isWeeklyTitle,
  markCarriedOver,
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
    "Open (or create) this week's note. New weeks carry over from the previous week — Dailies are reset, terminal blocks are pruned, and the originals are marked carried so they don't show up twice in Open items.",
  async run(ctx: WorkflowContext): Promise<WorkflowResult> {
    const currentId = weekId(ctx.now());
    const currentTitle = weekTitle(currentId);
    const all = await ctx.listNotes();

    if (all.includes(currentTitle)) {
      await ctx.openNote(currentTitle);
      return { message: `Opened ${currentId}` };
    }

    const priorIds = all
      .filter(isWeeklyTitle)
      .map((t) => titleToWeekId(t)!)
      .filter((x): x is string => x !== null);
    const prevId = mostRecentPrevWeek(priorIds, currentId);

    let body: string;
    let prevMarked: string | null = null;
    if (prevId) {
      const prevContent = await ctx.readNote(weekTitle(prevId));
      const prevBlocks = parseMarkdown(prevContent);
      body = serializeMarkdown(carryOverWeek(prevBlocks));
      const marked = serializeMarkdown(markCarriedOver(prevBlocks));
      if (marked !== serializeMarkdown(prevBlocks)) prevMarked = marked;
    } else {
      body = serializeMarkdown([dailiesTemplate()]);
    }

    // Write the new week first: if anything fails after this, the worst
    // case is open items showing twice, never items going missing.
    await ctx.writeNote(currentTitle, body);
    if (prevId && prevMarked !== null) {
      await ctx.writeNote(weekTitle(prevId), prevMarked);
    }
    await ctx.openNote(currentTitle);
    return {
      message: prevId
        ? `Created ${currentId} (carried from ${prevId})`
        : `Created ${currentId}`,
    };
  },
};
