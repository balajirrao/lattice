import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  type Block,
  type UndoSnapshot,
  closingState,
  collectOpenItems,
  formatWeekRange,
  isWeeklyTitle,
  newBlock,
  parseMarkdown,
  popSnapshot,
  pushSnapshot,
  serializeMarkdown,
  setProperty,
  setState,
  titleToWeekId,
  weekId,
  weekdayFor,
} from "../core";
import { Outliner, useCollapse } from "./Outliner";
import { VaultPicker } from "./VaultPicker";
import { SearchModal } from "./SearchModal";
import { OpenView } from "./OpenView";
import { CommandPalette } from "./CommandPalette";
import { useAutoUpdate } from "./useAutoUpdate";
import * as api from "./api";
import {
  type Workflow,
  type WorkflowContext,
  workflows,
} from "../workflows";

type Phase = "loading" | "pick-vault" | "ready";

/**
 * For the current week's note, locate the day block under the "Dailies"
 * parent that matches today's weekday. Returns null for non-weekly notes,
 * non-current weeks, or when the template has been removed.
 */
function todayDayBlockId(title: string | null, blocks: Block[]): string | null {
  if (!title || !isWeeklyTitle(title)) return null;
  const now = new Date();
  if (titleToWeekId(title) !== weekId(now)) return null;
  const dailies = blocks.find((b) => b.text === "Dailies");
  if (!dailies) return null;
  const today = weekdayFor(now);
  const hit = dailies.children.find((b) => b.text === today);
  return hit?.id ?? null;
}

function initialFocusId(title: string, blocks: Block[]): string {
  return todayDayBlockId(title, blocks) ?? blocks[0].id;
}

function zettelTitle(): string {
  const now = new Date();
  const pad = (n: number, l = 2) => n.toString().padStart(l, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
}

export function App() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [recentVaults, setRecentVaults] = useState<string[]>([]);

  const [allTitles, setAllTitles] = useState<string[]>([]);
  const [favorites, setFavoritesState] = useState<string[]>([]);
  const [currentTitle, setCurrentTitle] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const { collapsedIds, toggleCollapse, expandIds } = useCollapse();
  const [pendingFind, setPendingFind] = useState<{ query: string; nonce: number } | null>(null);
  const findNonceRef = useRef(0);

  const [newTitle, setNewTitle] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  const [showSearch, setShowSearch] = useState(false);
  const [showOpen, setShowOpen] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [showProperties, setShowProperties] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [backlinks, setBacklinks] = useState<string[]>([]);
  const updater = useAutoUpdate();

  const skipAutosaveRef = useRef(false);

  // Undo: a snapshot captures the "before" state of a single mutation.
  // Editor snapshots come from autosave ticks; disk snapshots come from
  // cross-note writes (close-item, mark-carried).
  type UndoPayload =
    | { kind: "editor"; title: string; blocks: Block[] }
    | { kind: "disk"; title: string; content: string };
  const undoStackRef = useRef<UndoSnapshot<UndoPayload>[]>([]);
  const lastSavedBlocksRef = useRef<Block[]>([]);
  const MAX_UNDO = 50;
  const pushUndo = (snap: UndoSnapshot<UndoPayload>) => {
    undoStackRef.current = pushSnapshot(undoStackRef.current, snap, MAX_UNDO);
  };

  // ── boot ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    api.getConfig().then((cfg) => {
      setRecentVaults(cfg.recent_vaults);
      if (cfg.current_vault) {
        setPhase("ready");
        refreshList();
        api.getFavorites().then(setFavoritesState).catch(() => {});
      } else {
        setPhase("pick-vault");
      }
    });
  }, []);

  const onVaultSelected = useCallback((path: string) => {
    setPhase("ready");
    setRecentVaults((prev) => [path, ...prev.filter((v) => v !== path)].slice(0, 10));
    undoStackRef.current = [];
    refreshList();
    api.getFavorites().then(setFavoritesState).catch(() => {});
  }, []);

  // ── note list ─────────────────────────────────────────────────────────────

  const refreshList = useCallback(async () => {
    try {
      const list = await api.listNotes();
      setAllTitles(list);
    } catch {
      /* vault not ready yet */
    }
  }, []);

  // ── open a note ───────────────────────────────────────────────────────────

  const openNote = useCallback(
    async (title: string, opts?: { openItemIndex?: number; findQuery?: string }) => {
      const { content } = await api.readNote(title);
      const parsed = parseMarkdown(content);
      const initial = parsed.length > 0 ? parsed : [newBlock()];
      let requestedFocus: string | null = null;
      if (opts?.openItemIndex != null) {
        const items = collectOpenItems(title, initial);
        requestedFocus = items[opts.openItemIndex]?.blockId ?? null;
      }
      skipAutosaveRef.current = true;
      setCurrentTitle(title);
      setBlocks(initial);
      lastSavedBlocksRef.current = initial;
      // If we're jumping to a search hit, skip the weekday / first-block
      // focus — the Outliner will scroll & focus the matching block.
      setFocusedId(opts?.findQuery ? null : (requestedFocus ?? initialFocusId(title, initial)));
      setEditingTitle(false);
      if (opts?.findQuery) {
        findNonceRef.current += 1;
        setPendingFind({ query: opts.findQuery, nonce: findNonceRef.current });
      }
      const links = await api.getBacklinks(title).catch(() => []);
      setBacklinks(links);
      await refreshList();
    },
    [refreshList],
  );

  const closeOpenItem = useCallback(
    async (title: string, indexInNote: number) => {
      if (currentTitle === title) {
        const items = collectOpenItems(title, blocks);
        const item = items[indexInNote];
        if (!item) return;
        setBlocks((prev) => setState(prev, item.blockId, closingState(item.state)));
      } else {
        const { content } = await api.readNote(title);
        const parsed = parseMarkdown(content);
        const items = collectOpenItems(title, parsed);
        const item = items[indexInNote];
        if (!item) return;
        pushUndo({ label: `close in ${title}`, payload: { kind: "disk", title, content } });
        const next = setState(parsed, item.blockId, closingState(item.state));
        await api.writeNote(title, serializeMarkdown(next));
      }
    },
    [blocks, currentTitle],
  );

  const markCarriedItem = useCallback(
    async (title: string, indexInNote: number) => {
      if (currentTitle === title) {
        const items = collectOpenItems(title, blocks);
        const item = items[indexInNote];
        if (!item) return;
        setBlocks((prev) => setProperty(prev, item.blockId, "carried", "1"));
      } else {
        const { content } = await api.readNote(title);
        const parsed = parseMarkdown(content);
        const items = collectOpenItems(title, parsed);
        const item = items[indexInNote];
        if (!item) return;
        pushUndo({ label: `carry in ${title}`, payload: { kind: "disk", title, content } });
        const next = setProperty(parsed, item.blockId, "carried", "1");
        await api.writeNote(title, serializeMarkdown(next));
      }
    },
    [blocks, currentTitle],
  );

  const undo = useCallback(async () => {
    const { snap, rest } = popSnapshot(undoStackRef.current);
    if (!snap) { setStatusMessage("Nothing to undo"); return; }
    undoStackRef.current = rest;
    const p = snap.payload;
    if (p.kind === "editor") {
      if (currentTitle === p.title) {
        skipAutosaveRef.current = true;
        setBlocks(p.blocks);
        lastSavedBlocksRef.current = p.blocks;
      }
      await api.writeNote(p.title, serializeMarkdown(p.blocks));
    } else {
      await api.writeNote(p.title, p.content);
      if (currentTitle === p.title) {
        const parsed = parseMarkdown(p.content);
        skipAutosaveRef.current = true;
        setBlocks(parsed);
        lastSavedBlocksRef.current = parsed;
      }
    }
    setStatusMessage(`Undone: ${snap.label}`);
    await refreshList();
  }, [currentTitle, refreshList]);

  const createOrOpen = useCallback(
    async (title: string) => {
      const t = title.trim();
      if (!t) return;
      const existing = await api.listNotes().catch(() => [] as string[]);
      if (!existing.includes(t)) await api.writeNote(t, "");
      await openNote(t);
    },
    [openNote],
  );

  // ── note actions ──────────────────────────────────────────────────────────

  const onNewNote = async () => {
    const t = newTitle.trim();
    if (!t) return;
    await createOrOpen(t);
    setNewTitle("");
  };

  const openZettel = async () => {
    const title = zettelTitle();
    await api.writeNote(title, "");
    await openNote(title);
  };

  const deleteCurrentNote = async () => {
    if (!currentTitle) return;
    await api.deleteNote(currentTitle);
    setCurrentTitle(null);
    setBlocks([]);
    setBacklinks([]);
    await refreshList();
  };

  const startRename = () => {
    if (!currentTitle) return;
    setTitleDraft(currentTitle);
    setEditingTitle(true);
  };

  const commitRename = async () => {
    if (!currentTitle || !titleDraft.trim() || titleDraft === currentTitle) {
      setEditingTitle(false);
      return;
    }
    try {
      await api.renameNote(currentTitle, titleDraft.trim());
      setCurrentTitle(titleDraft.trim());
      await refreshList();
    } catch (e) {
      console.error("rename failed", e);
    }
    setEditingTitle(false);
  };

  const toggleFavorite = async () => {
    if (!currentTitle) return;
    const next = favorites.includes(currentTitle)
      ? favorites.filter((f) => f !== currentTitle)
      : [...favorites, currentTitle];
    setFavoritesState(next);
    await api.setFavorites(next);
  };

  const changeVault = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") {
      const cfg = await api.setVault(selected);
      onVaultSelected(selected);
      setRecentVaults(cfg.recent_vaults);
    }
  };

  // ── autosave ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!currentTitle) return;
    if (skipAutosaveRef.current) { skipAutosaveRef.current = false; return; }
    const title = currentTitle;
    const t = setTimeout(() => {
      const next = serializeMarkdown(blocks);
      const prev = serializeMarkdown(lastSavedBlocksRef.current);
      if (next === prev) return;
      pushUndo({ label: `edit in ${title}`, payload: { kind: "editor", title, blocks: lastSavedBlocksRef.current } });
      lastSavedBlocksRef.current = blocks;
      api.writeNote(title, next).then(refreshList);
    }, 400);
    return () => clearTimeout(t);
  }, [blocks, currentTitle, refreshList]);

  // ── workflows ─────────────────────────────────────────────────────────────

  const workflowCtx: WorkflowContext = useMemo(() => ({
    listNotes: api.listNotes,
    readNote: async (t) => (await api.readNote(t)).content,
    writeNote: api.writeNote,
    openNote,
    now: () => new Date(),
  }), [openNote]);

  const runWorkflow = useCallback(async (w: Workflow) => {
    setShowPalette(false);
    try {
      const res = await w.run(workflowCtx);
      setStatusMessage(res.message);
    } catch (e) {
      setStatusMessage(`Workflow failed: ${String(e)}`);
    }
  }, [workflowCtx]);

  useEffect(() => {
    if (!statusMessage) return;
    const t = setTimeout(() => setStatusMessage(null), 3500);
    return () => clearTimeout(t);
  }, [statusMessage]);

  useEffect(() => {
    const title = currentTitle ? `Lattice — ${currentTitle}` : "Lattice";
    void getCurrentWindow().setTitle(title);
  }, [currentTitle]);

  const startNewWeek = useCallback(() => {
    const w = workflows.find((x) => x.id === "start-new-week");
    if (w) void runWorkflow(w);
  }, [runWorkflow]);

  // ── keyboard global ───────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setShowPalette((s) => !s);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowSearch((s) => !s);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        setShowOpen((s) => !s);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        startNewWeek();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        void undo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [startNewWeek, undo]);

  // ── derived lists ─────────────────────────────────────────────────────────

  const weeklyTitles = allTitles.filter(isWeeklyTitle).sort().reverse();
  const coreTitles = allTitles.filter((t) => t.startsWith("core/")).sort();
  const otherTitles = allTitles.filter(
    (t) => !isWeeklyTitle(t) && !t.startsWith("core/") && !favorites.includes(t),
  );
  const isFav = currentTitle != null && favorites.includes(currentTitle);
  const currentWeekId = currentTitle ? titleToWeekId(currentTitle) : null;
  const todayId = todayDayBlockId(currentTitle, blocks);

  // ── render ────────────────────────────────────────────────────────────────

  if (phase === "loading") return <div className="loading">Loading…</div>;

  if (phase === "pick-vault") {
    return <VaultPicker recentVaults={recentVaults} onVaultSelected={onVaultSelected} />;
  }

  return (
    <div className="app">
      {showSearch && (
        <SearchModal
          onOpen={(title, query) => {
            void (async () => {
              const existing = await api.listNotes().catch(() => [] as string[]);
              if (!existing.includes(title)) await api.writeNote(title, "");
              await openNote(title, query ? { findQuery: query } : undefined);
            })();
          }}
          onClose={() => setShowSearch(false)}
        />
      )}
      {showOpen && (
        <OpenView
          onOpen={(title, idx) => openNote(title, { openItemIndex: idx })}
          onCloseItem={closeOpenItem}
          onMarkCarried={markCarriedItem}
          onClose={() => setShowOpen(false)}
        />
      )}
      {showPalette && (
        <CommandPalette
          workflows={workflows}
          onClose={() => setShowPalette(false)}
          onRun={runWorkflow}
        />
      )}
      {statusMessage && <div className="status-toast">{statusMessage}</div>}
      <UpdateBanner updater={updater} />


      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="sidebar-actions">
            <button onClick={() => setShowSearch(true)} title="Search (⌘K)">🔍</button>
            <button onClick={() => setShowOpen(true)} title="Open items (⌘O)">📋</button>
            <button onClick={() => setShowPalette(true)} title="Run workflow (⌘⇧P)">⚡</button>
            <button onClick={startNewWeek} title="Start / open this week">📆</button>
            <button onClick={openZettel} title="New Zettelkasten note">✦</button>
          </div>
          <div className="new-note">
            <input
              type="text"
              placeholder="New note…"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onNewNote(); }}
            />
            <button onClick={onNewNote} disabled={!newTitle.trim()}>+</button>
          </div>
        </div>

        <div className="sidebar-lists">
          {coreTitles.length > 0 && (
            <NoteSection
              label="📌 Core"
              titles={coreTitles}
              current={currentTitle}
              onOpen={openNote}
              displayName={(t) => t.replace("core/", "")}
            />
          )}
          {favorites.length > 0 && (
            <NoteSection
              label="⭐ Favorites"
              titles={favorites}
              current={currentTitle}
              onOpen={openNote}
              displayName={(t) => t}
            />
          )}
          {weeklyTitles.length > 0 && (
            <NoteSection
              label="📆 Weekly"
              titles={weeklyTitles}
              current={currentTitle}
              onOpen={openNote}
              displayName={(t) => titleToWeekId(t) ?? t}
            />
          )}
          <NoteSection
            label="📝 Notes"
            titles={otherTitles}
            current={currentTitle}
            onOpen={openNote}
            displayName={(t) => t}
          />
        </div>

        <div className="sidebar-footer">
          <button onClick={changeVault} className="vault-btn">
            Change vault
          </button>
        </div>
      </aside>

      <main className="main">
        {currentTitle ? (
          <>
            <header className="note-header">
              <div className="note-title-row">
                {editingTitle ? (
                  <input
                    className="title-input"
                    value={titleDraft}
                    autoFocus
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") setEditingTitle(false);
                    }}
                  />
                ) : (
                  <h1 onClick={startRename} title="Click to rename">{currentTitle}</h1>
                )}
                {currentWeekId && (
                  <span className="note-subtitle">{formatWeekRange(currentWeekId)}</span>
                )}
              </div>
              <div className="note-actions">
                <button
                  onClick={() => setShowProperties((s) => !s)}
                  className={showProperties ? "active" : ""}
                  title="Toggle block properties"
                >
                  🏷
                </button>
                <button onClick={toggleFavorite} title={isFav ? "Remove from favorites" : "Add to favorites"}>
                  {isFav ? "⭐" : "☆"}
                </button>
                <button className="danger" onClick={deleteCurrentNote}>Delete</button>
              </div>
            </header>

            <Outliner
              blocks={blocks}
              setBlocks={setBlocks}
              focusedId={focusedId}
              setFocusedId={setFocusedId}
              onOpenLink={createOrOpen}
              collapsedIds={collapsedIds}
              toggleCollapse={toggleCollapse}
              expandIds={expandIds}
              showProperties={showProperties}
              todayBlockId={todayId}
              pendingFind={pendingFind}
            />

            {backlinks.length > 0 && (
              <div className="backlinks">
                <h4>← Linked from</h4>
                <ul>
                  {backlinks.map((t) => (
                    <li key={t}>
                      <button onClick={() => openNote(t)}>{t}</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <div className="empty">
            <p>No note open.</p>
            <p>Create one or pick from the sidebar. <kbd>⌘K</kbd> to search.</p>
          </div>
        )}
      </main>
    </div>
  );
}

function UpdateBanner({ updater }: { updater: ReturnType<typeof useAutoUpdate> }) {
  const { status, install, dismiss } = updater;
  if (status.kind === "idle") return null;
  const body = (() => {
    switch (status.kind) {
      case "available":
        return (
          <>
            <span>Update available: v{status.update.version}</span>
            <button onClick={install}>Install</button>
            <button onClick={dismiss}>Later</button>
          </>
        );
      case "downloading":
        return <span>Downloading update…</span>;
      case "ready":
        return <span>Update installed — relaunching…</span>;
      case "error":
        return (
          <>
            <span>Update failed: {status.error}</span>
            <button onClick={dismiss}>Dismiss</button>
          </>
        );
    }
  })();
  return <div className="update-banner">{body}</div>;
}

function NoteSection({
  label, titles, current, onOpen, displayName,
}: {
  label: string;
  titles: string[];
  current: string | null;
  onOpen: (t: string) => void;
  displayName: (t: string) => string;
}) {
  const [collapsed, setCollapsed] = useState(true);
  return (
    <section className="note-section">
      <button className="section-header" onClick={() => setCollapsed((c) => !c)}>
        {collapsed ? "▶" : "▼"} {label}
      </button>
      {!collapsed && (
        <ul className="note-list">
          {titles.map((t) => (
            <li key={t}>
              <button className={t === current ? "active" : ""} onClick={() => onOpen(t)}>
                {displayName(t)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
