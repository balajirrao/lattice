const LINK_RE = /\[\[([^\[\]]+)\]\]/g;

export type TextPart =
  | { type: "text"; value: string }
  | { type: "link"; title: string };

/**
 * Return the unique list of [[Title]] references inside `text`,
 * preserving order of first appearance.
 */
export function extractLinks(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of text.matchAll(LINK_RE)) {
    const title = m[1].trim();
    if (!title || seen.has(title)) continue;
    seen.add(title);
    out.push(title);
  }
  return out;
}

/**
 * Split text into alternating plain-text and link parts for rendering.
 * Malformed or unclosed brackets are treated as plain text.
 */
export function renderTextParts(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  const re = new RegExp(LINK_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: "text", value: text.slice(last, m.index) });
    parts.push({ type: "link", title: m[1].trim() });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts;
}
