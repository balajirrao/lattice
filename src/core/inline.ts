export type InlinePart =
  | { type: "text"; value: string }
  | { type: "link"; title: string }
  | { type: "bold"; value: string }
  | { type: "italic"; value: string }
  | { type: "tag"; value: string };

/**
 * Parse inline markdown into typed parts for rendering.
 * Supported: [[link]], **bold**, _italic_, #tag.
 * Malformed/unclosed markers are emitted as plain text.
 */
export function parseInline(text: string): InlinePart[] {
  const parts: InlinePart[] = [];
  // Order matters: longer matches first to avoid partial overlaps.
  const re = /\[\[([^\[\]\n]+)\]\]|\*\*([^*\n]+)\*\*|_([^_\n]+)_|#([\w-]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: "text", value: text.slice(last, m.index) });
    if (m[1] !== undefined) {
      parts.push({ type: "link", title: m[1].trim() });
    } else if (m[2] !== undefined) {
      parts.push({ type: "bold", value: m[2] });
    } else if (m[3] !== undefined) {
      parts.push({ type: "italic", value: m[3] });
    } else if (m[4] !== undefined) {
      parts.push({ type: "tag", value: m[4] });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts;
}

/** Extract just the link titles (for navigation / backlink computation). */
export function extractLinks(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parseInline(text)) {
    if (p.type === "link" && !seen.has(p.title)) {
      seen.add(p.title);
      out.push(p.title);
    }
  }
  return out;
}
