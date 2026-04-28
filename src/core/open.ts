import { type Block, TERMINAL_STATES, type TodoState } from "./block";

/**
 * The terminal state for an open item, used by the Open view's `d` key.
 * TODO/DOING → DONE; QUESTION → ANSWERED; families without a terminal
 * (IDEA, WAITING) lose their state entirely.
 */
export function closingState(s: OpenState): TodoState {
  switch (s) {
    case "TODO":
    case "DOING":
      return "DONE";
    case "QUESTION":
      return "ANSWERED";
    case "IDEA":
    case "WAITING":
      return null;
  }
}

export type OpenState = Exclude<TodoState, null | "DONE" | "ANSWERED" | "REMEMBER">;

export type OpenItem = {
  /** The block's id (usable with locate/openNote's focusBlockId). */
  blockId: string;
  /** The note this block belongs to. */
  noteTitle: string;
  /** Non-terminal state; never null for open items. */
  state: OpenState;
  /** Block text (no state prefix, no properties). */
  text: string;
  /** `@created` property if set, for age sorting. */
  created: string | null;
  /**
   * Text of each ancestor block, root → immediate parent. Empty for
   * top-level items. Used to render breadcrumbs in the Open view.
   */
  path: string[];
};

/**
 * Walk a block tree and collect every block whose state is non-null and
 * non-terminal (TODO/DOING/QUESTION/IDEA/WAITING). Document order is
 * preserved. Purely functional — no side effects.
 */
export function collectOpenItems(
  noteTitle: string,
  blocks: Block[],
): OpenItem[] {
  const out: OpenItem[] = [];
  const walk = (list: Block[], pathStack: readonly string[]): void => {
    for (const b of list) {
      const isOpen =
        b.state !== null &&
        !TERMINAL_STATES.has(b.state) &&
        !b.properties.carried;
      if (isOpen) {
        out.push({
          blockId: b.id,
          noteTitle,
          state: b.state as OpenState,
          text: b.text,
          created: b.properties.created ?? null,
          path: [...pathStack],
        });
      }
      walk(b.children, [...pathStack, b.text]);
    }
  };
  walk(blocks, []);
  return out;
}
