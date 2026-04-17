import {
  type Block,
  TERMINAL_STATES,
} from "./block";

/**
 * Filter a block tree for carry-forward into the next week.
 *
 * Rules:
 *   - A block with a terminal state (DONE, ANSWERED) is dropped along with
 *     its entire subtree (that subtree is considered "complete").
 *   - A block with a non-terminal state (TODO, DOING, QUESTION, IDEA,
 *     WAITING) survives; its children are processed recursively.
 *   - A plain block (no state) survives only if at least one descendant
 *     survives — this preserves context for orphaned TODOs without
 *     carrying across narrative ("had lunch with Sam") blocks.
 *   - For every surviving block, `@carried_from(<sourceWeekId>)` is written
 *     (overwriting any previous value — it points to the immediate source).
 *     `@created` is preserved as the anchor for true age.
 *   - `@started` / `@done` are preserved. In practice `@done` won't appear
 *     because DONE/ANSWERED blocks are dropped; but if a user set `@done`
 *     on a non-terminal state by hand, we don't touch it.
 */
export function carryForward(
  blocks: Block[],
  sourceWeekId: string,
): Block[] {
  const walk = (list: Block[]): Block[] => {
    const out: Block[] = [];
    for (const b of list) {
      if (b.state !== null && TERMINAL_STATES.has(b.state)) continue;
      const keptChildren = walk(b.children);
      const survives = b.state !== null || keptChildren.length > 0;
      if (!survives) continue;
      out.push({
        ...b,
        properties: { ...b.properties, carried_from: sourceWeekId },
        children: keptChildren,
      });
    }
    return out;
  };
  return walk(blocks);
}
