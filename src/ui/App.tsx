import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  type Block,
  isWeeklyTitle,
  newBlock,
  parseMarkdown,
  serializeMarkdown,
  titleToWeekId,
} from "../core";
import { Outliner, useCollapse } from "./Outliner";
import { VaultPicker } from "./VaultPicker";
import { SearchModal } from "./SearchModal";
import { CommandPalette } from "./CommandPalette";
import { useAutoUpdate } from "./useAutoUpdate";
import * as api from "./api";
import {
  type Workflow,
  type WorkflowContext,
  workflows,
} from "../workflows";

type Phase = "loading" | "pick-vault" | "ready";

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
  const { collapsedIds, toggleCollapse } = useCollapse();

  const [newTitle, setNewTitle] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  const [showSearch, setShowSearch] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [showProperties, setShowProperties] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [backlinks, setBacklinks] = useState<string[]>([]);
  const updater = useAutoUpdate();

  const skipAutosaveRef = useRef(false);

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
    async (title: string) => {
      const { content } = await api.readNote(title);
      const parsed = parseMarkdown(content);
      const initial = parsed.length > 0 ? parsed : [newBlock()];
      skipAutosaveRef.current = true;
      setCurrentTitle(title);
      setBlocks(initial);
      setFocusedId(initial[0].id);
      setEditingTitle(false);
      const links = await api.getBacklinks(title).catch(() => []);
      setBacklinks(links);
      await refreshList();
    },
    [refreshList],
  );

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
    const t = setTimeout(() => {
      api.writeNote(currentTitle, serializeMarkdown(blocks)).then(refreshList);
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
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── derived lists ─────────────────────────────────────────────────────────

  const weeklyTitles = allTitles.filter(isWeeklyTitle).sort().reverse();
  const journalTitles = allTitles.filter((t) => t.startsWith("journals/"));
  const otherTitles = allTitles.filter(
    (t) => !t.startsWith("journals/") && !isWeeklyTitle(t) && !favorites.includes(t),
  );
  const isFav = currentTitle != null && favorites.includes(currentTitle);

  // ── render ────────────────────────────────────────────────────────────────

  if (phase === "loading") return <div className="loading">Loading…</div>;

  if (phase === "pick-vault") {
    return <VaultPicker recentVaults={recentVaults} onVaultSelected={onVaultSelected} />;
  }

  return (
    <div className="app">
      {showSearch && (
        <SearchModal onOpen={createOrOpen} onClose={() => setShowSearch(false)} />
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
          {journalTitles.length > 0 && (
            <NoteSection
              label="📅 Journals"
              titles={journalTitles}
              current={currentTitle}
              onOpen={openNote}
              displayName={(t) => t.replace("journals/", "")}
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
              showProperties={showProperties}
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
  const [collapsed, setCollapsed] = useState(false);
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
