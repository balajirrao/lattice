import { useEffect, useRef } from "react";
import type { Block } from "../core";

export type BlockRefCandidate = { num: number; text: string };

type Props = {
  candidates: BlockRefCandidate[];
  query: string;
  selectedIdx: number;
  setSelectedIdx: (i: number) => void;
  onPick: (num: number) => void;
};

export function BlockRefPicker({
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
        <div className="blockref-empty">no matches{query ? ` for $${query}` : ""}</div>
      </div>
    );
  }

  return (
    <div className="blockref-picker">
      <ul className="blockref-list" ref={listRef}>
        {candidates.map((c, i) => (
          <li
            key={c.num}
            className={`blockref-item${i === selectedIdx ? " selected" : ""}`}
            onMouseDown={(e) => { e.preventDefault(); onPick(c.num); }}
            onMouseEnter={() => setSelectedIdx(i)}
          >
            <span className="blockref-num">${c.num}</span>
            <span className="blockref-text">{c.text || <em className="blockref-untitled">(empty)</em>}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Build candidate list from a tree, filtered by digit prefix. */
export function buildCandidates(
  blocks: Block[],
  query: string,
  excludeBlockId: string | null,
): BlockRefCandidate[] {
  const out: BlockRefCandidate[] = [];
  const walk = (list: Block[]) => {
    for (const b of list) {
      const id = parseInt(b.properties.id ?? "", 10);
      if (Number.isFinite(id) && b.id !== excludeBlockId) {
        if (!query || String(id).startsWith(query)) {
          out.push({ num: id, text: b.text });
        }
      }
      walk(b.children);
    }
  };
  walk(blocks);
  out.sort((a, b) => a.num - b.num);
  return out;
}
