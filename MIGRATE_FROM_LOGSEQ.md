# Migrate a Logseq vault to Lattice

Paste the prompt below into a fresh Claude Code session with access to your
Logseq vault directory. It rewrites the vault **in place**, so:

> **Back up first.** `cp -R ~/my-vault ~/my-vault.backup` — or do it on a
> git-tracked copy so you can diff and revert.

## Prompt

```
Migrate a Logseq vault to Lattice format, in place.

Vault: <PUT LOGSEQ VAULT PATH HERE>

Lattice format rules (read before touching files):

1. Bullet: "-text" (no space between dash and text is canonical, but
   "- text" is accepted; normalize to "-text").
2. Indent: exactly 2 spaces per depth level. Convert any tab to 2 spaces.
3. State keywords sit immediately after the dash: "-TODO foo", "-DONE bar".
   Valid states: TODO, DOING, DONE, QUESTION, ANSWERED, IDEA, WAITING.
   Map Logseq states: TODO→TODO, DOING→DOING, DONE→DONE, LATER→TODO,
   NOW→DOING, WAITING→WAITING, CANCELED→drop the state keyword entirely
   (convert the line to a plain block).
4. Links like [[Page Title]] are stored verbatim — pass through untouched.
5. Properties on a block use @key(value) inline, not Logseq's "key:: value"
   on the next line. If a child line matches /^[a-z][a-z0-9_-]*::\s*/, fold
   it into its parent as @key(value). Strip YAML frontmatter at the top of
   files entirely (don't try to preserve it).
6. Journals live under journals/ and are named YYYYMMDD.md (e.g.
   20240115.md). Convert Logseq's YYYY_MM_DD.md by removing underscores.
   Non-journal pages: keep the filename, but replace "%2F" or "___" path
   separators with "/" subdirectory (max one level deep).

Steps (do all of this without asking for approval):

1. Walk the vault. For each .md file, determine its new path:
   - journals/YYYY_MM_DD.md → journals/YYYYMMDD.md
   - pages/Foo.md          → Foo.md         (move up out of pages/)
   - pages/Foo%2FBar.md    → Foo/Bar.md     (create subdir)
   - skip logseq/, assets/, and any dotfiles/dotdirs.

2. For each file: strip YAML frontmatter, convert tabs→2 spaces, normalize
   bullets ("- " → "-"), fold "key:: value" child lines into their parent
   as @key(value), remap state keywords per rule 3.

3. Write the transformed content back. If the target path differs from the
   source path, write to the new path and delete the old file. Create any
   needed subdirectories. Do NOT create a .lattice/ folder — Lattice
   creates that on first launch.

4. After migrating, print a summary: files migrated, files renamed
   (old → new), files skipped (with reason), and any lines that didn't
   match a known pattern (show the file + line number so I can eyeball
   them).
```
```

## Checking the result

Open the migrated vault in Lattice. Spot-check:

- A daily note (`⌘T` for this week won't show old dailies — open any
  `journals/*` file from the sidebar).
- `⌘O` to see all open TODOs across the vault.
- A page with `[[links]]` — verify backlinks show up.
