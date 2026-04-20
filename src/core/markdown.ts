import {
  type Block,
  type Properties,
  type TodoState,
  STATE_KEYWORDS,
  rawBlock,
} from "./block";

const BULLET_RE = /^(\s*)-\s*(.*)$/;
const STATE_RE = new RegExp(
  `^(${STATE_KEYWORDS.join("|")})(?:\\s+(.*))?$`,
);
const PROP_RE = /@([a-z][a-z0-9_]*)\(([^)]*)\)/g;

/** Canonical ordering for well-known properties; others go alphabetical. */
const PROP_ORDER = ["created", "started", "done"];

/**
 * Strip `@key(value)` properties out of a line body, returning the cleaned
 * text and the collected property map. Properties may appear anywhere;
 * extraction leaves a single space where each was, then trims.
 */
export function extractProperties(raw: string): {
  text: string;
  properties: Properties;
} {
  const properties: Properties = {};
  const sentinel = "\x00";
  const replaced = raw.replace(PROP_RE, (_m, k: string, v: string) => {
    properties[k] = v;
    return sentinel;
  });
  const text = replaced
    .replace(new RegExp(`\\s*${sentinel}\\s*`, "g"), " ")
    .replace(/^\s+|\s+$/g, "");
  return { text, properties };
}

export function serializeProperties(props: Properties): string {
  const keys = Object.keys(props);
  if (keys.length === 0) return "";
  const known = PROP_ORDER.filter((k) => k in props);
  const rest = keys.filter((k) => !PROP_ORDER.includes(k)).sort();
  return [...known, ...rest]
    .map((k) => `@${k}(${props[k]})`)
    .join(" ");
}

/**
 * Parse a markdown bullet list into a Block tree.
 * - Indentation is 2 spaces per depth level.
 * - Lines that are not bullets are ignored.
 * - A leading state keyword becomes the block's state.
 * - Inline `@key(value)` annotations are extracted into `properties`.
 */
export function parseMarkdown(md: string): Block[] {
  const root: Block[] = [];
  type Frame = { list: Block[]; indent: number };
  const stack: Frame[] = [{ list: root, indent: -1 }];

  for (const rawLine of md.split("\n")) {
    const m = rawLine.match(BULLET_RE);
    if (!m) continue;
    const indent = Math.floor(m[1].length / 2);
    let body = m[2];
    let state: TodoState = null;
    const sm = body.match(STATE_RE);
    if (sm) {
      state = sm[1] as TodoState;
      body = sm[2] ?? "";
    }
    const { text, properties } = extractProperties(body);
    const block = rawBlock(text, state, properties);
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
    stack[stack.length - 1].list.push(block);
    stack.push({ list: block.children, indent });
  }
  return root;
}

/**
 * Serialize a Block tree back to markdown.
 * Always uses 2-space indentation. Ends with a single trailing newline
 * when there is any content.
 */
export function serializeMarkdown(blocks: Block[]): string {
  const lines: string[] = [];
  const walk = (list: Block[], depth: number) => {
    for (const b of list) {
      const prefix = "  ".repeat(depth) + "-";
      const statePart = b.state ? b.state : "";
      const propPart = serializeProperties(b.properties);
      const parts = [statePart, b.text, propPart].filter(Boolean);
      lines.push(prefix + parts.join(" "));
      walk(b.children, depth + 1);
    }
  };
  walk(blocks, 0);
  return lines.length === 0 ? "" : lines.join("\n") + "\n";
}
