# Lattice

A minimal Logseq-style outliner note-taking app built with Tauri v2 (Rust) + React (TypeScript). Notes are stored as plain markdown files in a user-chosen vault folder.

## Commands

```bash
npm test              # run vitest (core logic tests only, fast)
npm run test:watch    # vitest in watch mode
npm run build:vite    # build frontend (required before cargo test)
npm run dev           # launch Tauri desktop app (starts Vite + Rust binary)
npm run build         # production bundle

cd src-tauri
cargo test            # run Rust tests (requires dist/ to exist from build:vite)
cargo build           # compile debug binary
```

## Architecture

```
lattice/
├── src/
│   ├── core/          # pure TS, zero DOM/React/Tauri deps — unit-testable in isolation
│   │   ├── block.ts       # Block type, TodoState, id generator, resetIdCounter()
│   │   ├── tree.ts        # immutable tree ops: locate, flatten, insert, indent, outdent, remove, setState, cycleState
│   │   ├── markdown.ts    # parseMarkdown / serializeMarkdown (format: -text, 2-space indent)
│   │   ├── inline.ts      # parseInline: [[link]], **bold**, _italic_, #tag → typed parts
│   │   ├── links.ts       # legacy renderTextParts (kept for existing tests)
│   │   └── index.ts       # barrel export
│   ├── ui/            # React components, thin layer over core
│   │   ├── App.tsx        # vault lifecycle, sidebar, note open/rename/delete/favorites
│   │   ├── Outliner.tsx   # block editor: Enter/Tab/Shift-Tab/Backspace/↑↓/⌘Enter
│   │   ├── VaultPicker.tsx# first-launch vault selection screen
│   │   ├── SearchModal.tsx# ⌘K full-text search overlay
│   │   └── api.ts         # invoke() wrappers for all Tauri commands
│   ├── main.tsx       # React entry
│   └── styles.css
└── src-tauri/
    ├── src/
    │   ├── main.rs    # Tauri builder, AppState { vault: Mutex<Option<PathBuf>> }
    │   ├── notes.rs   # Notes struct: list/read/write/delete/rename/search/backlinks/favorites
    │   └── config.rs  # ~/.config/lattice/config.json: current_vault + recent_vaults
    ├── capabilities/default.json  # core:default + dialog:allow-open
    ├── tauri.conf.json
    └── Cargo.toml
```

## Core design principles

- **Testability first**: `src/core/` has no side effects. All tree operations are pure functions that take and return `Block[]`. Tests call them directly with no mocking.
- **Immutable tree ops**: every operation in `tree.ts` clones the tree before mutating. The input is never changed.
- **IDs for tests**: `genId()` uses a monotonic counter; `resetIdCounter()` lets tests seed deterministic IDs.

## Markdown format

Notes are stored as nested bullet lists with **no space** between the dash and text:

```
-Block text here
  -Child block
  -TODO task item
    -DOING nested task
-DONE finished item
```

- 2-space indent per depth level
- State prefix: `TODO`, `DOING`, `DONE` immediately after `-`, followed by space then text
- Parser accepts both `-text` (canonical) and `- text` (legacy) for backward compatibility
- `[[Page Title]]` links are stored verbatim in text; parsed visually on render

## Vault structure

```
~/chosen-vault/
├── .lattice/
│   └── favorites.json    # ["Note Title", ...]
├── journals/
│   └── 20260417.md       # daily notes (YYYYMMDD format)
├── 20260417143022.md     # Zettelkasten notes (timestamp ID)
└── My Note.md
```

- Hidden dirs (`.`) are skipped during listing
- Notes titles use `/` as path separator: `journals/20260417`
- Max 2 path components (one level of subdirectory)

## Tauri commands

| Command | Description |
|---|---|
| `get_config` | Load `~/.config/lattice/config.json` |
| `cmd_set_vault(path)` | Set vault, update recents, create dir |
| `list_notes` | Recursive `.md` listing, sorted |
| `read_note(title)` | Read file; returns empty string if missing |
| `write_note(title, content)` | Write file, creates subdirs as needed |
| `delete_note(title)` | Delete file (missing = ok) |
| `rename_note(old, new)` | fs::rename, creates target subdirs |
| `search_notes(query)` | Case-insensitive grep across vault |
| `get_backlinks(title)` | Notes containing `[[title]]` |
| `get_favorites` / `set_favorites` | `.lattice/favorites.json` |

## Keyboard shortcuts

| Key | Action |
|---|---|
| `Enter` | New block (sibling, or first child if current has children) |
| `Tab` | Indent block (nest under previous sibling) |
| `Shift+Tab` | Outdent block |
| `Backspace` on empty block | Delete block |
| `↑` / `↓` | Move focus between blocks (respects collapsed state) |
| `⌘Enter` (or `Ctrl+Enter`) | Cycle TODO → DOING → DONE → null |
| `⌘K` | Open search modal |

## Testing

```bash
npm test          # 78 TS tests across 5 files
cargo test        # 24 Rust tests (notes.rs: roundtrip, search, backlinks, path safety)
```

All tests are deterministic and hermetic:
- TS: no mocks, no DOM, pure function calls
- Rust: each test creates a `TempDir`, no shared state

## Key files to know

- [`src/core/tree.ts`](src/core/tree.ts) — all block manipulation logic
- [`src/core/markdown.ts`](src/core/markdown.ts) — serialize/parse (change format here)
- [`src-tauri/src/notes.rs`](src-tauri/src/notes.rs) — FS layer + `safe_path` security
- [`src-tauri/src/config.rs`](src-tauri/src/config.rs) — vault persistence
- [`src/ui/Outliner.tsx`](src/ui/Outliner.tsx) — keyboard handling, auto-bracket, collapse
