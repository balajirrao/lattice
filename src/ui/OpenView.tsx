import { useEffect, useState } from "react";
import {
  type OpenItem,
  type OpenState,
  collectOpenItems,
  parseMarkdown,
} from "../core";
import * as api from "./api";

type Props = {
  onOpen: (title: string, openItemIndex: number) => void;
  onCloseItem: (title: string, openItemIndex: number) => Promise<void>;
  onMarkCarried: (title: string, openItemIndex: number) => Promise<void>;
  onClose: () => void;
};

type Grouped = { title: string; items: OpenItem[] };
type TouchKind = "closed" | "carried";

const touchKey = (title: string, idx: number) => `${title}\x00${idx}`;

export function OpenView({ onOpen, onCloseItem, onMarkCarried, onClose }: Props) {
  const [groups, setGroups] = useState<Grouped[] | null>(null);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState(0);
  const [touched, setTouched] = useState<Map<string, TouchKind>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const titles = await api.listNotes();
      const out: Grouped[] = [];
      let n = 0;
      for (const title of titles) {
        const { content } = await api.readNote(title);
        const items = collectOpenItems(title, parseMarkdown(content));
        if (items.length > 0) {
          out.push({ title, items });
          n += items.length;
        }
      }
      if (cancelled) return;
      out.sort((a, b) => a.title.localeCompare(b.title));
      setGroups(out);
      setTotal(n);
      setSelected(0);
    })();
    return () => { cancelled = true; };
  }, []);

  // Build a flat list so arrow keys traverse across groups.
  const flat: { title: string; item: OpenItem; indexInNote: number }[] = [];
  for (const g of groups ?? []) {
    g.items.forEach((item, indexInNote) => {
      flat.push({ title: g.title, item, indexInNote });
    });
  }

  const pick = (title: string, idx: number) => { onOpen(title, idx); onClose(); };

  // Items remain in place after d/x so you can see what you did.
  // Undo at the app level (⌘Z) restores the file; re-opening the view rescans.
  const touch = (title: string, idx: number, kind: TouchKind) => {
    setTouched((prev) => {
      const next = new Map(prev);
      next.set(touchKey(title, idx), kind);
      return next;
    });
  };

  const closeItem = async (title: string, indexInNote: number) => {
    if (touched.has(touchKey(title, indexInNote))) return;
    touch(title, indexInNote, "closed");
    await onCloseItem(title, indexInNote);
  };

  const carryItem = async (title: string, indexInNote: number) => {
    if (touched.has(touchKey(title, indexInNote))) return;
    touch(title, indexInNote, "carried");
    await onMarkCarried(title, indexInNote);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected((s) => Math.min(s + 1, flat.length - 1)); return; }
    if (e.key === "ArrowUp")   { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); return; }
    const hit = flat[selected];
    if (!hit) return;
    if (e.key === "Enter") { pick(hit.title, hit.indexInNote); return; }
    if (e.key.toLowerCase() === "d") {
      e.preventDefault();
      void closeItem(hit.title, hit.indexInNote);
    }
    if (e.key.toLowerCase() === "x") {
      e.preventDefault();
      void carryItem(hit.title, hit.indexInNote);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="open-modal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKey}
        tabIndex={0}
        ref={(el) => el?.focus()}
      >
        <div className="open-header">
          <span className="open-title">Open items</span>
          {groups !== null && <span className="open-count">{total}</span>}
        </div>

        {groups === null && <div className="open-empty">Scanning vault…</div>}
        {groups !== null && groups.length === 0 && (
          <div className="open-empty">Nothing open.</div>
        )}
        {groups !== null && groups.length > 0 && (
          <div className="open-list">
            {(() => {
              let cursor = 0;
              return groups.map((g) => (
                <section key={g.title} className="open-group">
                  <div className="open-group-title">{g.title}</div>
                  <ul>
                    {g.items.map((it, i) => {
                      const myIndex = cursor++;
                      const isSel = myIndex === selected;
                      const tk = touched.get(touchKey(g.title, i));
                      const cls = [
                        isSel ? "selected" : "",
                        tk === "closed" ? "touched-closed" : "",
                        tk === "carried" ? "touched-carried" : "",
                      ].filter(Boolean).join(" ");
                      return (
                        <li key={`${g.title}-${i}`} className={cls}>
                          <button
                            onClick={() => pick(g.title, i)}
                            onMouseEnter={() => setSelected(myIndex)}
                          >
                            <span className={`state-pill state-${it.state.toLowerCase()}`}>
                              {tk === "closed" ? "✓" : tk === "carried" ? "↺" : stateGlyph(it.state)}
                            </span>
                            <span className="open-body">
                              {it.path.length > 0 && (
                                <span className="open-crumbs">
                                  {it.path.join(" › ")}
                                  <span className="open-crumbs-sep"> › </span>
                                </span>
                              )}
                              <span className="open-text">
                                {it.text || <em className="open-placeholder">(empty)</em>}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ));
            })()}
          </div>
        )}

        <div className="open-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
          <span><kbd>↵</kbd> jump</span>
          <span><kbd>d</kbd> close</span>
          <span><kbd>x</kbd> carry</span>
          <span><kbd>⌘Z</kbd> undo</span>
          <span><kbd>esc</kbd> exit</span>
        </div>
      </div>
    </div>
  );
}

function stateGlyph(s: OpenState): string {
  switch (s) {
    case "TODO":     return "☐";
    case "DOING":    return "▶";
    case "QUESTION": return "?";
    case "WAITING":  return "…";
    case "IDEA":     return "💡";
  }
}
