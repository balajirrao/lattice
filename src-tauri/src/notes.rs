use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum NoteError {
    #[error("invalid title: {0}")]
    InvalidTitle(String),
    #[error("io error: {0}")]
    Io(#[from] io::Error),
}

impl Serialize for NoteError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

#[derive(Serialize, Clone)]
pub struct Note {
    pub title: String,
    pub content: String,
}

#[derive(Serialize)]
pub struct SearchResult {
    pub title: String,
    pub excerpt: String,
}

pub struct Notes {
    dir: PathBuf,
}

impl Notes {
    /// Create a new Notes store, creating the directory if needed.
    pub fn new(dir: impl Into<PathBuf>) -> io::Result<Self> {
        let dir = dir.into();
        fs::create_dir_all(&dir)?;
        Ok(Self { dir })
    }

    /// Open an existing vault directory without creating it.
    pub fn open(dir: impl Into<PathBuf>) -> Self {
        Self { dir: dir.into() }
    }

    /// List all notes recursively, returning titles relative to vault root.
    /// Titles use `/` as separator (e.g. `journals/20260417`).
    /// Hidden directories (starting with `.`) are skipped.
    pub fn list(&self) -> io::Result<Vec<String>> {
        let mut out = Vec::new();
        self.collect_titles(&self.dir, &mut out)?;
        out.sort();
        Ok(out)
    }

    fn collect_titles(&self, dir: &Path, out: &mut Vec<String>) -> io::Result<()> {
        let entries = match fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return Ok(()),
        };
        for entry in entries {
            let entry = entry?;
            let path = entry.path();
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if path.is_dir() {
                if !name.starts_with('.') {
                    self.collect_titles(&path, out)?;
                }
            } else if path.extension().and_then(|s| s.to_str()) == Some("md") {
                if let Ok(rel) = path.strip_prefix(&self.dir) {
                    let s = rel.to_string_lossy();
                    out.push(s.trim_end_matches(".md").replace('\\', "/"));
                }
            }
        }
        Ok(())
    }

    pub fn read(&self, title: &str) -> Result<Note, NoteError> {
        let path = self.file_path(title)?;
        let content = match fs::read_to_string(&path) {
            Ok(c) => c,
            Err(e) if e.kind() == io::ErrorKind::NotFound => String::new(),
            Err(e) => return Err(e.into()),
        };
        Ok(Note { title: title.to_string(), content })
    }

    pub fn write(&self, title: &str, content: &str) -> Result<(), NoteError> {
        let path = self.file_path(title)?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&path, content)?;
        Ok(())
    }

    pub fn delete(&self, title: &str) -> Result<(), NoteError> {
        let path = self.file_path(title)?;
        match fs::remove_file(&path) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e.into()),
        }
    }

    pub fn rename(&self, old_title: &str, new_title: &str) -> Result<(), NoteError> {
        let old_path = self.file_path(old_title)?;
        let new_path = self.file_path(new_title)?;
        if let Some(parent) = new_path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::rename(&old_path, &new_path)?;
        Ok(())
    }

    pub fn search(&self, query: &str) -> io::Result<Vec<SearchResult>> {
        if query.trim().is_empty() {
            return Ok(Vec::new());
        }
        let q = query.to_lowercase();
        let mut results = Vec::new();
        for title in self.list()? {
            let path = match self.file_path(&title) {
                Ok(p) => p,
                Err(_) => continue,
            };
            let content = fs::read_to_string(&path).unwrap_or_default();
            let hits_title = title.to_lowercase().contains(&q);
            let hits_body = content.to_lowercase().contains(&q);
            if hits_title || hits_body {
                results.push(SearchResult {
                    title,
                    excerpt: make_excerpt(&content, &q),
                });
            }
        }
        Ok(results)
    }

    /// Return titles of all notes that contain a `[[title]]` reference.
    pub fn backlinks(&self, title: &str) -> io::Result<Vec<String>> {
        let needle = format!("[[{}]]", title).to_lowercase();
        let mut links = Vec::new();
        for t in self.list()? {
            if t == title {
                continue;
            }
            let path = match self.file_path(&t) {
                Ok(p) => p,
                Err(_) => continue,
            };
            let content = fs::read_to_string(&path).unwrap_or_default();
            if content.to_lowercase().contains(&needle) {
                links.push(t);
            }
        }
        Ok(links)
    }

    pub fn get_favorites(&self) -> Vec<String> {
        let path = self.dir.join(".lattice").join("favorites.json");
        let data = fs::read_to_string(&path).unwrap_or_default();
        serde_json::from_str(&data).unwrap_or_default()
    }

    pub fn set_favorites(&self, favorites: &[String]) -> io::Result<()> {
        let dir = self.dir.join(".lattice");
        fs::create_dir_all(&dir)?;
        let data = serde_json::to_string_pretty(favorites)
            .map_err(|e| io::Error::new(io::ErrorKind::Other, e))?;
        fs::write(dir.join("favorites.json"), data)
    }

    fn file_path(&self, title: &str) -> Result<PathBuf, NoteError> {
        let rel = safe_path(title)?;
        Ok(self.dir.join(rel).with_extension("md"))
    }
}

/// Validate a title that may include exactly one `/` for subdirectory placement.
/// Each path component must be non-empty, not `.` or `..`, not start with `.`.
pub fn safe_path(title: &str) -> Result<PathBuf, NoteError> {
    let t = title.trim();
    if t.is_empty() {
        return Err(NoteError::InvalidTitle(title.to_string()));
    }
    let components: Vec<&str> = t.split('/').collect();
    if components.len() > 2 {
        return Err(NoteError::InvalidTitle(title.to_string()));
    }
    let mut path = PathBuf::new();
    for part in &components {
        let p = part.trim();
        if p.is_empty()
            || p == "."
            || p == ".."
            || p.starts_with('.')
            || p.contains('\\')
            || p.contains('\0')
        {
            return Err(NoteError::InvalidTitle(title.to_string()));
        }
        path.push(p);
    }
    Ok(path)
}

fn make_excerpt(content: &str, query: &str) -> String {
    let lower = content.to_lowercase();
    let pos = lower.find(query).unwrap_or(0);
    let start = pos.saturating_sub(40);
    let end = (pos + query.len() + 80).min(content.len());
    // Safety: slice at byte boundaries by walking to valid char boundaries
    let s = content
        .char_indices()
        .skip_while(|(i, _)| *i < start)
        .take_while(|(i, _)| *i < end)
        .map(|(_, c)| c)
        .collect::<String>();
    s.trim().chars().take(120).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn fixture() -> (TempDir, Notes) {
        let tmp = TempDir::new().unwrap();
        let notes = Notes::new(tmp.path()).unwrap();
        (tmp, notes)
    }

    #[test]
    fn write_then_read_roundtrip() {
        let (_tmp, notes) = fixture();
        notes.write("foo", "- hello\n").unwrap();
        let r = notes.read("foo").unwrap();
        assert_eq!(r.title, "foo");
        assert_eq!(r.content, "- hello\n");
    }

    #[test]
    fn read_missing_returns_empty() {
        let (_tmp, notes) = fixture();
        assert_eq!(notes.read("nope").unwrap().content, "");
    }

    #[test]
    fn list_returns_sorted_titles() {
        let (_tmp, notes) = fixture();
        notes.write("b", "").unwrap();
        notes.write("a", "").unwrap();
        notes.write("c", "").unwrap();
        assert_eq!(notes.list().unwrap(), vec!["a", "b", "c"]);
    }

    #[test]
    fn list_is_recursive_and_strips_md() {
        let (_tmp, notes) = fixture();
        notes.write("journals/20260417", "").unwrap();
        notes.write("regular", "").unwrap();
        let list = notes.list().unwrap();
        assert!(list.contains(&"journals/20260417".to_string()));
        assert!(list.contains(&"regular".to_string()));
    }

    #[test]
    fn list_skips_hidden_dirs() {
        let (tmp, notes) = fixture();
        fs::create_dir_all(tmp.path().join(".lattice")).unwrap();
        fs::write(tmp.path().join(".lattice").join("secret.md"), "x").unwrap();
        notes.write("visible", "").unwrap();
        let list = notes.list().unwrap();
        assert_eq!(list, vec!["visible"]);
    }

    #[test]
    fn list_ignores_non_markdown_files() {
        let (tmp, notes) = fixture();
        fs::write(tmp.path().join("readme.txt"), "hi").unwrap();
        notes.write("real", "").unwrap();
        assert_eq!(notes.list().unwrap(), vec!["real"]);
    }

    #[test]
    fn delete_removes_file() {
        let (tmp, notes) = fixture();
        notes.write("gone", "").unwrap();
        notes.delete("gone").unwrap();
        assert!(!tmp.path().join("gone.md").exists());
    }

    #[test]
    fn delete_missing_is_ok() {
        let (_tmp, notes) = fixture();
        assert!(notes.delete("ghost").is_ok());
    }

    #[test]
    fn overwrite_replaces_content() {
        let (_tmp, notes) = fixture();
        notes.write("n", "first").unwrap();
        notes.write("n", "second").unwrap();
        assert_eq!(notes.read("n").unwrap().content, "second");
    }

    #[test]
    fn rename_moves_file() {
        let (tmp, notes) = fixture();
        notes.write("old", "content").unwrap();
        notes.rename("old", "new").unwrap();
        assert!(!tmp.path().join("old.md").exists());
        assert_eq!(notes.read("new").unwrap().content, "content");
    }

    #[test]
    fn rename_into_subdir_creates_dir() {
        let (tmp, notes) = fixture();
        notes.write("flat", "data").unwrap();
        notes.rename("flat", "sub/flat").unwrap();
        assert!(tmp.path().join("sub").join("flat.md").exists());
    }

    #[test]
    fn write_to_subdir_creates_parents() {
        let (tmp, notes) = fixture();
        notes.write("journals/20260417", "- today").unwrap();
        assert!(tmp.path().join("journals").join("20260417.md").exists());
        assert_eq!(notes.read("journals/20260417").unwrap().content, "- today");
    }

    #[test]
    fn search_finds_by_content() {
        let (_tmp, notes) = fixture();
        notes.write("a", "hello world").unwrap();
        notes.write("b", "nothing here").unwrap();
        let results = notes.search("hello").unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].title, "a");
    }

    #[test]
    fn search_finds_by_title() {
        let (_tmp, notes) = fixture();
        notes.write("meeting-notes", "some content").unwrap();
        let results = notes.search("meeting").unwrap();
        assert_eq!(results.len(), 1);
    }

    #[test]
    fn search_is_case_insensitive() {
        let (_tmp, notes) = fixture();
        notes.write("x", "Hello World").unwrap();
        assert_eq!(notes.search("HELLO").unwrap().len(), 1);
    }

    #[test]
    fn search_empty_returns_empty() {
        let (_tmp, notes) = fixture();
        notes.write("x", "content").unwrap();
        assert!(notes.search("").unwrap().is_empty());
    }

    #[test]
    fn backlinks_finds_referencing_notes() {
        let (_tmp, notes) = fixture();
        notes.write("target", "I am the target").unwrap();
        notes.write("ref1", "see [[target]] for details").unwrap();
        notes.write("ref2", "unrelated content").unwrap();
        let links = notes.backlinks("target").unwrap();
        assert_eq!(links, vec!["ref1"]);
    }

    #[test]
    fn backlinks_excludes_self() {
        let (_tmp, notes) = fixture();
        notes.write("self", "[[self]] reference").unwrap();
        assert!(notes.backlinks("self").unwrap().is_empty());
    }

    #[test]
    fn favorites_roundtrip() {
        let (_tmp, notes) = fixture();
        assert!(notes.get_favorites().is_empty());
        notes.set_favorites(&["a".to_string(), "b".to_string()]).unwrap();
        assert_eq!(notes.get_favorites(), vec!["a", "b"]);
    }

    #[test]
    fn safe_path_rejects_traversal() {
        assert!(safe_path("../escape").is_err());
        assert!(safe_path("a/b/c").is_err()); // 3 components
        assert!(safe_path("").is_err());
        assert!(safe_path(".hidden").is_err());
        assert!(safe_path("a/.hidden").is_err());
        assert!(safe_path(".").is_err());
        assert!(safe_path("..").is_err());
    }

    #[test]
    fn safe_path_accepts_valid_titles() {
        assert!(safe_path("My Note").is_ok());
        assert!(safe_path("journals/20260417").is_ok());
        assert!(safe_path("日記").is_ok());
        assert_eq!(
            safe_path("journals/20260417").unwrap(),
            PathBuf::from("journals").join("20260417")
        );
    }

    #[test]
    fn daily_note_format_works() {
        let (_tmp, notes) = fixture();
        notes.write("journals/20260417", "- today").unwrap();
        assert!(notes.list().unwrap().contains(&"journals/20260417".to_string()));
    }

    #[test]
    fn new_creates_dir_if_missing() {
        let tmp = TempDir::new().unwrap();
        let nested = tmp.path().join("sub").join("vault");
        let notes = Notes::new(&nested).unwrap();
        assert!(nested.exists());
        notes.write("x", "y").unwrap();
        assert_eq!(notes.read("x").unwrap().content, "y");
    }

    #[test]
    fn write_with_bad_title_does_not_create_file() {
        let (tmp, notes) = fixture();
        assert!(notes.write("../escape", "pwn").is_err());
        assert_eq!(fs::read_dir(tmp.path()).unwrap().count(), 0);
    }
}
