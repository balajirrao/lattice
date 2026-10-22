import type { Workflow } from "./types";
import { startNewWeek } from "./startNewWeek";
import { pruneWeeklies } from "./pruneWeeklies";

export { type Workflow, type WorkflowContext, type WorkflowResult } from "./types";
export { startNewWeek, pruneWeeklies };

/** All registered workflows. Add new ones here. */
export const workflows: Workflow[] = [startNewWeek, pruneWeeklies];
