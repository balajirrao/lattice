import {
  carryOverWeek,
  dailiesTemplate,
  isWeeklyTitle,
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
    "Open (or create) this week's note. New weeks carry over from the previous week — Dailies are reset and terminal blocks are pruned.",
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
    if (prevId) {
      const prevContent = await ctx.readNote(weekTitle(prevId));
      const carried = carryOverWeek(parseMarkdown(prevContent));
      body = serializeMarkdown(carried);
    } else {
      body = serializeMarkdown([dailiesTemplate()]);
    }

    await ctx.writeNote(currentTitle, body);
    await ctx.openNote(currentTitle);
    return {
      message: prevId
        ? `Created ${currentId} (carried from ${prevId})`
        : `Created ${currentId}`,
    };
  },
};
