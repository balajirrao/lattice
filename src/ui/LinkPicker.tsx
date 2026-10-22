import { useEffect, useRef } from "react";

type Props = {
  candidates: string[];
  query: string;
  selectedIdx: number;
  setSelectedIdx: (i: number) => void;
  onPick: (title: string) => void;
};

export function LinkPicker({
  candidates,
  query,
  selectedIdx,
  setSelectedIdx,
  onPick,
}: Props) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const el = listRef.current?.children[selectedIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  if (candidates.length === 0) {
    return (
      <div className="blockref-picker">
        <div className="blockref-empty">
          {query.trim()
            ? `Press Enter to create "${query.trim()}"`
            : "Type to search notes…"}
        </div>
      </div>
    );
  }

  return (
    <div className="blockref-picker">
      <ul className="blockref-list" ref={listRef}>
        {candidates.map((t, i) => (
          <li
            key={t}
            className={`blockref-item${i === selectedIdx ? " selected" : ""}`}
            onMouseDown={(e) => { e.preventDefault(); onPick(t); }}
            onMouseEnter={() => setSelectedIdx(i)}
          >
            <span className="blockref-text">{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Filter and rank note titles by query: prefix matches first, then substring. */
export function filterTitles(titles: string[], query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return titles.slice(0, 20);
  const prefix: string[] = [];
  const contain: string[] = [];
  for (const t of titles) {
    const lo = t.toLowerCase();
    if (lo.startsWith(q)) prefix.push(t);
    else if (lo.includes(q)) contain.push(t);
  }
  return [...prefix, ...contain].slice(0, 20);
}
