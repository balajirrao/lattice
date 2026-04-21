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

type Row = { title: string; item: OpenItem; indexInNote: number };
type TouchKind = "closed" | "carried";

const touchKey = (title: string, idx: number) => `${title}\x00${idx}`;

/** Descending by `created`; nulls last. Tie-break by note title, then index. */
function compareByCreatedDesc(a: Row, b: Row): number {
  const ac = a.item.created;
  const bc = b.item.created;
  if (ac && bc) {
    if (ac !== bc) return bc.localeCompare(ac);
  } else if (ac) {
    return -1;
  } else if (bc) {
    return 1;
  }
  const t = a.title.localeCompare(b.title);
  return t !== 0 ? t : a.indexInNote - b.indexInNote;
}

export function OpenView({ onOpen, onCloseItem, onMarkCarried, onClose }: Props) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [selected, setSelected] = useState(0);
  const [touched, setTouched] = useState<Map<string, TouchKind>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const titles = await api.listNotes();
      const all: Row[] = [];
      for (const title of titles) {
        const { content } = await api.readNote(title);
        const items = collectOpenItems(title, parseMarkdown(content));
        items.forEach((item, indexInNote) => {
          all.push({ title, item, indexInNote });
        });
      }
      if (cancelled) return;
      all.sort(compareByCreatedDesc);
      setRows(all);
      setSelected(0);
    })();
    return () => { cancelled = true; };
  }, []);

  const flat = rows ?? [];
  const total = flat.length;

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
          {rows !== null && <span className="open-count">{total}</span>}
        </div>

        {rows === null && <div className="open-empty">Scanning vault…</div>}
        {rows !== null && rows.length === 0 && (
          <div className="open-empty">Nothing open.</div>
        )}
        {rows !== null && rows.length > 0 && (
          <ul className="open-list open-flat">
            {flat.map((row, i) => {
              const { title, item: it, indexInNote } = row;
              const isSel = i === selected;
              const tk = touched.get(touchKey(title, indexInNote));
              const cls = [
                isSel ? "selected" : "",
                tk === "closed" ? "touched-closed" : "",
                tk === "carried" ? "touched-carried" : "",
              ].filter(Boolean).join(" ");
              return (
                <li key={`${title}-${indexInNote}`} className={cls}>
                  <button
                    onClick={() => pick(title, indexInNote)}
                    onMouseEnter={() => setSelected(i)}
                  >
                    <span className={`state-pill state-${it.state.toLowerCase()}`}>
                      {tk === "closed" ? "✓" : tk === "carried" ? "↺" : stateGlyph(it.state)}
                    </span>
                    <span className="open-body">
                      <span className="open-crumbs">
                        {title}
                        {it.path.length > 0 && (
                          <>
                            <span className="open-crumbs-sep"> › </span>
                            {it.path.join(" › ")}
                          </>
                        )}
                        <span className="open-crumbs-sep"> › </span>
                      </span>
                      <span className="open-text">
                        {it.text || <em className="open-placeholder">(empty)</em>}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
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
