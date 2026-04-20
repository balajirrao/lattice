import { useEffect, useRef, useState } from "react";
import {
  type Block,
  type Properties,
  type TodoState,
  cycleFamily,
  cycleState,
  indent,
  insertAfter,
  moveDown,
  moveUp,
  newBlock,
  outdent,
  parseInline,
  removeBlock,
  setState,
  updateText,
} from "../core";

export type CollapsedIds = Set<string>;

type OutlinerProps = {
  blocks: Block[];
  setBlocks: (b: Block[]) => void;
  focusedId: string | null;
  setFocusedId: (id: string | null) => void;
  onOpenLink: (title: string) => void;
  collapsedIds: CollapsedIds;
  toggleCollapse: (id: string) => void;
  showProperties: boolean;
  /** Block to visually mark as "today" (e.g. Monday block in this week's note). */
  todayBlockId?: string | null;
};

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

export function Outliner(props: OutlinerProps) {
  return (
    <div className="outliner">
      <BlockList {...props} list={props.blocks} />
    </div>
  );
}

function BlockList({ list, ...rest }: OutlinerProps & { list: Block[] }) {
  return (
    <ul className="blocks">
      {list.map((b) => (
        <BlockRow key={b.id} block={b} {...rest} />
      ))}
    </ul>
  );
}

function BlockRow({ block, ...props }: OutlinerProps & { block: Block }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isFocused = props.focusedId === block.id;
  const isCollapsed = props.collapsedIds.has(block.id);
  const hasChildren = block.children.length > 0;

  useEffect(() => {
    if (isFocused && inputRef.current) inputRef.current.focus();
  }, [isFocused]);

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && e.altKey) {
      e.preventDefault();
      props.setBlocks(setState(props.blocks, block.id, cycleFamily(block.state)));
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      props.setBlocks(setState(props.blocks, block.id, cycleState(block.state)));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const nb = newBlock();
      // When collapsed, the children are hidden — inserting as the first
      // child would appear to do nothing. Force sibling in that case.
      const { tree, id } = insertAfter(props.blocks, block.id, nb, {
        asSibling: isCollapsed,
      });
      props.setBlocks(tree);
      props.setFocusedId(id);
    } else if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      const r = indent(props.blocks, block.id);
      if (r) { props.setBlocks(r.tree); props.setFocusedId(r.id); }
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const pos = e.target.selectionStart ?? val.length;
    if (pos >= 2 && val.slice(pos - 2, pos) === "[[") {
      const newVal = val.slice(0, pos) + "]]" + val.slice(pos);
      props.setBlocks(updateText(props.blocks, block.id, newVal));
      requestAnimationFrame(() => inputRef.current?.setSelectionRange(pos, pos));
      return;
    }
    props.setBlocks(updateText(props.blocks, block.id, val));
  };

  const cycleBlockState = () =>
    props.setBlocks(setState(props.blocks, block.id, cycleState(block.state)));

  const hasProps = Object.keys(block.properties).length > 0;

  const isToday = props.todayBlockId === block.id;
  const isCarried = block.properties.carried != null;
  const liClass = ["block", isToday ? "block-today" : "", isCarried ? "block-carried" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <li className={liClass}>
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
          <input
            ref={inputRef}
            className="block-input"
            value={block.text}
            onChange={handleChange}
            onKeyDown={handleKey}
            onBlur={() => { if (props.focusedId === block.id) props.setFocusedId(null); }}
          />
        ) : (
          <div className="block-preview" onClick={() => props.setFocusedId(block.id)}>
            {block.text === "" ? (
              <span className="block-placeholder" />
            ) : (
              renderInline(block.text, props.onOpenLink)
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

function renderInline(text: string, onOpenLink: (t: string) => void) {
  return parseInline(text).map((part, i) => {
    switch (part.type) {
      case "link":
        return (
          <a key={i} className="wiki-link" onClick={(e) => { e.stopPropagation(); onOpenLink(part.title); }}>
            {part.title}
          </a>
        );
      case "bold":   return <strong key={i}>{part.value}</strong>;
      case "italic": return <em key={i}>{part.value}</em>;
      case "tag":    return <span key={i} className="inline-tag">#{part.value}</span>;
      default:       return <span key={i}>{part.value}</span>;
    }
  });
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
  const label = state === "DONE" ? "✓" : state === "ANSWERED" ? "✓?" : state!;
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

export function useCollapse() {
  const [collapsedIds, setCollapsedIds] = useState<CollapsedIds>(new Set());
  const toggleCollapse = (id: string) =>
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  return { collapsedIds, toggleCollapse };
}
