import type { Workflow } from "./types";
import { startNewWeek } from "./startNewWeek";

export { type Workflow, type WorkflowContext, type WorkflowResult } from "./types";
export { startNewWeek };

/** All registered workflows. Add new ones here. */
export const workflows: Workflow[] = [startNewWeek];
