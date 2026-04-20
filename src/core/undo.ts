/**
 * Pure, subsystem-agnostic undo stack helpers. The stack is just an
 * array; callers hold it in a ref (or state) and swap the reference on
 * push/pop. Payload shape is up to the caller — this module only enforces
 * LIFO order and a max-size cap.
 */

export type UndoSnapshot<T> = {
  /** Short human label (used in status toasts like "Undone: <label>"). */
  label: string;
  /** Opaque "before" state the caller will apply on undo. */
  payload: T;
};

export function pushSnapshot<T>(
  stack: readonly UndoSnapshot<T>[],
  snap: UndoSnapshot<T>,
  max: number,
): UndoSnapshot<T>[] {
  const next = [...stack, snap];
  return next.length > max ? next.slice(next.length - max) : next;
}

export function popSnapshot<T>(
  stack: readonly UndoSnapshot<T>[],
): { snap: UndoSnapshot<T> | null; rest: UndoSnapshot<T>[] } {
  if (stack.length === 0) return { snap: null, rest: [] };
  return { snap: stack[stack.length - 1], rest: stack.slice(0, -1) };
}
