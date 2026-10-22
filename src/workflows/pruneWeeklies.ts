import {
  isWeeklyTitle,
  parseMarkdown,
  pruneCarriedWeeks,
  serializeMarkdown,
} from "../core";
import type { Workflow, WorkflowContext, WorkflowResult } from "./types";

/**
 * One-shot cleanup for weeks created before "Start new week" began
 * marking carried items: hides duplicate open items in past weeklies from
 * the Open view by marking them `carried:: 1`. Only items whose text
 * reappears in a later week are touched; the latest week never is.
 */
export const pruneWeeklies: Workflow = {
  id: "prune-weeklies",
  title: "Prune carried items from past weeks",
  description:
    "Mark open items in past weekly notes as carried when they reappear in a later week, so each shows once in Open items.",
  async run(ctx: WorkflowContext): Promise<WorkflowResult> {
    const titles = (await ctx.listNotes()).filter(isWeeklyTitle).sort();
    const weeks = [];
    for (const title of titles) {
      weeks.push({ title, blocks: parseMarkdown(await ctx.readNote(title)) });
    }
    const changed = pruneCarriedWeeks(weeks);
    let total = 0;
    for (const w of changed) {
      await ctx.writeNote(w.title, serializeMarkdown(w.blocks));
      total += w.marked;
    }
    if (total === 0) return { message: "Past weeks are already tidy" };
    const n = changed.length;
    return {
      message: `Marked ${total} item${total === 1 ? "" : "s"} carried in ${n} week${n === 1 ? "" : "s"}`,
    };
  },
};
