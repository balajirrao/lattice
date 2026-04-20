import {
  type Block,
  WEEKDAY_NAMES,
  newBlock,
  serializeMarkdown,
  weekId,
  weekTitle,
} from "../core";
import type { Workflow, WorkflowContext, WorkflowResult } from "./types";

/**
 * Build the "Dailies" wrapper block with Mon–Sun as children. Structural;
 * no auto-properties. Users can freely edit, delete, or extend the tree
 * after creation — the template is a one-time seed, not enforced.
 */
function dailiesTemplate(): Block {
  const days: Block[] = WEEKDAY_NAMES.map((name) => ({
    ...newBlock(name),
    properties: {},
  }));
  return {
    ...newBlock("Dailies"),
    properties: {},
    children: days,
  };
}

export const startNewWeek: Workflow = {
  id: "start-new-week",
  title: "Start new week",
  description: "Open (or create) this week's note with a Mon–Sun Dailies template.",
  async run(ctx: WorkflowContext): Promise<WorkflowResult> {
    const currentId = weekId(ctx.now());
    const currentTitle = weekTitle(currentId);
    const all = await ctx.listNotes();

    if (all.includes(currentTitle)) {
      await ctx.openNote(currentTitle);
      return { message: `Opened ${currentId}` };
    }

    const body = serializeMarkdown([dailiesTemplate()]);
    await ctx.writeNote(currentTitle, body);
    await ctx.openNote(currentTitle);
    return { message: `Created ${currentId}` };
  },
};
