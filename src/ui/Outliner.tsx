import { useEffect, useMemo, useRef, useState } from "react";
import {
  type Block,
  type Properties,
  type TodoState,
  ancestorIdsOf,
  cycleFamily,
  cycleState,
  findByRefId,
  indent,
  insertAfter,
  insertBlocksAfter,
  moveDown,
  moveUp,
  newBlock,
  outdent,
  parseCodeBlock,
  parseInline,
  parseMarkdown,
  regenerateIds,
  renumberPastedRefs,
  renderedToSourceOffset,
  removeBlock,
  removeBlocks,
  selectionRoots,
  serializeMarkdown,
  setState,
  updateText,
} from "../core";
import { BlockRefPicker, buildCandidates } from "./BlockRefPicker";
import * as api from "./api";

export type CollapsedIds = { has(id: string): boolean };

type OutlinerProps = {
  blocks: Block[];
  setBlocks: (b: Block[]) => void;
  focusedId: string | null;
  setFocusedId: (id: string | null) => void;
  onOpenLink: (title: string) => void;
  collapsedIds: CollapsedIds;
  toggleCollapse: (id: string) => void;
  expandIds: (ids: string[]) => void;
  showProperties: boolean;
  /** Block to visually mark as "today" (e.g. Monday block in this week's note). */
  todayBlockId?: string | null;
  /**
   * When set (e.g. after picking a result in the ⌘K modal), the in-note
   * find bar opens pre-populated with the query so the user lands at the
   * exact matching block. `nonce` bumps on every trigger so the effect
   * re-fires even if the query text is unchanged.
   */
  pendingFind?: { query: string; nonce: number } | null;
};

type SearchContext = {
  query: string;
  matchSet: Set<string>;
  currentId: string | null;
};

/**
 * Given a click point, compute the caret offset (in characters) within
 * `root`'s rendered textContent. Returns null if the click didn't land
 * inside any text node belonging to `root`.
 */
function caretOffsetInElement(
  root: HTMLElement,
  clientX: number,
  clientY: number,
): number | null {
  type DocAny = Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => {
      offsetNode: Node;
      offset: number;
    } | null;
  };
  const doc = document as DocAny;
  let node: Node | null = null;
  let offset = 0;
  if (doc.caretRangeFromPoint) {
    const r = doc.caretRangeFromPoint(clientX, clientY);
    if (!r) return null;
    node = r.startContainer;
    offset = r.startOffset;
  } else if (doc.caretPositionFromPoint) {
    const p = doc.caretPositionFromPoint(clientX, clientY);
    if (!p) return null;
    node = p.offsetNode;
    offset = p.offset;
  } else {
    return null;
  }
  if (!node || !root.contains(node)) return null;
  // If the hit landed on an element node (e.g. the preview itself or a
  // ::before pseudo), walk to the nearest preceding text node inside it.
  let cum = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const tn = walker.currentNode as Text;
    if (tn === node) return cum + offset;
    cum += tn.nodeValue?.length ?? 0;
  }
  // Fallback: offset was relative to an element, not a text node. Use the
  // accumulated text length (i.e. end of everything we traversed).
  return cum;
}

/** Flatten blocks in visual order, skipping children of collapsed blocks. */
function visibleFlat(blocks: Block[], collapsed: CollapsedIds): Block[] {
  const out: Block[] = [];
  const walk = (list: Block[]) => {
    for (const b of list) {
      out.push(b);
      if (!collapsed.has(b.id)) walk(b.children);
    }
  };
  walk(blocks);
  return out;
}

/** Looks like our markdown format: every non-empty line starts with `-`
 *  or whitespace+`-`, and there is more than one such line (single-line
 *  pastes go through the native text-paste path so plain text isn't
 *  hijacked). */
function isBulkOutlineClipboard(text: string): boolean {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return false;
  return lines.every((l) => /^\s*-/.test(l));
}

export function Outliner(props: OutlinerProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const anchorIdRef = useRef<string | null>(null);
  const dragActiveRef = useRef(false);
  // If a drag ends back on its anchor, a click still fires — suppress it
  // so the block-preview's onClick doesn't re-focus and clear selection.
  const suppressClickRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const { blocks, collapsedIds, focusedId, setBlocks, setFocusedId, expandIds } = props;

  // ── in-note search ──────────────────────────────────────────────────────
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [matchIdx, setMatchIdx] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const matchIds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!searchOpen || !q) return [] as string[];
    const out: string[] = [];
    const walk = (list: Block[]) => {
      for (const b of list) {
        if (b.text.toLowerCase().includes(q)) out.push(b.id);
        walk(b.children);
      }
    };
    walk(blocks);
    return out;
  }, [blocks, searchOpen, searchQuery]);

  const matchSet = useMemo(() => new Set(matchIds), [matchIds]);
  const currentMatchId = matchIds[matchIdx] ?? null;
  const searchCtx: SearchContext | null = searchOpen && searchQuery.trim()
    ? { query: searchQuery.trim(), matchSet, currentId: currentMatchId }
    : null;

  // Reset match index when query changes.
  useEffect(() => { setMatchIdx(0); }, [searchQuery, searchOpen]);

  // When the current match changes, expand ancestors and scroll it into view.
  useEffect(() => {
    if (!currentMatchId) return;
    const ancs = ancestorIdsOf(blocks, currentMatchId);
    if (ancs.length > 0) expandIds(ancs);
    requestAnimationFrame(() => {
      const el = document.querySelector(
        `[data-block-id="${currentMatchId}"]`,
      ) as HTMLElement | null;
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }, [currentMatchId]);

  // Seed the find bar when the app forwards a ⌘K query.
  useEffect(() => {
    if (!props.pendingFind) return;
    setSearchOpen(true);
    setSearchQuery(props.pendingFind.query);
  }, [props.pendingFind]);

  // ⌘F / Ctrl+F toggles the search bar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setSearchOpen(true);
        requestAnimationFrame(() => {
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const closeSearch = () => { setSearchOpen(false); setSearchQuery(""); };
  const stepMatch = (delta: number) => {
    if (matchIds.length === 0) return;
    setMatchIdx((i) => (i + delta + matchIds.length) % matchIds.length);
  };

  // Any focus landing on a block clears the block selection — the user is
  // back to editing a single block.
  useEffect(() => {
    if (focusedId !== null) setSelectedIds(new Set());
  }, [focusedId]);

  const blockIdFromTarget = (t: EventTarget | null): string | null => {
    let el = t as HTMLElement | null;
    while (el) {
      if (el.dataset && el.dataset.blockId) return el.dataset.blockId;
      el = el.parentElement;
    }
    return null;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const id = blockIdFromTarget(e.target);
    if (!id) return;
    anchorIdRef.current = id;
    dragActiveRef.current = false;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const anchor = anchorIdRef.current;
    if (!anchor) return;
    const current = blockIdFromTarget(e.target);
    if (!current) return;
    if (!dragActiveRef.current && current === anchor) return;
    if (!dragActiveRef.current) {
      dragActiveRef.current = true;
      if (document.activeElement instanceof HTMLInputElement) {
        document.activeElement.blur();
      }
      window.getSelection()?.removeAllRanges();
      setFocusedId(null);
    }
    const flat = visibleFlat(blocks, collapsedIds).map((b) => b.id);
    const ai = flat.indexOf(anchor);
    const ci = flat.indexOf(current);
    if (ai < 0 || ci < 0) return;
    const [lo, hi] = ai <= ci ? [ai, ci] : [ci, ai];
    setSelectedIds(new Set(flat.slice(lo, hi + 1)));
  };

  // A drag that ends outside the outliner still needs to clear state.
  useEffect(() => {
    const onUp = () => {
      if (dragActiveRef.current) suppressClickRef.current = true;
      anchorIdRef.current = null;
      dragActiveRef.current = false;
    };
    document.addEventListener("mouseup", onUp);
    return () => document.removeEventListener("mouseup", onUp);
  }, []);

  const handleClickCapture = (e: React.MouseEvent) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      e.stopPropagation();
    }
  };

  // Selection-level keys: Esc clears; Backspace/Delete removes.
  useEffect(() => {
    if (selectedIds.size === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setSelectedIds(new Set());
        return;
      }
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        const { tree, prevId } = removeBlocks(blocks, selectedIds);
        const safeTree = tree.length === 0 ? [newBlock()] : tree;
        setBlocks(safeTree);
        setSelectedIds(new Set());
        setFocusedId(prevId ?? safeTree[0].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [blocks, selectedIds, setBlocks, setFocusedId]);

  // Copy: serialize selection subtrees to markdown.
  useEffect(() => {
    if (selectedIds.size === 0) return;
    const onCopy = (e: ClipboardEvent) => {
      const roots = selectionRoots(blocks, selectedIds);
      if (roots.length === 0) return;
      e.clipboardData?.setData("text/plain", serializeMarkdown(roots));
      e.preventDefault();
    };
    document.addEventListener("copy", onCopy);
    return () => document.removeEventListener("copy", onCopy);
  }, [blocks, selectedIds]);

  // Paste: if the clipboard looks like a bulk outline, splice it in.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData("text/plain");
      if (!text || !isBulkOutlineClipboard(text)) return;
      const parsed = parseMarkdown(text);
      if (parsed.length === 0) return;
      e.preventDefault();
      const fresh = renumberPastedRefs(blocks, regenerateIds(parsed));
      const { tree, lastId } = insertBlocksAfter(blocks, focusedId, fresh);
      setBlocks(tree);
      setSelectedIds(new Set());
      if (lastId) setFocusedId(lastId);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [blocks, focusedId, setBlocks, setFocusedId]);

  const onJumpToRef = (num: number) => {
    const target = findByRefId(blocks, num);
    if (!target) return;
    const ancs = ancestorIdsOf(blocks, target.id);
    if (ancs.length > 0) expandIds(ancs);
    setFocusedId(target.id);
    requestAnimationFrame(() => {
      const el = document.querySelector(
        `[data-block-id="${target.id}"]`,
      ) as HTMLElement | null;
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  };

  const childProps = { ...props, selectedIds, search: searchCtx, onJumpToRef };

  return (
    <div
      ref={rootRef}
      className="outliner"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onClickCapture={handleClickCapture}
    >
      {searchOpen && (
        <NoteSearchBar
          inputRef={searchInputRef}
          query={searchQuery}
          setQuery={setSearchQuery}
          matchCount={matchIds.length}
          matchIdx={matchIdx}
          onNext={() => stepMatch(1)}
          onPrev={() => stepMatch(-1)}
          onClose={closeSearch}
        />
      )}
      <BlockList {...childProps} list={props.blocks} />
    </div>
  );
}

function NoteSearchBar({
  inputRef, query, setQuery, matchCount, matchIdx, onNext, onPrev, onClose,
}: {
  inputRef: React.RefObject<HTMLInputElement>;
  query: string;
  setQuery: (v: string) => void;
  matchCount: number;
  matchIdx: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}) {
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) onPrev(); else onNext();
    }
  };
  const counter = query.trim()
    ? matchCount === 0 ? "No matches" : `${matchIdx + 1} / ${matchCount}`
    : "";
  return (
    <div className="note-search">
      <input
        ref={inputRef}
        className="note-search-input"
        placeholder="Find in note…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKey}
      />
      <span className="note-search-count">{counter}</span>
      <button
        type="button"
        className="note-search-btn"
        onClick={onPrev}
        disabled={matchCount === 0}
        title="Previous match (Shift+Enter)"
      >↑</button>
      <button
        type="button"
        className="note-search-btn"
        onClick={onNext}
        disabled={matchCount === 0}
        title="Next match (Enter)"
      >↓</button>
      <button
        type="button"
        className="note-search-btn"
        onClick={onClose}
        title="Close (Esc)"
      >✕</button>
    </div>
  );
}

type BlockRowSharedProps = OutlinerProps & {
  selectedIds: Set<string>;
  search: SearchContext | null;
  onJumpToRef: (num: number) => void;
};
type BlockListProps = BlockRowSharedProps & { list: Block[] };

function BlockList({ list, ...rest }: BlockListProps) {
  return (
    <ul className="blocks">
      {list.map((b) => (
        <BlockRow key={b.id} block={b} {...rest} />
      ))}
    </ul>
  );
}

function BlockRow({
  block,
  ...props
}: BlockRowSharedProps & { block: Block }) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pendingCaretRef = useRef<number | null>(null);
  const isFocused = props.focusedId === block.id;
  const isCollapsed = props.collapsedIds.has(block.id);
  const hasChildren = block.children.length > 0;
  const isSelected = props.selectedIds.has(block.id);

  // ── block-ref picker state ────────────────────────────────────────────────
  // Open when user types `$`. `dollarPos` is the index of the `$` in the
  // textarea value; `query` is the digits typed after it. Closes on Esc,
  // when caret leaves the trigger range, or when user types non-digits.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerDollarPos, setPickerDollarPos] = useState(0);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerSel, setPickerSel] = useState(0);
  const closePicker = () => { setPickerOpen(false); setPickerQuery(""); setPickerSel(0); };

  const pickerCandidates = useMemo(
    () => pickerOpen ? buildCandidates(props.blocks, pickerQuery, block.id) : [],
    [pickerOpen, pickerQuery, props.blocks, block.id],
  );

  useEffect(() => { setPickerSel(0); }, [pickerQuery, pickerOpen]);
  // Clamp selection if candidate list shrinks.
  useEffect(() => {
    if (pickerSel >= pickerCandidates.length) setPickerSel(Math.max(0, pickerCandidates.length - 1));
  }, [pickerCandidates.length, pickerSel]);

  const insertPickedRef = (num: number) => {
    const el = inputRef.current;
    if (!el) { closePicker(); return; }
    const val = el.value;
    const before = val.slice(0, pickerDollarPos);
    const after = val.slice(pickerDollarPos + 1 + pickerQuery.length);
    const newVal = `${before}$${num}${after}`;
    const caretAfter = before.length + 1 + String(num).length;
    props.setBlocks(updateText(props.blocks, block.id, newVal));
    closePicker();
    requestAnimationFrame(() => {
      inputRef.current?.setSelectionRange(caretAfter, caretAfter);
    });
  };

  useEffect(() => {
    if (isFocused && inputRef.current) {
      inputRef.current.focus();
      if (pendingCaretRef.current != null) {
        const pos = Math.min(pendingCaretRef.current, inputRef.current.value.length);
        pendingCaretRef.current = null;
        inputRef.current.setSelectionRange(pos, pos);
      }
    }
  }, [isFocused]);

  // Auto-grow the textarea so long lines wrap across multiple visual rows.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [block.text, isFocused]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (pickerOpen) {
      if (e.key === "Escape") {
        e.preventDefault();
        closePicker();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setPickerSel((s) => Math.min(s + 1, Math.max(0, pickerCandidates.length - 1)));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setPickerSel((s) => Math.max(0, s - 1));
        return;
      }
      if (e.key === "Enter") {
        const pick = pickerCandidates[pickerSel];
        if (pick) {
          e.preventDefault();
          insertPickedRef(pick.num);
          return;
        }
        // No candidate — fall through to normal Enter (split block).
      }
    }
    if (e.key === "Enter" && e.altKey) {
      e.preventDefault();
      props.setBlocks(setState(props.blocks, block.id, cycleFamily(block.state)));
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      props.setBlocks(setState(props.blocks, block.id, cycleState(block.state)));
    } else if (e.key === "Enter" && e.shiftKey) {
      // Let the textarea insert a literal newline (needed for code blocks
      // and any prose that wants multi-line content inside one block).
      // onChange will capture the updated value.
      return;
    } else if (e.key === "Enter") {
      e.preventDefault();
      // Split at the caret: text before stays in the current block, text
      // after moves into the new one (so Enter mid-line behaves like a
      // regular line break).
      const el = e.currentTarget;
      const pos = el.selectionStart ?? block.text.length;
      const before = block.text.slice(0, pos);
      const after = block.text.slice(pos);
      const blocksWithEdit = before === block.text
        ? props.blocks
        : updateText(props.blocks, block.id, before);
      // When collapsed, the children are hidden — inserting as the first
      // child would appear to do nothing. Force sibling in that case.
      const { tree, id } = insertAfter(
        blocksWithEdit,
        block.id,
        newBlock(after),
        { asSibling: isCollapsed },
      );
      props.setBlocks(tree);
      props.setFocusedId(id);
      if (after.length > 0) {
        requestAnimationFrame(() => {
          const next = document.querySelector(
            `[data-block-id="${id}"] .block-input`,
          ) as HTMLTextAreaElement | null;
          next?.setSelectionRange(0, 0);
        });
      }
    } else if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      const r = indent(props.blocks, block.id);
      if (r) {
        props.setBlocks(r.tree);
        props.setFocusedId(r.id);
        // The new parent may have been collapsed (collapsed-by-default
        // hides its freshly-added child). Expand it so the user can see
        // what they just indented.
        props.expandIds([r.parentId]);
      }
    } else if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      const r = outdent(props.blocks, block.id);
      if (r) { props.setBlocks(r.tree); props.setFocusedId(r.id); }
    } else if (e.key === "Backspace" && block.text === "") {
      e.preventDefault();
      const { tree, prevId } = removeBlock(props.blocks, block.id);
      props.setBlocks(tree);
      props.setFocusedId(prevId);
    } else if (e.key === "ArrowUp" && e.altKey) {
      e.preventDefault();
      const r = moveUp(props.blocks, block.id);
      if (r) { props.setBlocks(r.tree); props.setFocusedId(r.id); }
    } else if (e.key === "ArrowDown" && e.altKey) {
      e.preventDefault();
      const r = moveDown(props.blocks, block.id);
      if (r) { props.setBlocks(r.tree); props.setFocusedId(r.id); }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const flat = visibleFlat(props.blocks, props.collapsedIds);
      const idx = flat.findIndex((b) => b.id === block.id);
      if (idx > 0) props.setFocusedId(flat[idx - 1].id);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const flat = visibleFlat(props.blocks, props.collapsedIds);
      const idx = flat.findIndex((b) => b.id === block.id);
      if (idx < flat.length - 1) props.setFocusedId(flat[idx + 1].id);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const pos = e.target.selectionStart ?? val.length;
    if (pos >= 2 && val.slice(pos - 2, pos) === "[[") {
      const newVal = val.slice(0, pos) + "]]" + val.slice(pos);
      props.setBlocks(updateText(props.blocks, block.id, newVal));
      requestAnimationFrame(() => inputRef.current?.setSelectionRange(pos, pos));
      return;
    }
    // Block-ref picker: open when `$` was just typed, else update or close.
    if (!pickerOpen && pos >= 1 && val[pos - 1] === "$") {
      setPickerOpen(true);
      setPickerDollarPos(pos - 1);
      setPickerQuery("");
    } else if (pickerOpen) {
      // Caret must still be after `$`, with only digits between them.
      const between = val.slice(pickerDollarPos + 1, pos);
      if (
        pos <= pickerDollarPos
        || val[pickerDollarPos] !== "$"
        || !/^\d*$/.test(between)
      ) {
        closePicker();
      } else {
        setPickerQuery(between);
      }
    }
    props.setBlocks(updateText(props.blocks, block.id, val));
  };

  const cycleBlockState = () =>
    props.setBlocks(setState(props.blocks, block.id, cycleState(block.state)));

  const hasProps = Object.keys(block.properties).length > 0;

  const isToday = props.todayBlockId === block.id;
  const isCarried = block.properties.carried != null;
  const isMatch = props.search?.matchSet.has(block.id) ?? false;
  const isCurrentMatch = props.search?.currentId === block.id;
  const liClass = [
    "block",
    isToday ? "block-today" : "",
    isCarried ? "block-carried" : "",
    isSelected ? "block-selected" : "",
    isMatch ? "block-match" : "",
    isCurrentMatch ? "block-match-current" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <li className={liClass} data-block-id={block.id}>
      <div className="block-row">
        <CollapseToggle
          hasChildren={hasChildren}
          collapsed={isCollapsed}
          onToggle={() => props.toggleCollapse(block.id)}
        />
        {block.state !== null && (
          <StatePill state={block.state} onClick={cycleBlockState} />
        )}
        {isFocused ? (
          <div className="block-input-wrap">
            <textarea
              ref={inputRef}
              className="block-input"
              value={block.text}
              rows={1}
              onChange={handleChange}
              onKeyDown={handleKey}
              onBlur={() => { if (props.focusedId === block.id) props.setFocusedId(null); }}
            />
            {pickerOpen && (
              <BlockRefPicker
                candidates={pickerCandidates}
                query={pickerQuery}
                selectedIdx={pickerSel}
                setSelectedIdx={setPickerSel}
                onPick={insertPickedRef}
              />
            )}
          </div>
        ) : (
          <div
            className="block-preview"
            onMouseDown={(e) => {
              // Capture the caret position now, while the preview is still
              // in the DOM — after setFocusedId the preview unmounts.
              const root = e.currentTarget as HTMLElement;
              const rendered = caretOffsetInElement(root, e.clientX, e.clientY);
              pendingCaretRef.current =
                rendered == null ? null : renderedToSourceOffset(block.text, rendered);
            }}
            onClick={() => props.setFocusedId(block.id)}
          >
            {block.text === "" ? (
              <span className="block-placeholder" />
            ) : (
              renderBlockContent(block.text, props.onOpenLink, props.onJumpToRef, props.search?.query ?? null)
            )}
          </div>
        )}
      </div>
      {props.showProperties && hasProps && (
        <PropertyChips properties={block.properties} />
      )}
      {hasChildren && !isCollapsed && (
        <BlockList {...props} list={block.children} />
      )}
    </li>
  );
}

function PropertyChips({ properties }: { properties: Properties }) {
  const order = ["created", "started", "done"];
  const keys = Object.keys(properties);
  const known = order.filter((k) => k in properties);
  const rest = keys.filter((k) => !order.includes(k)).sort();
  return (
    <div className="property-chips">
      {[...known, ...rest].map((k) => (
        <span key={k} className={`property-chip prop-${k}`}>
          <span className="prop-key">{k}</span>
          <span className="prop-value">{formatPropValue(properties[k])}</span>
        </span>
      ))}
    </div>
  );
}

function formatPropValue(v: string): string {
  // Friendlier display for ISO-like timestamps (YYYY-MM-DDTHH:MM…).
  const m = v.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return m ? `${m[1]} ${m[2]}` : v;
}

function renderBlockContent(
  text: string,
  onOpenLink: (t: string) => void,
  onJumpToRef: (num: number) => void,
  highlight: string | null,
) {
  const fenced = parseCodeBlock(text);
  if (fenced) {
    const hl = highlightText(fenced.code, highlight, 0);
    return (
      <pre className={`code-block${fenced.lang ? ` lang-${fenced.lang}` : ""}`}>
        {fenced.lang && <span className="code-lang">{fenced.lang}</span>}
        <code>{hl}</code>
      </pre>
    );
  }
  return renderInline(text, onOpenLink, onJumpToRef, highlight);
}

function renderInline(
  text: string,
  onOpenLink: (t: string) => void,
  onJumpToRef: (num: number) => void,
  highlight: string | null,
) {
  const hl = (s: string, key: number) => highlightText(s, highlight, key);
  return parseInline(text).map((part, i) => {
    switch (part.type) {
      case "link":
        return (
          <a key={i} className="wiki-link" onClick={(e) => { e.stopPropagation(); onOpenLink(part.title); }}>
            {hl(part.title, i)}
          </a>
        );
      case "bold":   return <strong key={i}>{hl(part.value, i)}</strong>;
      case "italic": return <em key={i}>{hl(part.value, i)}</em>;
      case "tag":    return <span key={i} className="inline-tag">#{hl(part.value, i)}</span>;
      case "code":   return <code key={i} className="inline-code">{hl(part.value, i)}</code>;
      case "blockref":
        return (
          <a
            key={i}
            className="block-ref"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onJumpToRef(part.num); }}
            title={`Jump to block $${part.num}`}
          >
            ${part.num}
          </a>
        );
      case "url":
        return (
          <a
            key={i}
            className="ext-link"
            href={part.value}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              // Stop the preview's click-to-focus and open externally
              // instead of navigating the webview.
              e.preventDefault();
              e.stopPropagation();
              void api.openExternal(part.value);
            }}
          >
            {hl(part.value, i)}
          </a>
        );
      default:       return <span key={i}>{hl(part.value, i)}</span>;
    }
  });
}

function highlightText(text: string, query: string | null, keyBase: number) {
  if (!query) return text;
  const q = query.toLowerCase();
  const hay = text.toLowerCase();
  const parts: React.ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < text.length) {
    const hit = hay.indexOf(q, i);
    if (hit < 0) { parts.push(text.slice(i)); break; }
    if (hit > i) parts.push(text.slice(i, hit));
    parts.push(
      <mark key={`${keyBase}-${k++}`} className="search-hit">
        {text.slice(hit, hit + q.length)}
      </mark>,
    );
    i = hit + q.length;
  }
  return <>{parts}</>;
}

function CollapseToggle({
  hasChildren, collapsed, onToggle,
}: {
  hasChildren: boolean; collapsed: boolean; onToggle: () => void;
}) {
  if (!hasChildren) return <span className="bullet">•</span>;
  return (
    <button type="button" className="collapse-toggle" onClick={(e) => { e.stopPropagation(); onToggle(); }} title={collapsed ? "Expand" : "Collapse"}>
      {collapsed ? "▶" : "▼"}
    </button>
  );
}

function StatePill({ state, onClick }: { state: TodoState; onClick: () => void }) {
  const label =
    state === "DONE" ? "✓"
    : state === "ANSWERED" ? "✓?"
    : state === "REMEMBER" ? "🧠"
    : state!;
  return (
    <button
      type="button"
      className={`state-pill state-${state!.toLowerCase()}`}
      onClick={onClick}
      title={`${state} — ⌘Enter to cycle, ⌥Enter to switch family`}
    >
      {label}
    </button>
  );
}

const EXPANDED_LRU_CAP = 5;

export function useCollapse() {
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const expandedSet = new Set(expandedIds);
  const collapsedIds: CollapsedIds = {
    has: (id: string) => !expandedSet.has(id),
  };
  const toggleCollapse = (id: string) =>
    setExpandedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [id, ...prev].slice(0, EXPANDED_LRU_CAP);
    });
  const expandIds = (ids: string[]) =>
    setExpandedIds((prev) => {
      const fresh = ids.filter((id) => !prev.includes(id));
      if (fresh.length === 0) return prev;
      return [...fresh, ...prev];
    });
  return { collapsedIds, toggleCollapse, expandIds };
}
