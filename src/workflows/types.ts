/**
 * Workflow system: named, idempotent commands the user invokes from a palette.
 *
 * Each workflow is a self-contained function that takes a `WorkflowContext`
 * (the set of vault ops it needs) and does its thing. Idempotency is a
 * contract each workflow honors: running it twice in the same state is a no-op
 * (or reuses the existing artifact).
 */

export type WorkflowContext = {
  listNotes: () => Promise<string[]>;
  readNote: (title: string) => Promise<string>;
  writeNote: (title: string, content: string) => Promise<void>;
  openNote: (title: string) => Promise<void>;
  now: () => Date;
};

export type WorkflowResult = {
  /** Human-readable outcome for the status bar / toast. */
  message: string;
};

export type Workflow = {
  id: string;
  title: string;
  description?: string;
  run: (ctx: WorkflowContext) => Promise<WorkflowResult>;
};
