export type TodoState =
  | "TODO"
  | "DOING"
  | "DONE"
  | "QUESTION"
  | "ANSWERED"
  | "IDEA"
  | "WAITING"
  | null;

export type Properties = Record<string, string>;

export type Block = {
  id: string;
  text: string;
  state: TodoState;
  properties: Properties;
  children: Block[];
};

/** State families. ⌘Enter cycles within a family; ⌥Enter switches family. */
export const STATE_FAMILIES: Exclude<TodoState, null>[][] = [
  ["TODO", "DOING", "DONE"],
  ["QUESTION", "ANSWERED"],
  ["IDEA"],
  ["WAITING"],
];

/** States that should NOT carry forward to a new week. */
export const TERMINAL_STATES: ReadonlySet<TodoState> = new Set<TodoState>([
  "DONE",
  "ANSWERED",
]);

export const STATE_KEYWORDS: readonly string[] =
  STATE_FAMILIES.flat();

// ── time (test-injectable) ───────────────────────────────────────────────────

function defaultNow(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

let _nowProvider: () => string = defaultNow;

export function currentTimestamp(): string {
  return _nowProvider();
}

export function setNowProvider(fn: (() => string) | null): void {
  _nowProvider = fn ?? defaultNow;
}

// ── id ───────────────────────────────────────────────────────────────────────

let counter = 0;

export function genId(): string {
  counter += 1;
  return `b${counter}`;
}

export function resetIdCounter(start = 0): void {
  counter = start;
}

// ── construction ─────────────────────────────────────────────────────────────

/**
 * Create a new block. Auto-sets `created` property to `currentTimestamp()`
 * unless one is passed in `properties`. Use `rawBlock` to skip auto-props.
 */
export function newBlock(
  text = "",
  state: TodoState = null,
  properties: Properties = {},
): Block {
  const props: Properties = { ...properties };
  if (!("created" in props)) props.created = currentTimestamp();
  return { id: genId(), text, state, properties: props, children: [] };
}

/** Create a block without auto-injecting properties (used by markdown parser). */
export function rawBlock(
  text: string,
  state: TodoState,
  properties: Properties,
): Block {
  return { id: genId(), text, state, properties: { ...properties }, children: [] };
}
