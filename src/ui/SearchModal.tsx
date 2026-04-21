import { useEffect, useRef, useState } from "react";
import * as api from "./api";

type Props = {
  onOpen: (title: string, query: string) => void;
  onClose: () => void;
};

export function SearchModal({ onOpen, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<api.SearchResult[]>([]);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      const r = await api.searchNotes(query);
      setResults(r);
      setSelected(0);
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  const pick = (title: string) => { onOpen(title, query.trim()); onClose(); };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected((s) => Math.min(s + 1, results.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
    if (e.key === "Enter" && results[selected]) { pick(results[selected].title); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="search-modal" onClick={(e) => e.stopPropagation()} onKeyDown={onKey}>
        <input
          ref={inputRef}
          className="search-input"
          placeholder="Search notes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {results.length > 0 && (
          <ul className="search-results">
            {results.map((r, i) => (
              <li key={r.title} className={i === selected ? "selected" : ""}>
                <button onClick={() => pick(r.title)}>
                  <span className="search-title">{r.title}</span>
                  {r.excerpt && <span className="search-excerpt">{r.excerpt}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        {query.trim() && results.length === 0 && (
          <div className="search-empty">No results for "{query}"</div>
        )}
      </div>
    </div>
  );
}
