import { useEffect, useMemo, useRef, useState } from "react";
import type { Workflow } from "../workflows";

type Props = {
  workflows: Workflow[];
  onClose: () => void;
  onRun: (w: Workflow) => void;
};

/** Lightweight substring + ordered-characters fuzzy match. Cheap, no deps. */
function score(query: string, target: string): number | null {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t.includes(q)) return 1000 - t.indexOf(q); // substring boost
  let qi = 0;
  let s = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      s += 1;
      qi += 1;
    }
  }
  return qi === q.length ? s : null;
}

export function CommandPalette({ workflows, onClose, onRun }: Props) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  const matches = useMemo(() => {
    const scored = workflows
      .map((w) => ({ w, s: score(query, `${w.title} ${w.description ?? ""}`) }))
      .filter((e): e is { w: Workflow; s: number } => e.s !== null)
      .sort((a, b) => b.s - a.s);
    return scored.map((e) => e.w);
  }, [workflows, query]);

  useEffect(() => setSelected(0), [query]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, Math.max(0, matches.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const w = matches[selected];
      if (w) onRun(w);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="search-modal" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="search-input"
          placeholder="Run workflow…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKey}
        />
        <ul className="search-results">
          {matches.length === 0 ? (
            <li className="search-empty">No matching workflow</li>
          ) : (
            matches.map((w, i) => (
              <li key={w.id} className={i === selected ? "selected" : ""}>
                <button onClick={() => onRun(w)}>
                  <span className="search-title">{w.title}</span>
                  {w.description && (
                    <span className="search-excerpt">{w.description}</span>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
