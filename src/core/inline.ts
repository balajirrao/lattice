export type InlinePart =
  | { type: "text"; value: string }
  | { type: "link"; title: string }
  | { type: "bold"; value: string }
  | { type: "italic"; value: string }
  | { type: "tag"; value: string }
  | { type: "url"; value: string };

/** Trailing chars stripped from bare URLs so "see https://x.com." doesn't
 *  swallow the sentence punctuation. They're re-emitted as plain text. */
const URL_TRAIL = ".,;:!?)";

/**
 * Parse inline markdown into typed parts for rendering.
 * Supported: [[link]], **bold**, _italic_, #tag, bare http(s) URLs.
 * Malformed/unclosed markers are emitted as plain text.
 */
export function parseInline(text: string): InlinePart[] {
  const parts: InlinePart[] = [];
  // Order matters: longer matches first to avoid partial overlaps.
  const re =
    /\[\[([^\[\]\n]+)\]\]|\*\*([^*\n]+)\*\*|_([^_\n]+)_|#([\w-]+)|(https?:\/\/[^\s\[\]<>]+)/g;
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
    } else if (m[5] !== undefined) {
      let url = m[5];
      let trail = "";
      while (url.length > 0 && URL_TRAIL.includes(url[url.length - 1])) {
        trail = url[url.length - 1] + trail;
        url = url.slice(0, -1);
      }
      parts.push({ type: "url", value: url });
      if (trail) parts.push({ type: "text", value: trail });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts;
}

/**
 * Map a caret offset measured against rendered (formatted) text back to
 * an offset in the source string. The preview renders `[[Title]]` as just
 * `Title`, `**bold**` as `bold`, and `_italic_` as `italic`; tags render
 * as `#tag` unchanged. `renderedOffset` out of bounds clamps to the end
 * of the source.
 */
export function renderedToSourceOffset(
  text: string,
  renderedOffset: number,
): number {
  const parts = parseInline(text);
  let src = 0;
  let rnd = 0;
  for (const p of parts) {
    const renderedLen =
      p.type === "text"   ? p.value.length
      : p.type === "link" ? p.title.length
      : p.type === "bold" ? p.value.length
      : p.type === "italic" ? p.value.length
      : p.type === "url"  ? p.value.length
      : /* tag */           p.value.length + 1;
    const sourceLen =
      p.type === "text"   ? p.value.length
      : p.type === "link" ? p.title.length + 4
      : p.type === "bold" ? p.value.length + 4
      : p.type === "italic" ? p.value.length + 2
      : p.type === "url"  ? p.value.length
      : /* tag */           p.value.length + 1;
    // Strict `<` so a click landing exactly on a part boundary falls
    // through to the *next* part. This keeps the cursor just outside
    // closing markers (`]]`, `**`, `_`) rather than inside them.
    if (renderedOffset < rnd + renderedLen) {
      const within = Math.max(0, renderedOffset - rnd);
      const opening =
        p.type === "link" ? 2 : p.type === "bold" ? 2 : p.type === "italic" ? 1 : 0;
      return src + opening + within;
    }
    rnd += renderedLen;
    src += sourceLen;
  }
  return text.length;
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
